import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

type NotificationType =
  | "task_assigned"
  | "task_status_changed"
  | "comment_added"
  | "project_assigned"
  | "deadline_soon";

interface EmitArgs {
  recipientId: Id<"users">;
  actorId?: Id<"users">;
  type: NotificationType;
  title: string;
  body?: string;
  projectId?: Id<"projects">;
  taskId?: Id<"tasks">;
  commentId?: Id<"comments">;
}

const EMAIL_DEBOUNCE_MS = 60 * 1000;

export async function emit(ctx: MutationCtx, args: EmitArgs): Promise<void> {
  if (args.actorId === args.recipientId) return;
  const recipient = await ctx.db.get(args.recipientId);
  if (!recipient || recipient.isActive === false) return;
  const notificationId = await ctx.db.insert("notifications", {
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: args.type,
    title: args.title,
    body: args.body,
    projectId: args.projectId,
    taskId: args.taskId,
    commentId: args.commentId,
  });
  // In-app notifikace vznikne vždy; okamžitý e-mail jen pokud uživatel
  // nemá preferenci "daily" (jen do digestu) nebo "off".
  const pref = recipient.notifyEmail ?? "instant";
  if (pref === "instant") {
    await ctx.scheduler.runAfter(
      EMAIL_DEBOUNCE_MS,
      internal.email.sendNotificationEmail,
      { notificationId },
    );
  }
}

export function actorName(user: Doc<"users"> | null | undefined): string {
  if (!user) return "Někdo";
  return user.name ?? user.email ?? "Někdo";
}
