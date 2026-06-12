import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  isAdmin,
  isPm,
  isDeptLead,
  isDirector,
  canViewProject,
} from "./lib/permissions";
import { SKILLS } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

const DEFAULT_CAPACITY_HOURS = 32;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const CALIBRATION_WINDOW_MS = 90 * 24 * 3600 * 1000;

/**
 * Počet pracovních dnů (po–pá) v týdnu `weekStart`, které spadají do
 * některé nepřítomnosti uživatele. from/to jsou půlnoci, to včetně.
 */
function absentWorkdaysInWeek(
  weekStart: number,
  absences: { from: number; to: number }[],
): number {
  if (absences.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < 5; i++) {
    // Porovnáváme poledne dne s intervalem [from, to + 1 den): odolné vůči
    // posunu časových pásem (date input parsuje YYYY-MM-DD jako UTC půlnoc,
    // klientův weekStart je lokální půlnoc).
    const dayNoon = weekStart + i * DAY_MS + DAY_MS / 2;
    if (absences.some((a) => dayNoon >= a.from && dayNoon < a.to + DAY_MS)) {
      count++;
    }
  }
  return count;
}

/** Kapacita uživatele v konkrétním týdnu po odečtení nepřítomností. */
function userWeekCapacity(
  baseCapacity: number,
  weekStart: number,
  absences: { from: number; to: number }[],
): number {
  const absent = absentWorkdaysInWeek(weekStart, absences);
  if (absent === 0) return baseCapacity;
  return Math.max(0, Math.round(baseCapacity * (1 - absent / 5) * 10) / 10);
}

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

    const [users, allProjects, allTasks, allAbsences] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("tasks").collect(),
      ctx.db.query("absences").collect(),
    ]);

    const activeUsers = users.filter((u) => u.isActive !== false && u.role);
    const userById = new Map(activeUsers.map((u) => [u._id as string, u]));
    const absencesByUser = new Map<string, { from: number; to: number }[]>();
    for (const a of allAbsences) {
      const arr = absencesByUser.get(a.userId as string) ?? [];
      arr.push({ from: a.from, to: a.to });
      absencesByUser.set(a.userId as string, arr);
    }

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
        // Kapacita týdne snížená o nepřítomnosti členů poolu
        const weekCapacity =
          Math.round(
            pool.reduce(
              (s, u) =>
                s +
                userWeekCapacity(
                  u.weeklyCapacityHours ?? DEFAULT_CAPACITY_HOURS,
                  args.weekStart + w * WEEK_MS,
                  absencesByUser.get(u._id as string) ?? [],
                ),
              0,
            ) * 10,
          ) / 10;
        return { demand, capacity: weekCapacity, tasks: inWeek.map(toCellTask) };
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
        const myAbsences = absencesByUser.get(u._id as string) ?? [];
        const mine = items.filter((i) => i.assignee?._id === u._id);
        const cells = Array.from({ length: numWeeks }, (_, w) => {
          const inWeek = mine.filter((i) => i.weekIdx === w);
          const demand =
            Math.round(inWeek.reduce((s, i) => s + i.remaining, 0) * 10) / 10;
          const weekCapacity = userWeekCapacity(
            capacity,
            args.weekStart + w * WEEK_MS,
            myAbsences,
          );
          return { demand, capacity: weekCapacity, tasks: inWeek.map(toCellTask) };
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
    const baseCapacity = user.weeklyCapacityHours ?? DEFAULT_CAPACITY_HOURS;
    // Kapacita týdne snížená o nepřítomnosti (dovolená/nemoc)
    const myAbsences = await ctx.db
      .query("absences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const absentDays = absentWorkdaysInWeek(args.weekStart, myAbsences);
    const capacity = userWeekCapacity(baseCapacity, args.weekStart, myAbsences);
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
      baseCapacity,
      absentDays,
      calibration,
      taskCount,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Forecast engine (F3/F4): volná kapacita per skill per týden +       */
/* greedy rozvrh hodin do volných slotů                                */
/* ------------------------------------------------------------------ */

const FORECAST_HORIZON_WEEKS = 26;

interface FreeCapacityModel {
  /** základní kapacita (bez nepřítomností) — pro extrapolaci za horizont */
  capacityBySkill: Map<string, number>;
  /** kapacita per skill per týden snížená o nepřítomnosti */
  capacityBySkillWeek: Map<string, number[]>;
  /** volné hodiny per skill per týden (kapacita − existující poptávka) */
  freeBySkill: Map<string, number[]>;
  calibration: Map<string, number>;
  weekStart: number;
  numWeeks: number;
}

/**
 * Spočítá volnou kapacitu per skill per týden z existujících otevřených
 * úkolů (kalibrované zbývající odhady, šablony/archivované vyloučeny).
 * `excludeTaskIds` se z existující poptávky vynechají (budou rozvrženy zvlášť).
 */
async function buildFreeCapacityModel(
  ctx: QueryCtx,
  weekStart: number,
  numWeeks: number,
  excludeTaskIds: Set<string>,
): Promise<FreeCapacityModel> {
  const now = Date.now();
  const horizonEnd = weekStart + numWeeks * WEEK_MS;

  const [users, allProjects, allTasks, allAbsences] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("projects").collect(),
    ctx.db.query("tasks").collect(),
    ctx.db.query("absences").collect(),
  ]);

  const activeUsers = users.filter((u) => u.isActive !== false && u.role);
  const userById = new Map(activeUsers.map((u) => [u._id as string, u]));
  const absencesByUser = new Map<string, { from: number; to: number }[]>();
  for (const a of allAbsences) {
    const arr = absencesByUser.get(a.userId as string) ?? [];
    arr.push({ from: a.from, to: a.to });
    absencesByUser.set(a.userId as string, arr);
  }
  const realProjects = new Set(
    allProjects
      .filter((p) => p.isTemplate !== true && p.status !== "archived")
      .map((p) => p._id as string),
  );

  // Kalibrace per assignee
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

  // Kapacita per skill: základní (pro extrapolaci za horizont) + per týden
  // snížená o nepřítomnosti členů poolu.
  const capacityBySkill = new Map<string, number>();
  const capacityBySkillWeek = new Map<string, number[]>();
  for (const s of SKILLS) {
    const pool = activeUsers.filter((u) => (u.skills ?? []).includes(s));
    capacityBySkill.set(
      s,
      pool.reduce(
        (sum, u) => sum + (u.weeklyCapacityHours ?? DEFAULT_CAPACITY_HOURS),
        0,
      ),
    );
    capacityBySkillWeek.set(
      s,
      Array.from({ length: numWeeks }, (_, w) =>
        pool.reduce(
          (sum, u) =>
            sum +
            userWeekCapacity(
              u.weeklyCapacityHours ?? DEFAULT_CAPACITY_HOURS,
              weekStart + w * WEEK_MS,
              absencesByUser.get(u._id as string) ?? [],
            ),
          0,
        ),
      ),
    );
  }

  // Existující poptávka per skill per týden
  const demandBySkill = new Map<string, number[]>();
  for (const s of SKILLS) demandBySkill.set(s, Array(numWeeks).fill(0));

  for (const t of allTasks) {
    if (t.status === "done") continue;
    if (excludeTaskIds.has(t._id as string)) continue;
    if (!realProjects.has(t.projectId as string)) continue;
    if (!t.estimateHours || t.estimateHours <= 0) continue;
    if (!t.deadline) continue;

    const clamped = Math.max(t.deadline, weekStart);
    if (clamped >= horizonEnd) continue;
    const weekIdx = Math.floor((clamped - weekStart) / WEEK_MS);

    const assignee = t.assigneeId ? userById.get(t.assigneeId as string) : undefined;
    const skill =
      (t.skill as string | undefined) ??
      (assignee?.skills?.[0] as string | undefined);
    if (!skill || !demandBySkill.has(skill)) continue;

    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_task", (q) => q.eq("taskId", t._id))
      .collect();
    const logged = entries.reduce((s, e) => s + e.hours, 0);
    const factor = t.assigneeId
      ? (calibration.get(t.assigneeId as string) ?? 1)
      : 1;
    const remaining = Math.max(0, t.estimateHours * factor - logged);
    if (remaining <= 0) continue;
    demandBySkill.get(skill)![weekIdx] += remaining;
  }

  const freeBySkill = new Map<string, number[]>();
  for (const s of SKILLS) {
    const capWeeks = capacityBySkillWeek.get(s)!;
    freeBySkill.set(
      s,
      demandBySkill.get(s)!.map((d, w) => Math.max(0, capWeeks[w] - d)),
    );
  }

  return {
    capacityBySkill,
    capacityBySkillWeek,
    freeBySkill,
    calibration,
    weekStart,
    numWeeks,
  };
}

/**
 * Greedy rozvrh: kolik týdnů potřebuje `hours` hodin daného skillu, počínaje
 * `startIdx`, do volných slotů. Za horizontem předpokládá plnou kapacitu.
 * Vrací index týdne dokončení, nebo null pokud skill nemá žádnou kapacitu.
 */
function scheduleSkillHours(
  hours: number,
  free: number[],
  capacityPerWeek: number,
  startIdx: number,
): number | null {
  if (hours <= 0) return startIdx;
  if (capacityPerWeek <= 0) return null;
  let h = hours;
  for (let w = startIdx; w < free.length; w++) {
    h -= free[w];
    if (h <= 0) return w;
  }
  return free.length - 1 + Math.ceil(h / capacityPerWeek);
}

/**
 * F4 — realistický termín milníku: zbývající hodiny navázaných úkolů
 * rozvržené do volné kapacity per skill. Porovnání s plánovaným dueDate.
 */
export const milestoneForecast = query({
  args: { milestoneId: v.id("milestones"), weekStart: v.number() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return null;
    const project = await ctx.db.get(milestone.projectId);
    if (!project) return null;
    if (!(await canViewProject(ctx, me, project))) return null;
    if (milestone.status === "approved") return null;

    const linked = await ctx.db
      .query("tasks")
      .withIndex("by_milestone", (q) => q.eq("milestoneId", args.milestoneId))
      .collect();
    const openLinked = linked.filter((t) => t.status !== "done");
    if (openLinked.length === 0) return null;

    const withEstimate = openLinked.filter(
      (t) => t.estimateHours && t.estimateHours > 0,
    );
    const missingEstimates = openLinked.length - withEstimate.length;
    if (withEstimate.length === 0) {
      return {
        forecastDate: null,
        dueDate: milestone.dueDate,
        atRisk: false,
        missingEstimates,
        blockedSkills: [] as string[],
        totalRemaining: 0,
      };
    }

    const excludeIds = new Set(withEstimate.map((t) => t._id as string));
    const model = await buildFreeCapacityModel(
      ctx,
      args.weekStart,
      FORECAST_HORIZON_WEEKS,
      excludeIds,
    );

    // Zbývající hodiny per skill (kalibrované, minus zalogováno)
    const users = await ctx.db.query("users").collect();
    const userById = new Map(users.map((u) => [u._id as string, u]));
    const neededBySkill = new Map<string, number>();
    let totalRemaining = 0;
    for (const t of withEstimate) {
      const entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_task", (q) => q.eq("taskId", t._id))
        .collect();
      const logged = entries.reduce((s, e) => s + e.hours, 0);
      const factor = t.assigneeId
        ? (model.calibration.get(t.assigneeId as string) ?? 1)
        : 1;
      const remaining = Math.max(0, (t.estimateHours ?? 0) * factor - logged);
      if (remaining <= 0) continue;
      totalRemaining += remaining;
      const assignee = t.assigneeId
        ? userById.get(t.assigneeId as string)
        : undefined;
      const skill =
        (t.skill as string | undefined) ??
        (assignee?.skills?.[0] as string | undefined) ??
        "__none__";
      neededBySkill.set(skill, (neededBySkill.get(skill) ?? 0) + remaining);
    }
    if (totalRemaining <= 0) return null;

    let maxFinishIdx = 0;
    const blockedSkills: string[] = [];
    for (const [skill, hours] of neededBySkill) {
      if (skill === "__none__") {
        // bez disciplíny nedokážeme rozvrhnout — započti optimisticky 1 týden
        maxFinishIdx = Math.max(maxFinishIdx, 0);
        continue;
      }
      const finish = scheduleSkillHours(
        hours,
        model.freeBySkill.get(skill) ?? [],
        model.capacityBySkill.get(skill) ?? 0,
        0,
      );
      if (finish === null) {
        blockedSkills.push(skill);
      } else {
        maxFinishIdx = Math.max(maxFinishIdx, finish);
      }
    }

    const forecastDate =
      blockedSkills.length > 0
        ? null
        : args.weekStart + (maxFinishIdx + 1) * WEEK_MS - 1;

    return {
      forecastDate,
      dueDate: milestone.dueDate,
      atRisk: forecastDate !== null && forecastDate > milestone.dueDate,
      missingEstimates,
      blockedSkills,
      totalRemaining: Math.round(totalRemaining * 10) / 10,
    };
  },
});

/**
 * F3 — projekce dokončení projektu ze šablony: hodiny šablonových úkolů
 * per skill rozvržené do volné kapacity od zvoleného začátku.
 */
export const templateForecast = query({
  args: {
    templateId: v.id("projects"),
    weekStart: v.number(),
    startDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl || tpl.isTemplate !== true) return null;
    if (!(await canViewProject(ctx, me, tpl))) return null;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.templateId))
      .collect();
    const withEstimate = tasks.filter(
      (t) => t.estimateHours && t.estimateHours > 0,
    );
    if (withEstimate.length === 0) {
      return { forecastDate: null, totalHours: 0, perSkill: [], blockedSkills: [], unskilledHours: 0, startWeekIdx: 0 };
    }

    const model = await buildFreeCapacityModel(
      ctx,
      args.weekStart,
      FORECAST_HORIZON_WEEKS,
      new Set(),
    );

    const startIdx = Math.max(
      0,
      args.startDate
        ? Math.floor((args.startDate - args.weekStart) / WEEK_MS)
        : 0,
    );

    const neededBySkill = new Map<string, number>();
    let unskilledHours = 0;
    let totalHours = 0;
    for (const t of withEstimate) {
      totalHours += t.estimateHours!;
      const skill = t.skill as string | undefined;
      if (!skill) {
        unskilledHours += t.estimateHours!;
        continue;
      }
      neededBySkill.set(
        skill,
        (neededBySkill.get(skill) ?? 0) + t.estimateHours!,
      );
    }

    let maxFinishIdx = startIdx;
    const blockedSkills: string[] = [];
    const perSkill: {
      skill: string;
      hours: number;
      finishWeekIdx: number | null;
    }[] = [];
    for (const [skill, hours] of neededBySkill) {
      const finish = scheduleSkillHours(
        hours,
        model.freeBySkill.get(skill) ?? [],
        model.capacityBySkill.get(skill) ?? 0,
        startIdx,
      );
      perSkill.push({ skill, hours: Math.round(hours * 10) / 10, finishWeekIdx: finish });
      if (finish === null) blockedSkills.push(skill);
      else maxFinishIdx = Math.max(maxFinishIdx, finish);
    }
    perSkill.sort(
      (a, b) => (b.finishWeekIdx ?? 999) - (a.finishWeekIdx ?? 999),
    );

    const forecastDate =
      blockedSkills.length > 0
        ? null
        : args.weekStart + (maxFinishIdx + 1) * WEEK_MS - 1;

    return {
      forecastDate,
      totalHours: Math.round(totalHours * 10) / 10,
      unskilledHours: Math.round(unskilledHours * 10) / 10,
      perSkill,
      blockedSkills,
      startWeekIdx: startIdx,
    };
  },
});

