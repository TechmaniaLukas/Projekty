import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { logAction } from "./lib/audit";
import {
  canCreateProject,
  canEditProject,
  canViewProject,
  canArchiveProject,
  isAdmin,
  isPm,
  isDeptLead,
  isProjectMemberOrAssignee,
} from "./lib/permissions";
import {
  PROJECT_DEPARTMENTS,
  PROJECT_STATUSES,
  PRIORITIES,
} from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

const projectDepartment = v.union(...PROJECT_DEPARTMENTS.map((d) => v.literal(d)));
const projectStatus = v.union(...PROJECT_STATUSES.map((s) => v.literal(s)));
const priority = v.union(...PRIORITIES.map((p) => v.literal(p)));

export const list = query({
  args: {
    department: v.optional(projectDepartment),
    status: v.optional(projectStatus),
    includeArchived: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);

    let projects: Doc<"projects">[];

    if (args.search && args.search.trim()) {
      projects = await ctx.db
        .query("projects")
        .withSearchIndex("search_name", (q) => {
          let s = q.search("name", args.search!.trim());
          if (args.department) s = s.eq("department", args.department);
          if (args.status) s = s.eq("status", args.status);
          return s;
        })
        .collect();
    } else if (args.department) {
      projects = await ctx.db
        .query("projects")
        .withIndex("by_department", (q) => q.eq("department", args.department!))
        .collect();
    } else {
      projects = await ctx.db.query("projects").collect();
    }

    if (!args.includeArchived) {
      projects = projects.filter((p) => p.status !== "archived");
    }
    projects = projects.filter((p) => p.isTemplate !== true);
    if (args.status) {
      projects = projects.filter((p) => p.status === args.status);
    }

    if (isAdmin(me) || isPm(me)) {
      return projects;
    }
    if (isDeptLead(me)) {
      return projects.filter(
        (p) => p.department === "cross" || p.department === me.department,
      );
    }
    const visible: Doc<"projects">[] = [];
    for (const p of projects) {
      if (await isProjectMemberOrAssignee(ctx, p._id, me._id)) visible.push(p);
    }
    return visible;
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const allowed = await canViewProject(ctx, me, project);
    if (!allowed) return null;
    return project;
  },
});

/**
 * Agregovaný stavový report projektu pro PDF / poradu vedení.
 */
export const report = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    if (!(await canViewProject(ctx, me, project))) return null;

    const now = Date.now();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const milestones = await ctx.db
      .query("milestones")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const owner = project.ownerId ? await ctx.db.get(project.ownerId) : null;

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === "done").length;
    const progressPercent =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const byStatus: Record<string, number> = {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      review: 0,
      done: 0,
    };
    for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

    // Prošlé úkoly
    const overdueTasks = tasks
      .filter(
        (t) =>
          t.deadline &&
          t.deadline < now &&
          t.status !== "done",
      )
      .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));

    // Rizika: blokované úkoly + zamítnuté milníky + prošlé milníky
    const blockedTasks = tasks.filter((t) => t.status === "blocked");
    const rejectedMilestones = milestones.filter(
      (m) => m.status === "rejected",
    );
    const overdueMilestones = milestones.filter(
      (m) =>
        m.dueDate < now &&
        m.status !== "approved",
    );

    // Assignee jména pro prošlé úkoly
    const assigneeIds = Array.from(
      new Set(
        overdueTasks
          .map((t) => t.assigneeId as string | undefined)
          .filter((x): x is string => !!x),
      ),
    );
    const assignees = await Promise.all(
      assigneeIds.map((id) => ctx.db.get(id as typeof project.ownerId)),
    );
    const assigneeName = new Map<string, string>();
    for (const a of assignees) {
      if (a) assigneeName.set(a._id as string, a.name ?? a.email ?? "—");
    }

    const milestoneSummary = milestones
      .slice()
      .sort((a, b) => a.order - b.order || a.dueDate - b.dueDate)
      .map((m) => {
        const linked = tasks.filter((t) => t.milestoneId === m._id);
        const d = linked.filter((t) => t.status === "done").length;
        return {
          _id: m._id,
          title: m.title,
          status: m.status,
          dueDate: m.dueDate,
          taskTotal: linked.length,
          taskDone: d,
          percent:
            linked.length > 0 ? Math.round((d / linked.length) * 100) : null,
        };
      });

    return {
      generatedAt: now,
      project: {
        name: project.name,
        description: project.description ?? null,
        department: project.department,
        status: project.status,
        priority: project.priority,
        deadline: project.deadline ?? null,
        startDate: project.startDate ?? null,
        ownerName: owner?.name ?? owner?.email ?? null,
      },
      progress: {
        totalTasks,
        doneTasks,
        progressPercent,
        byStatus,
      },
      milestones: milestoneSummary,
      overdueTasks: overdueTasks.map((t) => ({
        _id: t._id,
        title: t.title,
        deadline: t.deadline ?? 0,
        status: t.status,
        assignee: t.assigneeId
          ? (assigneeName.get(t.assigneeId as string) ?? "—")
          : null,
      })),
      risks: {
        blockedTasks: blockedTasks.map((t) => ({
          _id: t._id,
          title: t.title,
        })),
        rejectedMilestones: rejectedMilestones.map((m) => ({
          _id: m._id,
          title: m.title,
          reason: m.rejectionReason ?? null,
        })),
        overdueMilestones: overdueMilestones.map((m) => ({
          _id: m._id,
          title: m.title,
          dueDate: m.dueDate,
        })),
      },
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    department: projectDepartment,
    status: v.optional(projectStatus),
    priority: v.optional(priority),
    deadline: v.optional(v.number()),
    startDate: v.optional(v.number()),
    ownerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!canCreateProject(me, args.department)) {
      throw new ConvexError("Nemáte oprávnění vytvořit projekt v tomto oddělení");
    }
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) throw new ConvexError("Vlastník nenalezen");

    const id = await ctx.db.insert("projects", {
      name: args.name,
      description: args.description,
      ownerId: args.ownerId,
      department: args.department,
      status: args.status ?? "planning",
      priority: args.priority ?? "medium",
      deadline: args.deadline,
      startDate: args.startDate,
      createdBy: me._id,
    });
    await logAction(ctx, {
      actor: me,
      action: "project.create",
      entityType: "project",
      entityId: id,
      projectId: id,
      summary: `Vytvořil projekt „${args.name}"`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    ownerId: v.optional(v.id("users")),
    department: v.optional(projectDepartment),
    status: v.optional(projectStatus),
    priority: v.optional(priority),
    deadline: v.optional(v.union(v.number(), v.null())),
    startDate: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canEditProject(me, project)) {
      throw new ConvexError("Nemáte oprávnění editovat projekt");
    }

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.ownerId !== undefined) patch.ownerId = args.ownerId;
    if (args.department !== undefined) patch.department = args.department;
    if (args.status !== undefined) patch.status = args.status;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.deadline !== undefined) {
      patch.deadline = args.deadline === null ? undefined : args.deadline;
    }
    if (args.startDate !== undefined) {
      patch.startDate = args.startDate === null ? undefined : args.startDate;
    }
    await ctx.db.patch(args.projectId, patch);
    await logAction(ctx, {
      actor: me,
      action: "project.update",
      entityType: "project",
      entityId: args.projectId,
      projectId: args.projectId,
      summary: `Upravil projekt „${args.name ?? project.name}"`,
      details: patch,
    });
  },
});

