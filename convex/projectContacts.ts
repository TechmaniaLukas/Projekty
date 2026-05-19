import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { canViewProject, canEditProject } from "./lib/permissions";

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    if (!(await canViewProject(ctx, me, project))) return [];
    const rows = await ctx.db
      .query("projectContacts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    rows.sort((a, b) => a._creationTime - b._creationTime);
    return rows;
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canEditProject(me, project)) {
      throw new ConvexError("Nemáte oprávnění upravovat kontakty");
    }
    if (!args.name.trim()) throw new ConvexError("Jméno je povinné");
    return await ctx.db.insert("projectContacts", {
      projectId: args.projectId,
      name: args.name.trim(),
      company: args.company?.trim() || undefined,
      role: args.role?.trim() || undefined,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      note: args.note?.trim() || undefined,
      createdBy: me._id,
    });
  },
});

export const update = mutation({
  args: {
    contactId: v.id("projectContacts"),
    name: v.optional(v.string()),
    company: v.optional(v.union(v.string(), v.null())),
    role: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new ConvexError("Kontakt nenalezen");
    const project = await ctx.db.get(contact.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canEditProject(me, project)) {
      throw new ConvexError("Nemáte oprávnění upravovat kontakty");
    }
    const patch: Record<string, unknown> = {};
    const norm = (val: string | null | undefined) =>
      val === null ? undefined : val?.trim() || undefined;
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.company !== undefined) patch.company = norm(args.company);
    if (args.role !== undefined) patch.role = norm(args.role);
    if (args.email !== undefined) patch.email = norm(args.email);
    if (args.phone !== undefined) patch.phone = norm(args.phone);
    if (args.note !== undefined) patch.note = norm(args.note);
    await ctx.db.patch(args.contactId, patch);
  },
});

export const remove = mutation({
  args: { contactId: v.id("projectContacts") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return;
    const project = await ctx.db.get(contact.projectId);
    if (!project) return;
    if (!canEditProject(me, project)) {
      throw new ConvexError("Nemáte oprávnění mazat kontakty");
    }
    await ctx.db.delete(args.contactId);
  },
});