/**
 * F4 — souhrn přetížených disciplín v příštích N týdnech (kontext pro
 * schvalovatele milníků a dashboard).
 */
export const bottleneckSummary = query({
  args: { weekStart: v.number(), weeks: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!isAdmin(me) && !isPm(me) && !isDeptLead(me) && !isDirector(me)) {
      return null;
    }
    const numWeeks = Math.min(Math.max(args.weeks ?? 4, 1), 12);
    const model = await buildFreeCapacityModel(
      ctx,
      args.weekStart,
      numWeeks,
      new Set(),
    );
    const out: { skill: string; maxLoad: number }[] = [];
    for (const s of SKILLS) {
      if ((model.capacityBySkill.get(s) ?? 0) <= 0) continue;
      const capWeeks = model.capacityBySkillWeek.get(s)!;
      const free = model.freeBySkill.get(s)!;
      let maxLoad = 0;
      for (let w = 0; w < numWeeks; w++) {
        if (capWeeks[w] <= 0) continue; // celý pool nepřítomen
        const demand = capWeeks[w] - free[w];
        maxLoad = Math.max(maxLoad, Math.round((demand / capWeeks[w]) * 100));
      }
      if (maxLoad > 95) out.push({ skill: s, maxLoad });
    }
    out.sort((a, b) => b.maxLoad - a.maxLoad);
    return out;
  },
});
