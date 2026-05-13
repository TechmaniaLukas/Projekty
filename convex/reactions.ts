import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canViewProject } from "./lib/permissions";
import type { Id } from "./_generated/dataModel";

const ALLOWED_EMOJIS = ["👍", "❤️", "✅", "🚀", "👀", "🎉"];

export const listForComments = query({
  args: { commentIds: v.array(v.id("comments")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const out: Record<
      string,
      Array<{ emoji: string; count: number; userIds: Id<"users">[] }>
    > = {};
    for (const commentId of args.commentIds) {
      const rows = await ctx.db
        .query("commentReactions")
        .withIndex("by_comment", (q) => q.eq("commentId", commentId))
        .collect();
      const grouped = new Map<string, Id<"users">[]>();
      for (const r of rows) {
        const arr = grouped.get(r.emoji) ?? [];
        arr.push(r.userId);
        grouped.set(r.emoji, arr);
      }
      const list = ALLOWED_EMOJIS
        .map((e) => ({
          emoji: e,
          userIds: grouped.get(e) ?? [],
          count: (grouped.get(e) ?? []).length,
        }))
        .filter((x) => x.count > 0);
      for (const [emoji, userIds] of grouped.entries()) {
        if (!ALLOWED_EMOJIS.includes(emoji)) {
          list.push({ emoji, userIds, count: userIds.length });
        }
      }
      out[commentId as string] = list;
    }
    return out;
  },
});

export const toggle = mutation({
  args: {
    commentId: v.id("comments"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!ALLOWED_EMOJIS.includes(args.emoji)) {
      throw new ConvexError("Tento emoji není povolen");
    }
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new ConvexError("Komentář nenalezen");
    const task = await ctx.db.get(comment.taskId);
    if (!task) throw new ConvexError("Úkol nenalezen");
    const project = await ctx.db.get(task.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!(await canViewProject(ctx, me, project))) {
      throw new ConvexError("Nemáte přístup k úkolu");
    }

    const existing = await ctx.db
      .query("commentReactions")
      .withIndex("by_comment_user_emoji", (q) =>
        q
          .eq("commentId", args.commentId)
          .eq("userId", me._id)
          .eq("emoji", args.emoji),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { added: false };
    }
    await ctx.db.insert("commentReactions", {
      commentId: args.commentId,
      userId: me._id,
      emoji: args.emoji,
    });
    return { added: true };
  },
});

export const allowedEmojis = query({
  args: {},
  handler: async () => ALLOWED_EMOJIS,
});
