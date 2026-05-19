import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isAdmin, isDirector } from "./lib/permissions";
import type { Doc } from "./_generated/dataModel";

/**
 * Executive dashboard — vysoko-úrovňový přehled napříč odděleními.
 * Přístupné pro ředitele i admina.
 */
export const executiveSummary = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    if (!isDirector(me) && !isAdmin(me)) return null;

    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const thirtyDaysAgo = now - 30 * day;
    const sixtyDaysAhead = now + 60 * day;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [projects, tasks, users, entries, allMilestones] = await Promise.all([
      ctx.db.query("projects").collect(),
      ctx.db.query("tasks").collect(),
      ctx.db.query("users").collect(),
      ctx.db
        .query("timeEntries")
        .withIndex("by_start", (q) => q.gte("startTime", thirtyDaysAgo))
        .collect(),
      ctx.db.query("milestones").collect(),
    ]);

    // KPI top-line
    const activeProjects = projects.filter(
      (p) => p.status === "active" || p.status === "planning",
    );
    const overdueProjects = projects.filter(
      (p) =>
        p.deadline &&
        p.deadline < now &&
        p.status !== "done" &&
        p.status !== "archived",
    );
    const doneThisMonth = projects.filter(
      (p) => p.status === "done" && p._creationTime >= startOfMonth.getTime(),
    );
    const totalHours30d = entries.reduce((s, e) => s + e.hours, 0);

    // Per oddělení
    const departments = ["it", "facility", "vyroba", "cross"] as const;
    const byDept = departments.map((dep) => {
      const deptProjects = projects.filter((p) => p.department === dep);
      const active = deptProjects.filter((p) => p.status === "active").length;
      const onHold = deptProjects.filter((p) => p.status === "on_hold").length;
      const overdue = deptProjects.filter(
        (p) =>
          p.deadline &&
          p.deadline < now &&
          p.status !== "done" &&
          p.status !== "archived",
      ).length;

      const deptProjectIds = new Set(deptProjects.map((p) => p._id as string));
      const deptHours = entries
        .filter((e) => deptProjectIds.has(e.projectId as string))
        .reduce((s, e) => s + e.hours, 0);

      // Top 3 nadcházející deadliny v rámci oddělení
      const upcoming = deptProjects
        .filter(
          (p) =>
            p.deadline &&
            p.deadline >= now &&
            p.deadline <= sixtyDaysAhead &&
            p.status !== "done" &&
            p.status !== "archived",
        )
        .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0))
        .slice(0, 3);

      return {
        department: dep,
        total: deptProjects.length,
        active,
        onHold,
        overdue,
        hours30d: Math.round(deptHours * 100) / 100,
        upcoming: upcoming.map((p) => ({
          _id: p._id,
          name: p.name,
          deadline: p.deadline ?? 0,
          status: p.status,
        })),
      };
    });

    // Nadcházející milníky napříč všemi odděleními (60 dní) — reálná entita
    const projectById = new Map(projects.map((p) => [p._id as string, p]));
    const milestones = allMilestones
      .filter(
        (m) =>
          m.dueDate >= now &&
          m.dueDate <= sixtyDaysAhead &&
          m.status !== "approved",
      )
      .sort((a, b) => a.dueDate - b.dueDate)
      .slice(0, 15)
      .map((m) => {
        const p = projectById.get(m.projectId as string);
        const linked = tasks.filter((t) => t.milestoneId === m._id);
        const total = linked.length;
        const done = linked.filter((t) => t.status === "done").length;
        const approver = users.find((u) => u._id === m.approverId);
        return {
          _id: m._id,
          name: m.title,
          projectId: m.projectId,
          projectName: p?.name ?? "—",
          deadline: m.dueDate,
          department: p?.department ?? "cross",
          status: m.status,
          progress: total > 0 ? Math.round((done / total) * 100) : 0,
          ownerName: approver?.name ?? approver?.email ?? null,
        };
      });

    // Top kontributoři (po hodinách za 30 dní)
    const hoursByUser = new Map<string, number>();
    for (const e of entries) {
      hoursByUser.set(
        e.userId as string,
        (hoursByUser.get(e.userId as string) ?? 0) + e.hours,
      );
    }
    const topContributors = Array.from(hoursByUser.entries())
      .map(([uid, h]) => {
        const u = users.find((x) => x._id === uid);
        return u
          ? {
              _id: u._id,
              name: u.name ?? u.email ?? "—",
              email: u.email ?? "",
              department: u.department ?? null,
              role: u.role ?? null,
              hours: Math.round(h * 100) / 100,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);

    return {
      kpi: {
        activeProjects: activeProjects.length,
        overdueProjects: overdueProjects.length,
        doneThisMonth: doneThisMonth.length,
        totalHours30d: Math.round(totalHours30d * 100) / 100,
        totalProjects: projects.length,
      },
      byDept,
      milestones,
      topContributors,
    };
  },
});

