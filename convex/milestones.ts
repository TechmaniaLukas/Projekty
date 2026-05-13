import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  canViewProject,
  canEditProject,
  isAdmin,
  isDirector,
  isPm,
  isDeptLead,
} from "./lib/permissions";
import { logAction } from "./lib/audit";
import { emit } from "./lib/notify";
import type { Doc, Id } from "./_generated/dataModel";

const milestoneStatus = v.union(
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
);

async function ensureProject(
  ctx: { db: { get: (id: any) => any } },
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new ConvexError("Projekt nenalezen");
  return project;
}

/**
 * Kdo může vytvářet/editovat milníky: admin, pm, owner, dept_lead svého oddělení.
 * Submit může kdokoliv s view access (typicky member přiřazený k projektu).
 * Approve/reject: pouze určený approverId nebo admin.
 */
function canManageMilestone(user: Doc<"users">, project: Doc<"projects">) {
  return canEditProject(user, project);
}

function canApproveMilestone(
  user: Doc<"users">,
  milestone: Doc<"milestones">,
): boolean {
  if (isAdmin(user)) return true;
  return milestone.approverId === user._id;
}

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ensureProject(ctx, args.projectId);
    if (!(await canViewProject(ctx, me, project))) return [];

    const items = await ctx.db
      .query("milestones")
      .withIndex("by_project_and_order", (q) => q.eq("projectId", args.projectId))
      .collect();

    items.sort((a, b) => a.order - b.order || a.dueDate - b.dueDate);
    return items;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.number(),
    approverId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ensureProject(ctx, args.projectId);
    if (!canManageMilestone(me, project)) {
      throw new ConvexError("Nemáte oprávnění přidat milník v tomto projektu");
    }

    const approver = await ctx.db.get(args.approverId);
    if (!approver) throw new ConvexError("Approver nenalezen");
    if (
      !isAdmin(approver) &&
      !isDirector(approver) &&
      !isPm(approver) &&
      !isDeptLead(approver)
    ) {
      throw new ConvexError(
        "Schvalovatelem může být jen admin, ředitel, PM nebo vedoucí oddělení",
      );
    }

    const existing = await ctx.db
      .query("milestones")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const maxOrder = existing.reduce((m, x) => Math.max(m, x.order), -1);

    const id = await ctx.db.insert("milestones", {
      projectId: args.projectId,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      dueDate: args.dueDate,
      order: maxOrder + 1,
      status: "planned",
      approverId: args.approverId,
      createdBy: me._id,
    });

    await logAction(ctx, {
      actor: me,
      action: "milestone.create",
      entityType: "milestone",
      entityId: id,
      projectId: args.projectId,
      summary: `Vytvořil milník „${args.title.trim()}" v projektu „${project.name}"`,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    milestoneId: v.id("milestones"),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    dueDate: v.optional(v.number()),
    approverId: v.optional(v.id("users")),
    status: v.optional(milestoneStatus),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new ConvexError("Milník nenalezen");
    const project = await ensureProject(ctx, milestone.projectId);
    if (!canManageMilestone(me, project)) {
      throw new ConvexError("Nemáte oprávnění upravit milník");
    }
    if (milestone.status === "submitted" || milestone.status === "approved") {
      // Po submitu/approve neměnit termín/title bez resetu — vyžaduje vrátit k přepracování
      if (args.title || args.dueDate || args.description !== undefined) {
        throw new ConvexError(
          "Milník byl odeslán/schválen. Pro úpravy obsahu jej vrať k přepracování (zamítnutí).",
        );
      }
    }
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.description !== undefined) {
      patch.description = args.description === null ? undefined : args.description.trim() || undefined;
    }
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.approverId !== undefined) {
      const approver = await ctx.db.get(args.approverId);
      if (!approver) throw new ConvexError("Approver nenalezen");
      patch.approverId = args.approverId;
    }
    if (args.status !== undefined) patch.status = args.status;
    if (args.order !== undefined) patch.order = args.order;
    await ctx.db.patch(args.milestoneId, patch);
  },
});

export const remove = mutation({
  args: { milestoneId: v.id("milestones") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return;
    const project = await ensureProject(ctx, milestone.projectId);
    if (!canManageMilestone(me, project)) {
      throw new ConvexError("Nemáte oprávnění smazat milník");
    }
    await ctx.db.delete(args.milestoneId);
    await logAction(ctx, {
      actor: me,
      action: "milestone.delete",
      entityType: "milestone",
      entityId: args.milestoneId,
      projectId: milestone.projectId,
      summary: `Smazal milník „${milestone.title}"`,
    });
  },
});

