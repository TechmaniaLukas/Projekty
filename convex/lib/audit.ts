import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type EntityType =
  | "project"
  | "task"
  | "comment"
  | "user"
  | "dependency"
  | "attachment"
  | "template"
  | "milestone";

interface LogArgs {
  actor: Doc<"users">;
  action: string;
  entityType: EntityType;
  entityId: string;
  projectId?: Id<"projects">;
  summary: string;
  details?: Record<string, unknown>;
}

export async function logAction(
  ctx: MutationCtx,
  args: LogArgs,
): Promise<void> {
  await ctx.db.insert("auditLog", {
    actorId: args.actor._id,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    projectId: args.projectId,
    summary: args.summary,
    details: args.details,
  });
}