/**
 * Activity feed pro ředitele — posledních N záznamů audit logu napříč všemi
 * odděleními, s relevantními filtry (vytvořeno/dokončeno/komentář).
 */
export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!isDirector(me) && !isAdmin(me)) return [];

    const limit = args.limit ?? 25;
    const entries = await ctx.db
      .query("auditLog")
      .order("desc")
      .take(limit);

    const actorIds = Array.from(new Set(entries.map((e) => e.actorId as string)));
    const actors = await Promise.all(
      actorIds.map((id) => ctx.db.get(id as Doc<"users">["_id"])),
    );
    const actorById = new Map<string, Doc<"users">>();
    for (const a of actors) {
      if (a) actorById.set(a._id as string, a);
    }

    return entries.map((e) => {
      const actor = actorById.get(e.actorId as string);
      return {
        _id: e._id,
        _creationTime: e._creationTime,
        action: e.action,
        summary: e.summary,
        entityType: e.entityType,
        entityId: e.entityId,
        projectId: e.projectId,
        actorName: actor?.name ?? actor?.email ?? "—",
      };
    });
  },
});

/**
 * Měsíční souhrnný report napříč odděleními (pro poradu vedení / PDF).
 */
export const monthlyReport = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!isDirector(me) && !isAdmin(me)) return null;

    const start = new Date(args.year, args.month - 1, 1).getTime();
    const end = new Date(args.year, args.month, 1).getTime();

    const [projects, tasks, users, entries, milestones] = await Promise.all([
      ctx.db.query("projects").collect(),
      ctx.db.query("tasks").collect(),
      ctx.db.query("users").collect(),
      ctx.db
        .query("timeEntries")
        .withIndex("by_start", (q) =>
          q.gte("startTime", start).lt("startTime", end),
        )
        .collect(),
      ctx.db.query("milestones").collect(),
    ]);

    const departments = ["it", "facility", "vyroba", "cross"] as const;
    const byDept = departments.map((dep) => {
      const deptProjects = projects.filter((p) => p.department === dep);
      const deptProjectIds = new Set(deptProjects.map((p) => p._id as string));
      const hours = entries
        .filter((e) => deptProjectIds.has(e.projectId as string))
        .reduce((s, e) => s + e.hours, 0);
      const tasksDone = tasks.filter(
        (t) =>
          deptProjectIds.has(t.projectId as string) &&
          t.completedAt !== undefined &&
          t.completedAt >= start &&
          t.completedAt < end,
      ).length;
      const msApproved = milestones.filter(
        (m) =>
          deptProjectIds.has(m.projectId as string) &&
          m.status === "approved" &&
          m.decidedAt !== undefined &&
          m.decidedAt >= start &&
          m.decidedAt < end,
      ).length;
      const projectsDone = deptProjects.filter(
        (p) =>
          p.status === "done" &&
          p._creationTime < end /* hrubý odhad: dokončené k datu */,
      ).length;
      return {
        department: dep,
        activeProjects: deptProjects.filter(
          (p) => p.status === "active" || p.status === "planning",
        ).length,
        projectsDone,
        tasksDone,
        milestonesApproved: msApproved,
        hours: Math.round(hours * 100) / 100,
      };
    });

    const totalHours = entries.reduce((s, e) => s + e.hours, 0);
    const hoursByUser = new Map<string, number>();
    for (const e of entries) {
      hoursByUser.set(
        e.userId as string,
        (hoursByUser.get(e.userId as string) ?? 0) + e.hours,
      );
    }
    const topContributors = Array.from(hoursByUser.entries())
      .map(([uid, h]) => {
        const u = users.find((x) => x._id === uid);
        return u
          ? {
              name: u.name ?? u.email ?? "—",
              hours: Math.round(h * 100) / 100,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    const approvedMilestones = milestones
      .filter(
        (m) =>
          m.status === "approved" &&
          m.decidedAt !== undefined &&
          m.decidedAt >= start &&
          m.decidedAt < end,
      )
      .map((m) => {
        const p = projects.find((x) => x._id === m.projectId);
        return {
          title: m.title,
          projectName: p?.name ?? "—",
          department: p?.department ?? "cross",
        };
      });

    return {
      period: { year: args.year, month: args.month },
      generatedAt: Date.now(),
      totalHours: Math.round(totalHours * 100) / 100,
      byDept,
      topContributors,
      approvedMilestones,
    };
  },
});
