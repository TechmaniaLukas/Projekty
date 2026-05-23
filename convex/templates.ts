import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { logAction } from "./lib/audit";
import {
  canCreateProject,
  canEditProject,
  canViewProject,
  isAdmin,
  isPm,
} from "./lib/permissions";
import {
  PROJECT_DEPARTMENTS,
  PRIORITIES,
} from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

const projectDepartment = v.union(...PROJECT_DEPARTMENTS.map((d) => v.literal(d)));
const priority = v.union(...PRIORITIES.map((p) => v.literal(p)));

export const list = query({
  args: { department: v.optional(projectDepartment) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const all = await ctx.db.query("projects").collect();
    const templates = all.filter((p) => p.isTemplate === true);
    const visible: Doc<"projects">[] = [];
    for (const t of templates) {
      if (args.department && t.department !== args.department && t.department !== "cross") {
        continue;
      }
      if (isAdmin(me) || isPm(me)) {
        visible.push(t);
      } else if (await canViewProject(ctx, me, t)) {
        visible.push(t);
      }
    }
    visible.sort((a, b) => a.name.localeCompare(b.name, "cs"));
    return visible;
  },
});

export const get = query({
  args: { templateId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl || tpl.isTemplate !== true) return null;
    if (!(await canViewProject(ctx, me, tpl))) return null;
    return tpl;
  },
});

export const taskCounts = query({
  args: { templateIds: v.array(v.id("projects")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const counts: Record<string, number> = {};
    for (const id of args.templateIds) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", id))
        .collect();
      counts[id as string] = tasks.length;
    }
    return counts;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    department: projectDepartment,
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!canCreateProject(me, args.department)) {
      throw new ConvexError("Nemáte oprávnění vytvořit šablonu v tomto oddělení");
    }
    const id = await ctx.db.insert("projects", {
      name: args.name.trim(),
      description: args.description,
      ownerId: me._id,
      department: args.department,
      status: "planning",
      priority: "medium",
      createdBy: me._id,
      isTemplate: true,
    });
    await logAction(ctx, {
      actor: me,
      action: "template.create",
      entityType: "template",
      entityId: id,
      summary: `Vytvořil šablonu „${args.name.trim()}"`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    templateId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    department: v.optional(projectDepartment),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl || tpl.isTemplate !== true) throw new ConvexError("Šablona nenalezena");
    if (!canEditProject(me, tpl)) throw new ConvexError("Nemáte oprávnění");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.department !== undefined) patch.department = args.department;
    await ctx.db.patch(args.templateId, patch);
  },
});

export const remove = mutation({
  args: { templateId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl || tpl.isTemplate !== true) return;
    if (!canEditProject(me, tpl)) throw new ConvexError("Nemáte oprávnění");

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.templateId))
      .collect();
    for (const t of tasks) {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      for (const c of comments) {
        const reactions = await ctx.db
          .query("commentReactions")
          .withIndex("by_comment", (q) => q.eq("commentId", c._id))
          .collect();
        for (const r of reactions) await ctx.db.delete(r._id);
        await ctx.db.delete(c._id);
      }
      const blockingDeps = await ctx.db
        .query("taskDependencies")
        .withIndex("by_blocking", (q) => q.eq("blockingTaskId", t._id))
        .collect();
      for (const d of blockingDeps) await ctx.db.delete(d._id);
      const blockedDeps = await ctx.db
        .query("taskDependencies")
        .withIndex("by_blocked", (q) => q.eq("blockedTaskId", t._id))
        .collect();
      for (const d of blockedDeps) await ctx.db.delete(d._id);
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(args.templateId);
  },
});

export const cloneToProject = mutation({
  args: {
    templateId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    department: v.optional(projectDepartment),
    ownerId: v.id("users"),
    priority: v.optional(priority),
    deadline: v.optional(v.number()),
    startDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl || tpl.isTemplate !== true) throw new ConvexError("Šablona nenalezena");
    const dep = args.department ?? tpl.department;
    if (!canCreateProject(me, dep)) {
      throw new ConvexError("Nemáte oprávnění vytvořit projekt v tomto oddělení");
    }
    if (!(await canViewProject(ctx, me, tpl))) {
      throw new ConvexError("Nemáte přístup k šabloně");
    }
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) throw new ConvexError("Vlastník nenalezen");
    if (!args.name.trim()) throw new ConvexError("Název je povinný");

    const newProjectId = await ctx.db.insert("projects", {
      name: args.name.trim(),
      description: args.description ?? tpl.description,
      ownerId: args.ownerId,
      department: dep,
      status: "planning",
      priority: args.priority ?? tpl.priority,
      deadline: args.deadline,
      startDate: args.startDate,
      createdBy: me._id,
    });

    const templateTasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.templateId))
      .collect();

    const byParent = new Map<string, Doc<"tasks">[]>();
    for (const t of templateTasks) {
      const key = (t.parentTaskId as string | undefined) ?? "root";
      const arr = byParent.get(key) ?? [];
      arr.push(t);
      byParent.set(key, arr);
    }

    const queue: Array<{ oldParent: string; newParent: Id<"tasks"> | undefined }> = [
      { oldParent: "root", newParent: undefined },
    ];
    while (queue.length > 0) {
      const { oldParent, newParent } = queue.shift()!;
      const list = (byParent.get(oldParent) ?? []).sort(
        (a, b) => a.order - b.order || a._creationTime - b._creationTime,
      );
      let order = 0;
      for (const t of list) {
        const newId = await ctx.db.insert("tasks", {
          projectId: newProjectId,
          parentTaskId: newParent,
          title: t.title,
          description: t.description,
          assigneeId: undefined,
          status: "todo",
          priority: t.priority,
          deadline: undefined,
          estimateHours: t.estimateHours,
          order: order++,
          createdBy: me._id,
        });
        // Klon checklistů z šablonové úlohy
        const checklist = await ctx.db
          .query("checklistItems")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        let ciOrder = 0;
        for (const ci of checklist.sort((a, b) => a.order - b.order)) {
          await ctx.db.insert("checklistItems", {
            taskId: newId,
            text: ci.text,
            done: false,
            order: ciOrder++,
            createdBy: me._id,
          });
        }
        queue.push({ oldParent: t._id as string, newParent: newId });
      }
    }

    await logAction(ctx, {
      actor: me,
      action: "template.use",
      entityType: "project",
      entityId: newProjectId,
      projectId: newProjectId,
      summary: `Vytvořil projekt „${args.name.trim()}" ze šablony „${tpl.name}"`,
    });

    return newProjectId;
  },
});
