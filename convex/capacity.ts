import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isAdmin, isPm, isDeptLead, isDirector } from "./lib/permissions";
import { SKILLS } from "./schema";
import type { Doc } from "./_generated/dataModel";

const DEFAULT_CAPACITY_HOURS = 32;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const CALIBRATION_WINDOW_MS = 90 * 24 * 3600 * 1000;

type SkillKey = (typeof SKILLS)[number];

interface CellTask {
  taskId: string;
  title: string;
  projectId: string;
  projectName: string;
  hours: number;
  assigneeName: string | null;
}

/**
 * Kapacitní přehled per disciplína (skill) a per člověk, po týdnech.
 *
 * - capacity(skill, týden) = Σ weeklyCapacityHours uživatelů s daným skillem
 * - demand = zbývající kalibrovaný odhad otevřených úkolů, zařazený do týdne
 *   podle deadline (overdue → aktuální týden)
 * - kalibrace per assignee z dokončených úkolů za 90 dní
 *   (min. 3 úkoly a 10 h odhadu, clamp 0.5–2.0; jinak 1.0)
 *
 * Šablony a archivované projekty vyloučeny. weekStart posílá klient
 * (pondělí 00:00 lokálního času) kvůli konzistenci časových pásem.
 */
export const overview = query({
  args: { weekStart: v.number(), weeks: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!isAdmin(me) && !isPm(me) && !isDeptLead(me) && !isDirector(me)) {
      return null;
    }
    const numWeeks = Math.min(Math.max(args.weeks ?? 8, 2), 16);
    const horizonEnd = args.weekStart + numWeeks * WEEK_MS;
    const now = Date.now();

    const [users, allProjects, allTasks] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("tasks").collect(),
    ]);

    const activeUsers = users.filter((u) => u.isActive !== false && u.role);
    const userById = new Map(activeUsers.map((u) => [u._id as string, u]));

    const realProjects = new Map(
      allProjects
        .filter((p) => p.isTemplate !== true && p.status !== "archived")
        .map((p) => [p._id as string, p]),
    );

    // --- Kalibrace per assignee (skutečnost / odhad, dokončené za 90 dní) ---
    const calAgg = new Map<string, { est: number; act: number; n: number }>();
    for (const t of allTasks) {
      if (
        t.status !== "done" ||
        t.completedAt === undefined ||
        t.completedAt < now - CALIBRATION_WINDOW_MS ||
        !t.estimateHours ||
        t.estimateHours <= 0 ||
        !t.assigneeId
      )
        continue;
      const entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      const actual = entries.reduce((s, e) => s + e.hours, 0);
      if (actual <= 0) continue;
      const key = t.assigneeId as string;
      const agg = calAgg.get(key) ?? { est: 0, act: 0, n: 0 };
      agg.est += t.estimateHours;
      agg.act += actual;
      agg.n += 1;
      calAgg.set(key, agg);
    }
    const calibration = new Map<string, number>();
    for (const [uid, agg] of calAgg) {
      if (agg.n >= 3 && agg.est >= 10) {
        calibration.set(
          uid,
          Math.round(Math.min(2, Math.max(0.5, agg.act / agg.est)) * 100) / 100,
        );
      }
    }

    // --- Zbývající poptávka z otevřených úkolů s odhadem ---
    interface DemandItem {
      task: Doc<"tasks">;
      remaining: number;
      skill: SkillKey | "ostatni";
      weekIdx: number | null; // null = mimo horizont
      noDeadline: boolean;
      assignee: Doc<"users"> | undefined;
    }
    const items: DemandItem[] = [];
    for (const t of allTasks) {
      if (t.status === "done") continue;
      if (!realProjects.has(t.projectId as string)) continue;
      if (!t.estimateHours || t.estimateHours <= 0) continue;

      const entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      const logged = entries.reduce((s, e) => s + e.hours, 0);
      const factor = t.assigneeId
        ? (calibration.get(t.assigneeId as string) ?? 1)
        : 1;
      const remaining =
        Math.round(Math.max(0, t.estimateHours * factor - logged) * 10) / 10;
      if (remaining <= 0) continue;

      const assignee = t.assigneeId
        ? userById.get(t.assigneeId as string)
        : undefined;
      const skill: SkillKey | "ostatni" =
        (t.skill as SkillKey | undefined) ??
        (assignee?.skills?.[0] as SkillKey | undefined) ??
        "ostatni";

      let weekIdx: number | null = null;
      let noDeadline = false;
      if (t.deadline) {
        const clamped = Math.max(t.deadline, args.weekStart); // overdue → aktuální týden
        weekIdx =
          clamped < horizonEnd
            ? Math.floor((clamped - args.weekStart) / WEEK_MS)
            : null;
      } else {
        noDeadline = true;
      }
      items.push({ task: t, remaining, skill, weekIdx, noDeadline, assignee });
    }

    const toCellTask = (it: DemandItem): CellTask => ({
      taskId: it.task._id as string,
      title: it.task.title,
      projectId: it.task.projectId as string,
      projectName:
        realProjects.get(it.task.projectId as string)?.name ?? "—",
      hours: it.remaining,
      assigneeName: it.assignee
        ? (it.assignee.name ?? it.assignee.email ?? null)
        : null,
    });

    // --- Matice per skill ---
    const skillKeys: (SkillKey | "ostatni")[] = [...SKILLS];
    if (items.some((i) => i.skill === "ostatni")) skillKeys.push("ostatni");

    const skillRows = skillKeys.map((skill) => {
      const pool = activeUsers.filter((u) =>
        skill === "ostatni" ? false : (u.skills ?? []).includes(skill),
      );
      const capacity = pool.reduce(
        (s, u) => s + (u.weeklyCapacityHours ?? DEFAULT_CAPACITY_HOURS),
        0,
      );
      const mine = items.filter((i) => i.skill === skill);
      const cells = Array.from({ length: numWeeks }, (_, w) => {
        const inWeek = mine.filter((i) => i.weekIdx === w);
        const demand =
          Math.round(inWeek.reduce((s, i) => s + i.remaining, 0) * 10) / 10;
        return { demand, tasks: inWeek.map(toCellTask) };
      });
      const later =
        Math.round(
          mine
            .filter((i) => i.weekIdx === null && !i.noDeadline)
            .reduce((s, i) => s + i.remaining, 0) * 10,
        ) / 10;
      const unscheduled =
        Math.round(
          mine.filter((i) => i.noDeadline).reduce((s, i) => s + i.remaining, 0) *
            10,
        ) / 10;
      return { skill, capacity, people: pool.length, cells, later, unscheduled };
    });

    // --- Matice per člověk (chytá multi-skill přetížení) ---
    const peopleRows = activeUsers
      .filter(
        (u) =>
          (u.skills ?? []).length > 0 ||
          items.some((i) => i.assignee?._id === u._id),
      )
      .map((u) => {
        const capacity = u.weeklyCapacityHours ?? DEFAULT_CAPACITY_HOURS;
        const mine = items.filter((i) => i.assignee?._id === u._id);
        const cells = Array.from({ length: numWeeks }, (_, w) => {
          const inWeek = mine.filter((i) => i.weekIdx === w);
          const demand =
            Math.round(inWeek.reduce((s, i) => s + i.remaining, 0) * 10) / 10;
          return { demand, tasks: inWeek.map(toCellTask) };
        });
        const later =
          Math.round(
            mine
              .filter((i) => i.weekIdx === null && !i.noDeadline)
              .reduce((s, i) => s + i.remaining, 0) * 10,
          ) / 10;
        const unscheduled =
          Math.round(
            mine
              .filter((i) => i.noDeadline)
              .reduce((s, i) => s + i.remaining, 0) * 10,
          ) / 10;
        return {
          userId: u._id as string,
          name: u.name ?? u.email ?? "—",
          department: u.department ?? null,
          skills: u.skills ?? [],
          calibration: calibration.get(u._id as string) ?? null,
          capacity,
          cells,
          later,
          unscheduled,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));

    // Úkoly s odhadem bez přiřazení i bez skillu jsou v "ostatni" — informativně.
    const missingEstimateCount = allTasks.filter(
      (t) =>
        t.status !== "done" &&
        realProjects.has(t.projectId as string) &&
        (!t.estimateHours || t.estimateHours <= 0),
    ).length;

    return {
      weekStart: args.weekStart,
      weeks: numWeeks,
      skills: skillRows,
      people: peopleRows,
      missingEstimateCount,
    };
  },
});

