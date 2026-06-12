import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isAdmin, isPm, isDeptLead } from "./lib/permissions";

const MAX_ABSENCE_DAYS = 180;
const DAY_MS = 24 * 3600 * 1000;

/** Moje nepřítomnosti (od nejnovější). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("absences")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();
    rows.sort((a, b) => b.from - a.from);
    return rows;
  },
});

/**
 * Nepřítomnosti všech aktivních lidí v okně (pro management — kapacitní
 * kontext: kdo kdy chybí).
 */
export const listUpcoming = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!isAdmin(me) && !isPm(me) && !isDeptLead(me)) return [];
    const rows = await ctx.db.query("absences").collect();
    const overlapping = rows.filter((a) => a.to >= args.from && a.from <= args.to);
    const out = [];
    for (const a of overlapping) {
      const u = await ctx.db.get(a.userId);
      if (!u || u.isActive === false) continue;
      out.push({
        ...a,
        userName: u.name ?? u.email ?? "—",
        department: u.department ?? null,
      });
    }
    out.sort((a, b) => a.from - b.from);
    return out;
  },
});

export const add = mutation({
  args: {
    userId: v.optional(v.id("users")), // admin/vedoucí může zadat za jiného
    from: v.number(),
    to: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const targetId = args.userId ?? me._id;
    if (targetId !== me._id) {
      const target = await ctx.db.get(targetId);
      if (!target) throw new ConvexError("Uživatel nenalezen");
      const allowed =
        isAdmin(me) ||
        isPm(me) ||
        (isDeptLead(me) && target.department === me.department);
      if (!allowed) {
        throw new ConvexError("Nemáte oprávnění zadat nepřítomnost za jiného");
      }
    }
    if (args.to < args.from) {
      throw new ConvexError("Konec nemůže být před začátkem");
    }
    if (args.to - args.from > MAX_ABSENCE_DAYS * DAY_MS) {
      throw new ConvexError(`Nepřítomnost nemůže být delší než ${MAX_ABSENCE_DAYS} dní`);
    }
    return await ctx.db.insert("absences", {
      userId: targetId,
      from: args.from,
      to: args.to,
      note: args.note?.trim() || undefined,
      createdBy: me._id,
    });
  },
});

export const remove = mutation({
  args: { absenceId: v.id("absences") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const a = await ctx.db.get(args.absenceId);
    if (!a) return;
    if (a.userId !== me._id && !isAdmin(me) && !isPm(me)) {
      if (isDeptLead(me)) {
        const target = await ctx.db.get(a.userId);
        if (!target || target.department !== me.department) {
          throw new ConvexError("Nemáte oprávnění");
        }
      } else {
        throw new ConvexError("Lze smazat jen vlastní nepřítomnost");
      }
    }
    await ctx.db.delete(args.absenceId);
  },
});
