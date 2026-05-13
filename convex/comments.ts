import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canViewProject, isAdmin } from "./lib/permissions";
import { emit, actorName } from "./lib/notify";
import type { Doc, Id } from "./_generated/dataModel";

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return [];
    const project = await ctx.db.get(task.projectId);
    if (!project) return [];
    const allowed = await canViewProject(ctx, me, project);
    if (!allowed) return [];

    const rows = await ctx.db
      .query("comments")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();

    const authorCache = new Map<Id<"users">, Doc<"users"> | null>();
    const out: Array<Doc<"comments"> & { author: Doc<"users"> | null }> = [];
    for (const c of rows) {
      let author = authorCache.get(c.authorId) ?? null;
      if (!authorCache.has(c.authorId)) {
        author = await ctx.db.get(c.authorId);
        authorCache.set(c.authorId, author);
      }
      out.push({ ...c, author });
    }
    return out;
  },
});

export const add = mutation({
  args: {
    taskId: v.id("tasks"),
    text: v.string(),
    mentions: v.optional(v.array(v.id("users"))),
    notifyUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("Úkol nenalezen");
    const project = await ctx.db.get(task.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    const allowed = await canViewProject(ctx, me, project);
    if (!allowed) throw new ConvexError("Nemáte přístup k úkolu");

    if (!args.text.trim()) throw new ConvexError("Komentář nemůže být prázdný");

    const mentionIds = (args.mentions ?? []).filter((id) => id !== me._id);

    const commentId = await ctx.db.insert("comments", {
      taskId: args.taskId,
      authorId: me._id,
      text: args.text.trim(),
      mentions: mentionIds.length > 0 ? mentionIds : undefined,
    });

    const preview =
      args.text.trim().length > 80
        ? args.text.trim().slice(0, 80) + "…"
        : args.text.trim();

    const mentionedSet = new Set<Id<"users">>(mentionIds);

    let recipientIds: Set<Id<"users">>;
    if (args.notifyUserIds !== undefined) {
      recipientIds = new Set(
        args.notifyUserIds.filter((id) => id !== me._id),
      );
      for (const id of mentionedSet) recipientIds.add(id);
    } else {
      recipientIds = new Set<Id<"users">>(mentionedSet);
      if (task.createdBy && task.createdBy !== me._id)
        recipientIds.add(task.createdBy);
      if (task.assigneeId && task.assigneeId !== me._id)
        recipientIds.add(task.assigneeId);
      if (project.ownerId && project.ownerId !== me._id)
        recipientIds.add(project.ownerId);
    }

    for (const recipientId of recipientIds) {
      const isMention = mentionedSet.has(recipientId);
      await emit(ctx, {
        recipientId,
        actorId: me._id,
        type: "comment_added",
        title: isMention
          ? `${actorName(me)} tě zmínil v komentáři`
          : `${actorName(me)} okomentoval úkol`,
        body: `${task.title}: ${preview}`,
        projectId: project._id,
        taskId: task._id,
        commentId,
      });
    }

    return commentId;
  },
});

export const edit = mutation({
  args: {
    commentId: v.id("comments"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new ConvexError("Komentář nenalezen");
    if (comment.authorId !== me._id && !isAdmin(me)) {
      throw new ConvexError("Komentář může editovat jen autor nebo admin");
    }
    if (!args.text.trim()) throw new ConvexError("Komentář nemůže být prázdný");
    await ctx.db.patch(args.commentId, {
      text: args.text.trim(),
      editedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) return;
    if (comment.authorId !== me._id && !isAdmin(me)) {
      throw new ConvexError("Komentář může smazat jen autor nebo admin");
    }
    const reactions = await ctx.db
      .query("commentReactions")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();
    for (const r of reactions) await ctx.db.delete(r._id);
    await ctx.db.delete(args.commentId);
  },
});

export const defaultRecipients = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return [];
    const project = await ctx.db.get(task.projectId);
    if (!project) return [];
    if (!(await canViewProject(ctx, me, project))) return [];
    const out: Array<{
      user: Doc<"users">;
      reason: "assignee" | "creator" | "owner" | "watcher";
    }> = [];
    if (task.assigneeId && task.assigneeId !== me._id) {
      const u = await ctx.db.get(task.assigneeId);
      if (u) out.push({ user: u, reason: "assignee" });
    }
    if (
      task.createdBy &&
      task.createdBy !== me._id &&
      !out.some((x) => x.user._id === task.createdBy)
    ) {
      const u = await ctx.db.get(task.createdBy);
      if (u) out.push({ user: u, reason: "creator" });
    }
    if (
      project.ownerId &&
      project.ownerId !== me._id &&
      !out.some((x) => x.user._id === project.ownerId)
    ) {
      const u = await ctx.db.get(project.ownerId);
      if (u) out.push({ user: u, reason: "owner" });
    }
    const watchers = await ctx.db
      .query("taskWatchers")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    for (const w of watchers) {
      if (w.userId === me._id) continue;
      if (out.some((x) => x.user._id === w.userId)) continue;
      const u = await ctx.db.get(w.userId);
      if (u) out.push({ user: u, reason: "watcher" });
    }
    return out;
  },
});

export const countsByTask = query({
  args: { taskIds: v.array(v.id("tasks")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const counts: Record<string, number> = {};
    for (const taskId of args.taskIds) {
      const all = await ctx.db
        .query("comments")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect();
      counts[taskId as string] = all.length;
    }
    return counts;
  },
});
