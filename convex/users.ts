import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getCurrentUser, requireUser, requireRole } from "./lib/auth";
import { logAction } from "./lib/audit";
import { ROLES, DEPARTMENTS } from "./schema";

const role = v.union(...ROLES.map((r) => v.literal(r)));
const department = v.union(...DEPARTMENTS.map((d) => v.literal(d)));

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return user;
  },
});

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db.query("users").collect();
    return args.includeInactive ? all : all.filter((u) => u.isActive !== false);
  },
});

export const bootstrapAdmin = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Nepřihlášený");

    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    if (existingAdmin) {
      throw new ConvexError("Admin již existuje. Bootstrap je možný jen jednou.");
    }

    const patch: { role: "admin"; isActive: true; name?: string } = {
      role: "admin",
      isActive: true,
    };
    if (args.name) patch.name = args.name;
    await ctx.db.patch(userId, patch);
    return userId;
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(role),
    department: v.optional(v.union(department, v.null())),
    isActive: v.optional(v.boolean()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin"]);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("Uživatel nenalezen");

    const patch: Record<string, unknown> = {};
    if (args.role !== undefined) patch.role = args.role;
    if (args.department !== undefined) {
      patch.department = args.department === null ? undefined : args.department;
    }
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.name !== undefined) patch.name = args.name;

    await ctx.db.patch(args.userId, patch);

    const me = await requireUser(ctx);
    const summaryParts: string[] = [];
    if (args.role !== undefined && args.role !== user.role) {
      summaryParts.push(`role: ${user.role ?? "—"} → ${args.role}`);
    }
    if (args.department !== undefined) {
      const newDep = args.department === null ? "—" : args.department;
      summaryParts.push(`oddělení: ${user.department ?? "—"} → ${newDep}`);
    }
    if (args.isActive !== undefined && args.isActive !== (user.isActive !== false)) {
      summaryParts.push(args.isActive ? "aktivován" : "deaktivován");
    }
    if (args.name !== undefined && args.name !== user.name) {
      summaryParts.push("jméno upraveno");
    }
    if (summaryParts.length > 0) {
      await logAction(ctx, {
        actor: me,
        action: "user.update",
        entityType: "user",
        entityId: args.userId,
        summary: `Změnil ${user.name ?? user.email ?? "uživatele"}: ${summaryParts.join(", ")}`,
        details: patch,
      });
    }
  },
});

export const updateMyName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await ctx.db.patch(me._id, { name: args.name });
  },
});

export const inviteUser = mutation({
  args: {
    email: v.string(),
    role: role,
    department: v.optional(department),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin"]);
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
    if (existing) {
      const patch: Record<string, unknown> = {
        role: args.role,
        isActive: true,
      };
      if (args.department) patch.department = args.department;
      if (args.name) patch.name = args.name;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    const newId = await ctx.db.insert("users", {
      email: args.email,
      role: args.role,
      department: args.department,
      isActive: true,
      name: args.name,
    });
    const me = await requireUser(ctx);
    await logAction(ctx, {
      actor: me,
      action: "user.invite",
      entityType: "user",
      entityId: newId,
      summary: `Pozval uživatele ${args.email} (${args.role})`,
    });
    return newId;
  },
});

/**
 * Slouči duplicitní auth záznam (vzniklý prvním přihlášením předtím, než
 * existoval `createOrUpdateUser` callback) se seedovaným uživatelem stejného
 * e-mailu. Přepojí authAccounts + authSessions na seed userId a smaže prázdný
 * duplikát.
 */
export const mergeDuplicateByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // No auth check: jednorázová administrativní úloha spouštěná z CLI.
    const all = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .collect();
    if (all.length < 2) return { merged: 0 };
    // Keep the one with role; the rest are duplicates.
    const keeper = all.find((u) => !!u.role) ?? all[0];
    const dups = all.filter((u) => u._id !== keeper._id);
    let merged = 0;
    for (const dup of dups) {
      const accounts = await ctx.db
        .query("authAccounts")
        .filter((q) => q.eq(q.field("userId"), dup._id))
        .collect();
      for (const a of accounts) await ctx.db.patch(a._id, { userId: keeper._id });
      const sessions = await ctx.db
        .query("authSessions")
        .filter((q) => q.eq(q.field("userId"), dup._id))
        .collect();
      for (const s of sessions) await ctx.db.patch(s._id, { userId: keeper._id });
      await ctx.db.delete(dup._id);
      merged++;
    }
    return { merged, keeperId: keeper._id };
  },
});

export const adminCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const admin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    return admin === null ? 0 : 1;
  },
});