export const submit = mutation({
  args: {
    milestoneId: v.id("milestones"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new ConvexError("Milník nenalezen");
    const project = await ensureProject(ctx, milestone.projectId);
    if (!(await canViewProject(ctx, me, project))) {
      throw new ConvexError("Nemáte přístup k projektu");
    }
    if (milestone.status === "approved") {
      throw new ConvexError("Milník je už schválený");
    }
    if (milestone.status === "submitted") {
      throw new ConvexError("Milník už čeká na schválení");
    }
    await ctx.db.patch(args.milestoneId, {
      status: "submitted",
      submittedBy: me._id,
      submittedAt: Date.now(),
      submitNote: args.note?.trim() || undefined,
      rejectionReason: undefined,
    });
    await logAction(ctx, {
      actor: me,
      action: "milestone.submit",
      entityType: "milestone",
      entityId: args.milestoneId,
      projectId: milestone.projectId,
      summary: `Odeslal ke schválení milník „${milestone.title}"`,
    });
    // Notifikace approverovi
    await emit(ctx, {
      recipientId: milestone.approverId,
      actorId: me._id,
      type: "task_status_changed",
      projectId: milestone.projectId,
      title: `Milník „${milestone.title}" čeká na schválení`,
      body:
        args.note?.trim() ||
        `Odeslal: ${me.name ?? me.email ?? "—"} v projektu „${project.name}"`,
    });
  },
});

export const approve = mutation({
  args: { milestoneId: v.id("milestones") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new ConvexError("Milník nenalezen");
    const project = await ensureProject(ctx, milestone.projectId);
    if (!canApproveMilestone(me, milestone)) {
      throw new ConvexError("Schválit milník může jen určený schvalovatel");
    }
    if (milestone.status !== "submitted") {
      throw new ConvexError("Milník musí být ve stavu odesláno před schválením");
    }
    await ctx.db.patch(args.milestoneId, {
      status: "approved",
      decidedBy: me._id,
      decidedAt: Date.now(),
      rejectionReason: undefined,
    });
    await logAction(ctx, {
      actor: me,
      action: "milestone.approve",
      entityType: "milestone",
      entityId: args.milestoneId,
      projectId: milestone.projectId,
      summary: `Schválil milník „${milestone.title}"`,
    });
    if (milestone.submittedBy) {
      await emit(ctx, {
        recipientId: milestone.submittedBy,
        actorId: me._id,
        type: "task_status_changed",
        projectId: milestone.projectId,
        title: `Milník „${milestone.title}" byl schválen`,
        body: `Schválil ${me.name ?? me.email ?? "—"} v projektu „${project.name}"`,
      });
    }
  },
});

export const reject = mutation({
  args: {
    milestoneId: v.id("milestones"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new ConvexError("Milník nenalezen");
    const project = await ensureProject(ctx, milestone.projectId);
    if (!canApproveMilestone(me, milestone)) {
      throw new ConvexError("Vrátit milník k přepracování může jen schvalovatel");
    }
    if (milestone.status !== "submitted") {
      throw new ConvexError("Milník musí být ve stavu odesláno před zamítnutím");
    }
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Důvod zamítnutí je povinný");
    await ctx.db.patch(args.milestoneId, {
      status: "rejected",
      decidedBy: me._id,
      decidedAt: Date.now(),
      rejectionReason: reason,
    });
    await logAction(ctx, {
      actor: me,
      action: "milestone.reject",
      entityType: "milestone",
      entityId: args.milestoneId,
      projectId: milestone.projectId,
      summary: `Vrátil k přepracování milník „${milestone.title}": ${reason}`,
    });
    if (milestone.submittedBy) {
      await emit(ctx, {
        recipientId: milestone.submittedBy,
        actorId: me._id,
        type: "task_status_changed",
        projectId: milestone.projectId,
        title: `Milník „${milestone.title}" byl vrácen k přepracování`,
        body: reason,
      });
    }
  },
});

/**
 * Pro daného uživatele: milníky čekající na jeho schválení.
 * Slouží jako "in-box" v dashboardu.
 */
export const myPendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const items = await ctx.db
      .query("milestones")
      .withIndex("by_approver_and_status", (q) =>
        q.eq("approverId", me._id).eq("status", "submitted"),
      )
      .collect();
    items.sort((a, b) => a.dueDate - b.dueDate);

    const projectIds = Array.from(new Set(items.map((m) => m.projectId as string)));
    const projects = await Promise.all(
      projectIds.map((id) => ctx.db.get(id as Id<"projects">)),
    );
    const projectById = new Map<string, Doc<"projects">>();
    for (const p of projects) if (p) projectById.set(p._id as string, p);

    const submitterIds = Array.from(
      new Set(items.map((m) => m.submittedBy as string).filter(Boolean)),
    );
    const submitters = await Promise.all(
      submitterIds.map((id) => ctx.db.get(id as Id<"users">)),
    );
    const submitterById = new Map<string, Doc<"users">>();
    for (const u of submitters) if (u) submitterById.set(u._id as string, u);

    return items.map((m) => ({
      ...m,
      project: projectById.get(m.projectId as string) ?? null,
      submitter: m.submittedBy
        ? (submitterById.get(m.submittedBy as string) ?? null)
        : null,
    }));
  },
});
