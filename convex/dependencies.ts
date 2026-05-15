import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canEditTask, canViewProject } from "./lib/permissions";
import { applyBlockerConstraints, earliestStartFromBlockers } from "./lib/scheduling";
import type { Doc, Id } from "./_generated/dataModel";

async function wouldCreateCycle(
  ctx: { db: { query: (t: "taskDependencies") => any } },
  blockingId: Id<"tasks">,
  blockedId: Id<"tasks">,
): Promise<boolean> {
  if (blockingId === blockedId) return true;
  const visited = new Set<string>();
  const queue: Id<"tasks">[] = [blockedId];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current as string)) continue;
    visited.add(current as string);
    const deps = await ctx.db
      .query("taskDependencies")
      .withIndex("by_blocking", (q: any) => q.eq("blockingTaskId", current))
      .collect();
    for (const d of deps) {
      if (d.blockedTaskId === blockingId) return true;
      queue.push(d.blockedTaskId);
    }
  }
  return false;
}

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return { blocking: [], blockedBy: [] };
    const project = await ctx.db.get(task.projectId);
    if (!project) return { blocking: [], blockedBy: [] };
    if (!(await canViewProject(ctx, me, project))) {
      return { blocking: [], blockedBy: [] };
    }

    const blockingRows = await ctx.db
      .query("taskDependencies")
      .withIndex("by_blocking", (q) => q.eq("blockingTaskId", args.taskId))
      .collect();
    const blockedByRows = await ctx.db
      .query("taskDependencies")
      .withIndex("by_blocked", (q) => q.eq("blockedTaskId", args.taskId))
      .collect();

    const taskCache = new Map<string, Doc<"tasks"> | null>();
    const fetchTask = async (id: Id<"tasks">) => {
      if (taskCache.has(id as string)) return taskCache.get(id as string) ?? null;
      const t = await ctx.db.get(id);
      taskCache.set(id as string, t);
      return t;
    };

    const blocking = await Promise.all(
      blockingRows.map(async (r) => ({
        depId: r._id,
        task: await fetchTask(r.blockedTaskId),
      })),
    );
    const blockedBy = await Promise.all(
      blockedByRows.map(async (r) => ({
        depId: r._id,
        task: await fetchTask(r.blockingTaskId),
      })),
    );

    return {
      blocking: blocking.filter((b) => b.task !== null) as { depId: Id<"taskDependencies">; task: Doc<"tasks"> }[],
      blockedBy: blockedBy.filter((b) => b.task !== null) as { depId: Id<"taskDependencies">; task: Doc<"tasks"> }[],
    };
  },
});

/**
 * Všechny závislosti mezi úkoly v rámci jednoho projektu (pro Gantt šipky).
 * Vrací páry blocking → blocked, kde oba úkoly patří do projektu.
 */
export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    if (!(await canViewProject(ctx, me, project))) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const taskIds = new Set(tasks.map((t) => t._id as string));
    if (taskIds.size === 0) return [];

    const seen = new Set<string>();
    const pairs: { blockingTaskId: Id<"tasks">; blockedTaskId: Id<"tasks"> }[] =
      [];
    for (const t of tasks) {
      const rows = await ctx.db
        .query("taskDependencies")
        .withIndex("by_blocking", (q) => q.eq("blockingTaskId", t._id))
        .collect();
      for (const r of rows) {
        if (!taskIds.has(r.blockedTaskId as string)) continue;
        const key = `${r.blockingTaskId}->${r.blockedTaskId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({
          blockingTaskId: r.blockingTaskId,
          blockedTaskId: r.blockedTaskId,
        });
      }
    }
    return pairs;
  },
});

export const earliestStartHint = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const project = await ctx.db.get(task.projectId);
    if (!project) return null;
    if (!(await canViewProject(ctx, me, project))) return null;
    const { earliestStart, source } = await earliestStartFromBlockers(ctx, args.taskId);
    if (!earliestStart || !source) return null;
    return { earliestStart, sourceTitle: source.title, sourceId: source._id };
  },
});

export const blockerCounts = query({
  args: { taskIds: v.array(v.id("tasks")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const counts: Record<string, { incomplete: number; total: number }> = {};
    for (const taskId of args.taskIds) {
      const rows = await ctx.db
        .query("taskDependencies")
        .withIndex("by_blocked", (q) => q.eq("blockedTaskId", taskId))
        .collect();
      let incomplete = 0;
      for (const r of rows) {
        const blocker = await ctx.db.get(r.blockingTaskId);
        if (blocker && blocker.status !== "done") incomplete += 1;
      }
      counts[taskId as string] = { incomplete, total: rows.length };
    }
    return counts;
  },
});

export const add = mutation({
  args: {
    blockingTaskId: v.id("tasks"),
    blockedTaskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (args.blockingTaskId === args.blockedTaskId) {
      throw new ConvexError("Úkol nemůže blokovat sám sebe");
    }
    const blocking = await ctx.db.get(args.blockingTaskId);
    const blocked = await ctx.db.get(args.blockedTaskId);
    if (!blocking || !blocked) throw new ConvexError("Úkol nenalezen");
    if (blocking.projectId !== blocked.projectId) {
      throw new ConvexError("Úkoly musí být ve stejném projektu");
    }
    const project = await ctx.db.get(blocking.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canEditTask(me, project, blocked)) {
      throw new ConvexError("Nemáte oprávnění upravit závislosti tohoto úkolu");
    }

    const existing = await ctx.db
      .query("taskDependencies")
      .withIndex("by_pair", (q) =>
        q
          .eq("blockingTaskId", args.blockingTaskId)
          .eq("blockedTaskId", args.blockedTaskId),
      )
      .first();
    if (existing) return existing._id;

    const cycle = await wouldCreateCycle(
      ctx as any,
      args.blockingTaskId,
      args.blockedTaskId,
    );
    if (cycle) {
      throw new ConvexError("Tato závislost by vytvořila cyklus");
    }

    const depId = await ctx.db.insert("taskDependencies", {
      blockingTaskId: args.blockingTaskId,
      blockedTaskId: args.blockedTaskId,
      createdBy: me._id,
    });
    await applyBlockerConstraints(ctx, args.blockedTaskId);
    return depId;
  },
});

export const remove = mutation({
  args: { depId: v.id("taskDependencies") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const dep = await ctx.db.get(args.depId);
    if (!dep) return;
    const blockedTask = await ctx.db.get(dep.blockedTaskId);
    if (!blockedTask) {
      await ctx.db.delete(args.depId);
      return;
    }
    const project = await ctx.db.get(blockedTask.projectId);
    if (!project) return;
    if (!canEditTask(me, project, blockedTask)) {
      throw new ConvexError("Nemáte oprávnění");
    }
    await ctx.db.delete(args.depId);
  },
});
