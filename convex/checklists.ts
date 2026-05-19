import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canViewProject, canEditTask } from "./lib/permissions";
import type { Doc } from "./_generated/dataModel";

async function taskAndProject(
  ctx: { db: { get: (id: any) => any } },
  taskId: Doc<"tasks">["_id"],
) {
  const task = await ctx.db.get(taskId);
  if (!task) throw new ConvexError("Úkol nenalezen");
  const project = await ctx.db.get(task.projectId);
  if (!project) throw new ConvexError("Projekt nenalezen");
  return { task, project };
}

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return [];
    const project = await ctx.db.get(task.projectId);
    if (!project) return [];
    if (!(await canViewProject(ctx, me, project))) return [];
    const rows = await ctx.db
      .query("checklistItems")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows;
  },
});

export const add = mutation({
  args: { taskId: v.id("tasks"), text: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const { task, project } = await taskAndProject(ctx, args.taskId);
    if (!canEditTask(me, project, task)) {
      throw new ConvexError("Nemáte oprávnění upravit úkol");
    }
    if (!args.text.trim()) throw new ConvexError("Text je povinný");
    const existing = await ctx.db
      .query("checklistItems")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return await ctx.db.insert("checklistItems", {
      taskId: args.taskId,
      text: args.text.trim(),
      done: false,
      order: existing.length,
      createdBy: me._id,
    });
  },
});

export const toggle = mutation({
  args: { itemId: v.id("checklistItems") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Položka nenalezena");
    const { task, project } = await taskAndProject(ctx, item.taskId);
    if (!canEditTask(me, project, task)) {
      throw new ConvexError("Nemáte oprávnění");
    }
    await ctx.db.patch(args.itemId, { done: !item.done });
  },
});

export const updateText = mutation({
  args: { itemId: v.id("checklistItems"), text: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Položka nenalezena");
    const { task, project } = await taskAndProject(ctx, item.taskId);
    if (!canEditTask(me, project, task)) {
      throw new ConvexError("Nemáte oprávnění");
    }
    if (!args.text.trim()) throw new ConvexError("Text je povinný");
    await ctx.db.patch(args.itemId, { text: args.text.trim() });
  },
});

export const remove = mutation({
  args: { itemId: v.id("checklistItems") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) return;
    const { task, project } = await taskAndProject(ctx, item.taskId);
    if (!canEditTask(me, project, task)) {
      throw new ConvexError("Nemáte oprávnění");
    }
    await ctx.db.delete(args.itemId);
  },
});

/** Počty pro odznak na kartě úkolu (X/Y). */
export const countsForTasks = query({
  args: { taskIds: v.array(v.id("tasks")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const out: Record<string, { total: number; done: number }> = {};
    for (const tid of args.taskIds) {
      const items = await ctx.db
        .query("checklistItems")
        .withIndex("by_task", (q) => q.eq("taskId", tid))
        .collect();
      if (items.length > 0) {
        out[tid as string] = {
          total: items.length,
          done: items.filter((i) => i.done).length,
        };
      }
    }
    return out;
  },
});