export const archive = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canArchiveProject(me, project)) {
      throw new ConvexError("Nemáte oprávnění archivovat tento projekt");
    }
    await ctx.db.patch(args.projectId, { status: "archived" });
    await logAction(ctx, {
      actor: me,
      action: "project.archive",
      entityType: "project",
      entityId: args.projectId,
      projectId: args.projectId,
      summary: `Archivoval projekt „${project.name}"`,
    });
  },
});

export const unarchive = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canArchiveProject(me, project)) {
      throw new ConvexError("Nemáte oprávnění");
    }
    await ctx.db.patch(args.projectId, { status: "active" });
    await logAction(ctx, {
      actor: me,
      action: "project.unarchive",
      entityType: "project",
      entityId: args.projectId,
      projectId: args.projectId,
      summary: `Obnovil projekt „${project.name}"`,
    });
  },
});

export const taskStats = query({
  args: { projectIds: v.array(v.id("projects")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const stats: Record<string, { total: number; done: number; overdue: number }> = {};
    const now = Date.now();
    for (const projectId of args.projectIds) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      const done = tasks.filter((t) => t.status === "done").length;
      const overdue = tasks.filter(
        (t) => t.status !== "done" && t.deadline !== undefined && t.deadline < now,
      ).length;
      stats[projectId as string] = { total: tasks.length, done, overdue };
    }
    return stats;
  },
});

export const listMembers = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    const allowed = await canViewProject(ctx, me, project);
    if (!allowed) return [];
    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const out: Array<{
      membershipId: Id<"projectMembers">;
      role: "watcher" | "contributor";
      user: Doc<"users"> | null;
    }> = [];
    for (const m of memberships) {
      out.push({ membershipId: m._id, role: m.role, user: await ctx.db.get(m.userId) });
    }
    return out;
  },
});

