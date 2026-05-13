import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole, requireUser } from "./lib/auth";
import { canViewProject } from "./lib/permissions";
import type { Doc, Id } from "./_generated/dataModel";

export const list = query({
  args: {
    limit: v.optional(v.number()),
    actorId: v.optional(v.id("users")),
    entityType: v.optional(
      v.union(
        v.literal("project"),
        v.literal("task"),
        v.literal("comment"),
        v.literal("user"),
        v.literal("dependency"),
        v.literal("attachment"),
        v.literal("template"),
      ),
    ),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin"]);

    let rows: Doc<"auditLog">[];
    if (args.actorId) {
      rows = await ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorId", args.actorId!))
        .order("desc")
        .take(args.limit ?? 100);
    } else if (args.projectId) {
      rows = await ctx.db
        .query("auditLog")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .order("desc")
        .take(args.limit ?? 100);
    } else {
      rows = await ctx.db
        .query("auditLog")
        .order("desc")
        .take(args.limit ?? 100);
    }
    if (args.entityType) {
      rows = rows.filter((r) => r.entityType === args.entityType);
    }

    const actorCache = new Map<string, Doc<"users"> | null>();
    const out: Array<Doc<"auditLog"> & { actor: Doc<"users"> | null }> = [];
    for (const r of rows) {
      let actor = actorCache.get(r.actorId as string) ?? null;
      if (!actorCache.has(r.actorId as string)) {
        actor = await ctx.db.get(r.actorId);
        actorCache.set(r.actorId as string, actor);
      }
      out.push({ ...r, actor });
    }
    return out;
  },
});

export const listForProject = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    if (!(await canViewProject(ctx, me, project))) return [];

    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 50);

    const actorCache = new Map<string, Doc<"users"> | null>();
    const out: Array<Doc<"auditLog"> & { actor: Doc<"users"> | null }> = [];
    for (const r of rows) {
      let actor = actorCache.get(r.actorId as string) ?? null;
      if (!actorCache.has(r.actorId as string)) {
        actor = await ctx.db.get(r.actorId);
        actorCache.set(r.actorId as string, actor);
      }
      out.push({ ...r, actor });
    }
    return out;
  },
});