/**
 * Vytížení jednoho člověka v týdnu daného termínu — pro varování ve formuláři
 * úkolu („tento řešitel bude v týdnu termínu přetížený").
 *
 * Vrací demand (zbývající kalibrované odhady jeho úkolů s termínem v tom
 * týdnu, bez excludeTaskId), capacity a kalibrační faktor — prospektivní
 * zátěž s aktuálně editovaným úkolem si dopočítá klient.
 */
export const assigneeWeekLoad = query({
  args: {
    userId: v.id("users"),
    weekStart: v.number(),
    excludeTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user || user.isActive === false) return null;
    const weekEnd = args.weekStart + WEEK_MS;
    const capacity = user.weeklyCapacityHours ?? DEFAULT_CAPACITY_HOURS;
    const now = Date.now();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", args.userId))
      .collect();

    // Kalibrace jen pro tohoto člověka
    let est = 0;
    let act = 0;
    let n = 0;
    for (const t of tasks) {
      if (
        t.status !== "done" ||
        t.completedAt === undefined ||
        t.completedAt < now - CALIBRATION_WINDOW_MS ||
        !t.estimateHours ||
        t.estimateHours <= 0
      )
        continue;
      const entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      const a = entries.reduce((s, e) => s + e.hours, 0);
      if (a <= 0) continue;
      est += t.estimateHours;
      act += a;
      n += 1;
    }
    const calibration =
      n >= 3 && est >= 10
        ? Math.round(Math.min(2, Math.max(0.5, act / est)) * 100) / 100
        : 1;

    let demand = 0;
    let taskCount = 0;
    const projectCache = new Map<string, Doc<"projects"> | null>();
    for (const t of tasks) {
      if (t.status === "done") continue;
      if (args.excludeTaskId && t._id === args.excludeTaskId) continue;
      if (!t.estimateHours || t.estimateHours <= 0) continue;
      if (!t.deadline || t.deadline < args.weekStart || t.deadline >= weekEnd)
        continue;
      let p = projectCache.get(t.projectId as string);
      if (p === undefined) {
        p = await ctx.db.get(t.projectId);
        projectCache.set(t.projectId as string, p);
      }
      if (!p || p.isTemplate === true || p.status === "archived") continue;
      const entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      const logged = entries.reduce((s, e) => s + e.hours, 0);
      const remaining = Math.max(0, t.estimateHours * calibration - logged);
      if (remaining > 0) {
        demand += remaining;
        taskCount += 1;
      }
    }
    return {
      demand: Math.round(demand * 10) / 10,
      capacity,
      calibration,
      taskCount,
    };
  },
});
