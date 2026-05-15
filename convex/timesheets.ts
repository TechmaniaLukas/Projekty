import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isAdmin, isPm, isDeptLead } from "./lib/permissions";
import { logAction } from "./lib/audit";
import { emit } from "./lib/notify";
import type { Doc, Id } from "./_generated/dataModel";

async function periodHours(
  ctx: { db: { query: any } },
  userId: Id<"users">,
  periodStart: number,
  periodEnd: number,
): Promise<number> {
  const rows = await ctx.db
    .query("timeEntries")
    .withIndex("by_user_start", (q: any) =>
      q
        .eq("userId", userId)
        .gte("startTime", periodStart)
        .lt("startTime", periodEnd),
    )
    .collect();
  let total = 0;
  for (const r of rows) total += r.hours;
  return Math.round(total * 100) / 100;
}

/** Může `approver` schválit výkaz uživatele `target`? */
function canApproveFor(approver: Doc<"users">, target: Doc<"users">): boolean {
  if (isAdmin(approver) || isPm(approver)) return true;
  if (isDeptLead(approver) && approver.department) {
    return target.department === approver.department;
  }
  return false;
}

/** Stav výkazu pro daný týden (pro aktuálního uživatele). */
export const statusForWeek = query({
  args: { periodStart: v.number() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const sub = await ctx.db
      .query("timesheetSubmissions")
      .withIndex("by_user_period", (q) =>
        q.eq("userId", me._id).eq("periodStart", args.periodStart),
      )
      .first();
    return sub ?? null;
  },
});

export const submitWeek = mutation({
  args: { periodStart: v.number(), periodEnd: v.number() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db
      .query("timesheetSubmissions")
      .withIndex("by_user_period", (q) =>
        q.eq("userId", me._id).eq("periodStart", args.periodStart),
      )
      .first();
    if (existing && existing.status === "approved") {
      throw new ConvexError("Týden je už schválený");
    }
    if (existing && existing.status === "submitted") {
      throw new ConvexError("Týden už čeká na schválení");
    }
    const total = await periodHours(
      ctx,
      me._id,
      args.periodStart,
      args.periodEnd,
    );
    if (total <= 0) {
      throw new ConvexError("Nelze odeslat týden bez zalogovaných hodin");
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "submitted",
        totalHours: total,
        submittedAt: Date.now(),
        rejectionReason: undefined,
        decidedBy: undefined,
        decidedAt: undefined,
      });
    } else {
      await ctx.db.insert("timesheetSubmissions", {
        userId: me._id,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        status: "submitted",
        totalHours: total,
        submittedAt: Date.now(),
      });
    }
    await logAction(ctx, {
      actor: me,
      action: "timesheet.submit",
      entityType: "user",
      entityId: me._id,
      summary: `Odeslal výkaz ke schválení (${total} h)`,
    });
  },
});

export const decide = mutation({
  args: {
    submissionId: v.id("timesheetSubmissions"),
    approve: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) throw new ConvexError("Výkaz nenalezen");
    const target = await ctx.db.get(sub.userId);
    if (!target) throw new ConvexError("Uživatel nenalezen");
    if (!canApproveFor(me, target)) {
      throw new ConvexError("Nemáte oprávnění schvalovat tento výkaz");
    }
    if (sub.status !== "submitted") {
      throw new ConvexError("Výkaz není ve stavu odesláno");
    }
    if (!args.approve) {
      const reason = (args.reason ?? "").trim();
      if (!reason) throw new ConvexError("Důvod vrácení je povinný");
      await ctx.db.patch(args.submissionId, {
        status: "rejected",
        decidedBy: me._id,
        decidedAt: Date.now(),
        rejectionReason: reason,
      });
      await emit(ctx, {
        recipientId: sub.userId,
        actorId: me._id,
        type: "task_status_changed",
        title: "Výkaz byl vrácen k přepracování",
        body: reason,
      });
      await logAction(ctx, {
        actor: me,
        action: "timesheet.reject",
        entityType: "user",
        entityId: sub.userId,
        summary: `Vrátil výkaz (${sub.totalHours} h): ${reason}`,
      });
      return;
    }
    await ctx.db.patch(args.submissionId, {
      status: "approved",
      decidedBy: me._id,
      decidedAt: Date.now(),
      rejectionReason: undefined,
    });
    await emit(ctx, {
      recipientId: sub.userId,
      actorId: me._id,
      type: "task_status_changed",
      title: "Výkaz byl schválen",
      body: `Týden s ${sub.totalHours} h schválen.`,
    });
    await logAction(ctx, {
      actor: me,
      action: "timesheet.approve",
      entityType: "user",
      entityId: sub.userId,
      summary: `Schválil výkaz (${sub.totalHours} h)`,
    });
  },
});

/** Výkazy čekající na schválení v gesci aktuálního uživatele. */
export const pendingForMe = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    if (!isAdmin(me) && !isPm(me) && !isDeptLead(me)) return [];
    const submitted = await ctx.db
      .query("timesheetSubmissions")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .collect();
    const out = [];
    for (const s of submitted) {
      const user = await ctx.db.get(s.userId);
      if (!user) continue;
      if (!canApproveFor(me, user)) continue;
      out.push({
        ...s,
        user: {
          _id: user._id,
          name: user.name ?? null,
          email: user.email ?? null,
          department: user.department ?? null,
        },
      });
    }
    out.sort((a, b) => a.periodStart - b.periodStart);
    return out;
  },
});
