import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type AnyCtx = QueryCtx | MutationCtx;

export interface BlockerInfo {
  earliestStart: number | undefined;
  source: Doc<"tasks"> | null;
}

export async function earliestStartFromBlockers(
  ctx: AnyCtx,
  taskId: Id<"tasks">,
): Promise<BlockerInfo> {
  const deps = await ctx.db
    .query("taskDependencies")
    .withIndex("by_blocked", (q) => q.eq("blockedTaskId", taskId))
    .collect();

  let max: number | undefined;
  let source: Doc<"tasks"> | null = null;
  for (const d of deps) {
    const blocker = await ctx.db.get(d.blockingTaskId);
    if (!blocker?.deadline) continue;
    if (max === undefined || blocker.deadline > max) {
      max = blocker.deadline;
      source = blocker;
    }
  }
  return { earliestStart: max, source };
}

export async function applyBlockerConstraints(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task) return;
  const { earliestStart } = await earliestStartFromBlockers(ctx, taskId);
  if (earliestStart === undefined) return;
  if (task.startDate !== undefined && task.startDate >= earliestStart) return;

  const patch: Record<string, unknown> = { startDate: earliestStart };
  if (task.deadline !== undefined && task.deadline < earliestStart) {
    patch.deadline = earliestStart;
  }
  await ctx.db.patch(taskId, patch);
}

export async function propagateDeadlineChange(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  const blockedRows = await ctx.db
    .query("taskDependencies")
    .withIndex("by_blocking", (q) => q.eq("blockingTaskId", taskId))
    .collect();
  for (const row of blockedRows) {
    await applyBlockerConstraints(ctx, row.blockedTaskId);
  }
}
