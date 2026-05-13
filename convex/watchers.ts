import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canViewProject } from "./lib/permissions";
import type { Doc, Id } from "./_generated/dataModel";

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
      .query("taskWatchers")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    const out: Array<{ userId: Id<"users">; user: Doc<"users"> | null }> = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      out.push({ userId: r.userId, user: u });
    }
    return out;
  },
});

export const isWatching = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const row = await ctx.db
      .query("taskWatchers")
      .withIndex("by_task_and_user", (q) =>
        q.eq("taskId", args.taskId).eq("userId", me._id),
      )
      .first();
    return row !== null;
  },
});

export const toggle = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("Úkol nenalezen");
    const project = await ctx.db.get(task.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!(await canViewProject(ctx, me, project))) {
      throw new ConvexError("Nemáte přístup k úkolu");
    }

    const existing = await ctx.db
      .query("taskWatchers")
      .withIndex("by_task_and_user", (q) =>
        q.eq("taskId", args.taskId).eq("userId", me._id),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { watching: false };
    }
    await ctx.db.insert("taskWatchers", {
      taskId: args.taskId,
      userId: me._id,
    });
    return { watching: true };
  },
});

export async function watcherIdsForTask(
  ctx: { db: { query: (t: "taskWatchers") => any } },
  taskId: Id<"tasks">,
): Promise<Id<"users">[]> {
  const rows = await ctx.db
    .query("taskWatchers")
    .withIndex("by_task", (q: any) => q.eq("taskId", taskId))
    .collect();
  return rows.map((r: { userId: Id<"users"> }) => r.userId);
}
