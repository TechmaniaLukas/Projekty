import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

export const getNotification = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    const recipient = await ctx.db.get(notification.recipientId);
    return { ...notification, recipient };
  },
});

export const markEmailSent = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const n = await ctx.db.get(args.notificationId);
    if (!n) return;
    await ctx.db.patch(args.notificationId, { emailSentAt: Date.now() });
  },
});
