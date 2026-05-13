import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import type { Doc, Id } from "./_generated/dataModel";

export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient", (q) => q.eq("recipientId", me._id))
      .order("desc")
      .take(args.limit ?? 50);

    const actorCache = new Map<string, Doc<"users"> | null>();
    const out: Array<
      Doc<"notifications"> & { actor: Doc<"users"> | null }
    > = [];
    for (const n of rows) {
      let actor: Doc<"users"> | null = null;
      if (n.actorId) {
        if (!actorCache.has(n.actorId as string)) {
          actorCache.set(n.actorId as string, await ctx.db.get(n.actorId));
        }
        actor = actorCache.get(n.actorId as string) ?? null;
      }
      out.push({ ...n, actor });
    }
    return out;
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("recipientId", me._id).eq("readAt", undefined),
      )
      .collect();
    return all.length;
  },
});

export const markRead = mutation({
  args: { notificationIds: v.array(v.id("notifications")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    for (const id of args.notificationIds) {
      const n = await ctx.db.get(id);
      if (!n) continue;
      if (n.recipientId !== me._id) continue;
      if (n.readAt) continue;
      await ctx.db.patch(id, { readAt: now });
    }
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("recipientId", me._id).eq("readAt", undefined),
      )
      .collect();
    const now = Date.now();
    for (const n of all) {
      await ctx.db.patch(n._id, { readAt: now });
    }
  },
});
