import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canViewProject, canEditTask, isAdmin } from "./lib/permissions";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const generateUploadUrl = mutation({
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
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachToTask = mutation({
  args: {
    taskId: v.id("tasks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (args.size > MAX_FILE_BYTES) {
      throw new ConvexError(
        `Soubor je příliš velký (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
      );
    }
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("Úkol nenalezen");
    const project = await ctx.db.get(task.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!(await canViewProject(ctx, me, project))) {
      throw new ConvexError("Nemáte přístup k úkolu");
    }
    return await ctx.db.insert("attachments", {
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      size: args.size,
      taskId: args.taskId,
      uploadedBy: me._id,
    });
  },
});

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
      .query("attachments")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();

    const userCache = new Map<string, Doc<"users"> | null>();
    const out: Array<
      Doc<"attachments"> & {
        url: string | null;
        uploader: Doc<"users"> | null;
      }
    > = [];
    for (const a of rows) {
      let uploader = userCache.get(a.uploadedBy as string) ?? null;
      if (!userCache.has(a.uploadedBy as string)) {
        uploader = await ctx.db.get(a.uploadedBy);
        userCache.set(a.uploadedBy as string, uploader);
      }
      const url = await ctx.storage.getUrl(a.storageId);
      out.push({ ...a, url, uploader });
    }
    return out;
  },
});

export const remove = mutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const att = await ctx.db.get(args.attachmentId);
    if (!att) return;
    let canDelete = att.uploadedBy === me._id || isAdmin(me);
    if (!canDelete && att.taskId) {
      const task = await ctx.db.get(att.taskId);
      if (task) {
        const project = await ctx.db.get(task.projectId);
        if (project && canEditTask(me, project, task)) canDelete = true;
      }
    }
    if (!canDelete) {
      throw new ConvexError("Nemáte oprávnění smazat tuto přílohu");
    }
    await ctx.storage.delete(att.storageId);
    await ctx.db.delete(args.attachmentId);
  },
});

export const counts = query({
  args: { taskIds: v.array(v.id("tasks")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const counts: Record<string, number> = {};
    for (const taskId of args.taskIds) {
      const all = await ctx.db
        .query("attachments")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect();
      counts[taskId as string] = all.length;
    }
    return counts;
  },
});