export const addMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    role: v.union(v.literal("watcher"), v.literal("contributor")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canEditProject(me, project)) {
      throw new ConvexError("Nemáte oprávnění");
    }
    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role });
      return existing._id;
    }
    return await ctx.db.insert("projectMembers", {
      projectId: args.projectId,
      userId: args.userId,
      role: args.role,
    });
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    const monthAgo = now - 30 * 24 * 3600 * 1000;

    const projects = await ctx.db.query("projects").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const users = await ctx.db.query("users").collect();

    const projectsByDept: Record<string, { active: number; on_hold: number; done: number; planning: number; total: number }> = {};
    for (const dep of ["it", "facility", "vyroba", "cross"]) {
      projectsByDept[dep] = { active: 0, on_hold: 0, done: 0, planning: 0, total: 0 };
    }
    for (const p of projects) {
      if (p.status === "archived") continue;
      const bucket = projectsByDept[p.department];
      if (!bucket) continue;
      bucket.total += 1;
      if (p.status === "active") bucket.active += 1;
      if (p.status === "on_hold") bucket.on_hold += 1;
      if (p.status === "done") bucket.done += 1;
      if (p.status === "planning") bucket.planning += 1;
    }

    const tasksByStatus: Record<string, number> = {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      review: 0,
      done: 0,
    };
    const tasksByPriority: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    let openTotal = 0;
    let overdue = 0;
    let dueThisWeek = 0;
    let completedThisWeek = 0;
    let completedThisMonth = 0;

    const archivedProjectIds = new Set(
      projects.filter((p) => p.status === "archived").map((p) => p._id),
    );

    const openTasksByAssignee: Record<string, number> = {};
    for (const t of tasks) {
      if (archivedProjectIds.has(t.projectId)) continue;
      tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1;
      tasksByPriority[t.priority] = (tasksByPriority[t.priority] ?? 0) + 1;
      if (t.status !== "done") {
        openTotal += 1;
        if (t.assigneeId) {
          openTasksByAssignee[t.assigneeId as string] =
            (openTasksByAssignee[t.assigneeId as string] ?? 0) + 1;
        }
        if (t.deadline && t.deadline < now) overdue += 1;
        if (t.deadline && t.deadline >= now && t.deadline <= now + 7 * 24 * 3600 * 1000)
          dueThisWeek += 1;
      }
      if (t.status === "done" && t.completedAt) {
        if (t.completedAt >= weekAgo) completedThisWeek += 1;
        if (t.completedAt >= monthAgo) completedThisMonth += 1;
      }
    }

    const topAssignees = Object.entries(openTasksByAssignee)
      .map(([userId, count]) => {
        const u = users.find((x) => x._id === userId);
        return {
          userId,
          name: u?.name ?? u?.email ?? "Neznámý",
          email: u?.email ?? null,
          department: u?.department ?? null,
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      projectsByDept,
      tasksByStatus,
      tasksByPriority,
      openTotal,
      overdue,
      dueThisWeek,
      completedThisWeek,
      completedThisMonth,
      topAssignees,
      totals: {
        projects: projects.filter((p) => p.status !== "archived").length,
        tasks: tasks.length,
      },
    };
  },
});

type ActivityEvent =
  | {
      kind: "task_created";
      at: number;
      taskId: Id<"tasks">;
      taskTitle: string;
      actorId: Id<"users"> | null;
    }
  | {
      kind: "task_done";
      at: number;
      taskId: Id<"tasks">;
      taskTitle: string;
      actorId: Id<"users"> | null;
    }
  | {
      kind: "comment_added";
      at: number;
      taskId: Id<"tasks">;
      taskTitle: string;
      actorId: Id<"users">;
      preview: string;
    }
  | {
      kind: "attachment_added";
      at: number;
      taskId: Id<"tasks">;
      taskTitle: string;
      actorId: Id<"users">;
      fileName: string;
    };

export const recentActivity = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    const allowed = await canViewProject(ctx, me, project);
    if (!allowed) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const events: ActivityEvent[] = [];
    const taskTitleById = new Map<string, string>();
    for (const t of tasks) {
      taskTitleById.set(t._id, t.title);
      events.push({
        kind: "task_created",
        at: t._creationTime,
        taskId: t._id,
        taskTitle: t.title,
        actorId: t.createdBy ?? null,
      });
      if (t.status === "done" && t.completedAt) {
        events.push({
          kind: "task_done",
          at: t.completedAt,
          taskId: t._id,
          taskTitle: t.title,
          actorId: t.assigneeId ?? null,
        });
      }
    }

    for (const t of tasks) {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      for (const c of comments) {
        const preview =
          c.text.length > 100 ? c.text.slice(0, 100) + "…" : c.text;
        events.push({
          kind: "comment_added",
          at: c._creationTime,
          taskId: t._id,
          taskTitle: t.title,
          actorId: c.authorId,
          preview,
        });
      }
      const attachments = await ctx.db
        .query("attachments")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      for (const a of attachments) {
        events.push({
          kind: "attachment_added",
          at: a._creationTime,
          taskId: t._id,
          taskTitle: t.title,
          actorId: a.uploadedBy,
          fileName: a.fileName,
        });
      }
    }

    events.sort((a, b) => b.at - a.at);
    const limited = events.slice(0, args.limit ?? 50);

    const userIds = new Set<string>();
    for (const e of limited) if (e.actorId) userIds.add(e.actorId);
    const userById = new Map<string, Doc<"users">>();
    for (const id of userIds) {
      const u = await ctx.db.get(id as Id<"users">);
      if (u) userById.set(id, u);
    }

    return limited.map((e) => ({
      ...e,
      actor: e.actorId ? userById.get(e.actorId) ?? null : null,
    }));
  },
});

export const removeMember = mutation({
  args: { membershipId: v.id("projectMembers") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const m = await ctx.db.get(args.membershipId);
    if (!m) return;
    const project = await ctx.db.get(m.projectId);
    if (!project) return;
    if (!canEditProject(me, project)) {
      throw new ConvexError("Nemáte oprávnění");
    }
    await ctx.db.delete(args.membershipId);
  },
});
