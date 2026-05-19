import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { logAction } from "./lib/audit";
import {
  canViewProject,
  isAdmin,
  isPm,
  isDeptLead,
} from "./lib/permissions";
import type { Doc, Id } from "./_generated/dataModel";

const BACKDATING_AUDIT_THRESHOLD_MS = 14 * 24 * 3600 * 1000;
const MAX_BLOCK_MS = 24 * 3600 * 1000;

function computeHours(startMs: number, endMs: number): number {
  return Math.round(((endMs - startMs) / 3600000) * 100) / 100;
}

function validateBlock(startTime: number, endTime: number) {
  if (endTime <= startTime) {
    throw new ConvexError("Konec musí být po začátku");
  }
  if (endTime - startTime > MAX_BLOCK_MS) {
    throw new ConvexError("Blok nemůže být delší než 24 hodin");
  }
  if (startTime > Date.now() + 5 * 60 * 1000) {
    throw new ConvexError("Záznam v budoucnosti není povolen");
  }
}

async function canEditEntry(
  ctx: { db: { get: (id: any) => any } },
  me: Doc<"users">,
  entry: Doc<"timeEntries">,
): Promise<boolean> {
  if (entry.userId === me._id) return true;
  if (isAdmin(me)) return true;
  if (isPm(me)) {
    const project = await ctx.db.get(entry.projectId);
    if (project && project.ownerId === me._id) return true;
  }
  if (isDeptLead(me) && me.department) {
    const target = await ctx.db.get(entry.userId);
    if (target && target.department === me.department) return true;
  }
  return false;
}

async function ensureProjectAccess(
  ctx: { db: { get: (id: any) => any; query: (t: any) => any } },
  me: Doc<"users">,
  projectId: Id<"projects">,
) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new ConvexError("Projekt nenalezen");
  const allowed = await canViewProject(ctx as any, me, project);
  if (!allowed) throw new ConvexError("Nemáte přístup k projektu");
  return project;
}

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    taskId: v.optional(v.id("tasks")),
    startTime: v.number(),
    endTime: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    validateBlock(args.startTime, args.endTime);
    const project = await ensureProjectAccess(ctx, me, args.projectId);

    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task) throw new ConvexError("Úkol nenalezen");
      if (task.projectId !== args.projectId) {
        throw new ConvexError("Úkol nepatří do tohoto projektu");
      }
    }

    const hours = computeHours(args.startTime, args.endTime);
    const id = await ctx.db.insert("timeEntries", {
      userId: me._id,
      projectId: args.projectId,
      taskId: args.taskId,
      startTime: args.startTime,
      endTime: args.endTime,
      hours,
      note: args.note?.trim() || undefined,
    });

    if (args.startTime < Date.now() - BACKDATING_AUDIT_THRESHOLD_MS) {
      await logAction(ctx, {
        actor: me,
        action: "timeEntry.add.backdated",
        entityType: "project",
        entityId: args.projectId,
        projectId: args.projectId,
        summary: `Zalogoval ${hours} h zpětně k ${new Date(args.startTime).toLocaleDateString("cs-CZ")} v projektu „${project.name}"`,
      });
    }

    return id;
  },
});

export const update = mutation({
  args: {
    entryId: v.id("timeEntries"),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.union(v.id("tasks"), v.null())),
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new ConvexError("Záznam nenalezen");
    if (!(await canEditEntry(ctx, me, entry))) {
      throw new ConvexError("Nemáte oprávnění editovat tento záznam");
    }

    const newStart = args.startTime ?? entry.startTime;
    const newEnd = args.endTime ?? entry.endTime;
    validateBlock(newStart, newEnd);

    const patch: Record<string, unknown> = {};
    if (args.startTime !== undefined) patch.startTime = args.startTime;
    if (args.endTime !== undefined) patch.endTime = args.endTime;
    if (args.startTime !== undefined || args.endTime !== undefined) {
      patch.hours = computeHours(newStart, newEnd);
    }
    if (args.note !== undefined) {
      patch.note = args.note === null ? undefined : args.note.trim() || undefined;
    }
    if (args.projectId !== undefined) {
      await ensureProjectAccess(ctx, me, args.projectId);
      patch.projectId = args.projectId;
    }
    if (args.taskId !== undefined) {
      if (args.taskId === null) {
        patch.taskId = undefined;
      } else {
        const targetProjectId = (args.projectId as Id<"projects"> | undefined) ?? entry.projectId;
        const task = await ctx.db.get(args.taskId);
        if (!task) throw new ConvexError("Úkol nenalezen");
        if (task.projectId !== targetProjectId) {
          throw new ConvexError("Úkol nepatří do projektu");
        }
        patch.taskId = args.taskId;
      }
    }

    await ctx.db.patch(args.entryId, patch);

    if (entry.userId !== me._id) {
      await logAction(ctx, {
        actor: me,
        action: "timeEntry.editCizi",
        entityType: "project",
        entityId: entry.projectId,
        projectId: entry.projectId,
        summary: `Upravil cizí záznam (${entry.hours} h)`,
      });
    } else if (entry.startTime < Date.now() - BACKDATING_AUDIT_THRESHOLD_MS) {
      await logAction(ctx, {
        actor: me,
        action: "timeEntry.editBackdated",
        entityType: "project",
        entityId: entry.projectId,
        projectId: entry.projectId,
        summary: `Upravil zpětný záznam k ${new Date(entry.startTime).toLocaleDateString("cs-CZ")}`,
      });
    }
  },
});

export const remove = mutation({
  args: { entryId: v.id("timeEntries") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry) return;
    if (!(await canEditEntry(ctx, me, entry))) {
      throw new ConvexError("Nemáte oprávnění smazat tento záznam");
    }
    await ctx.db.delete(args.entryId);
    if (entry.userId !== me._id) {
      await logAction(ctx, {
        actor: me,
        action: "timeEntry.deleteCizi",
        entityType: "project",
        entityId: entry.projectId,
        projectId: entry.projectId,
        summary: `Smazal cizí záznam (${entry.hours} h)`,
      });
    }
  },
});

export const listForUserRange = query({
  args: {
    userId: v.optional(v.id("users")),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const targetUserId = args.userId ?? me._id;
    if (targetUserId !== me._id) {
      if (!isAdmin(me) && !isPm(me)) {
        if (isDeptLead(me)) {
          const target = await ctx.db.get(targetUserId);
          if (!target || target.department !== me.department) return [];
        } else {
          return [];
        }
      }
    }
    const rows = await ctx.db
      .query("timeEntries")
      .withIndex("by_user_start", (q) =>
        q
          .eq("userId", targetUserId)
          .gte("startTime", args.rangeStart)
          .lt("startTime", args.rangeEnd),
      )
      .collect();
    return rows.sort((a, b) => a.startTime - b.startTime);
  },
});

export const loggedForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return 0;
    const project = await ctx.db.get(task.projectId);
    if (!project) return 0;
    if (!(await canViewProject(ctx, me, project))) return 0;
    const rows = await ctx.db
      .query("timeEntries")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    let total = 0;
    for (const r of rows) total += r.hours;
    return Math.round(total * 100) / 100;
  },
});

export const myThisWeekTotal = query({
  args: {
    weekStart: v.optional(v.number()),
    weekEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    let start: number;
    let end: number;
    if (args.weekStart !== undefined && args.weekEnd !== undefined) {
      start = args.weekStart;
      end = args.weekEnd;
    } else {
      const now = new Date();
      const day = now.getUTCDay() || 7;
      const monday = new Date(now);
      monday.setUTCDate(now.getUTCDate() - (day - 1));
      monday.setUTCHours(0, 0, 0, 0);
      start = monday.getTime();
      end = start + 7 * 24 * 3600 * 1000;
    }
    const rows = await ctx.db
      .query("timeEntries")
      .withIndex("by_user_start", (q) =>
        q.eq("userId", me._id).gte("startTime", start).lt("startTime", end),
      )
      .collect();
    let total = 0;
    for (const r of rows) total += r.hours;
    return { hours: Math.round(total * 100) / 100, weekStart: start, weekEnd: end };
  },
});

export const listForProject = query({
  args: {
    projectId: v.id("projects"),
    rangeStart: v.optional(v.number()),
    rangeEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    if (!(await canViewProject(ctx, me, project))) return [];

    const rows = await ctx.db
      .query("timeEntries")
      .withIndex("by_project_start", (q) => {
        const base = q.eq("projectId", args.projectId);
        if (args.rangeStart !== undefined && args.rangeEnd !== undefined) {
          return base
            .gte("startTime", args.rangeStart)
            .lt("startTime", args.rangeEnd);
        }
        if (args.rangeStart !== undefined) {
          return base.gte("startTime", args.rangeStart);
        }
        if (args.rangeEnd !== undefined) {
          return base.lt("startTime", args.rangeEnd);
        }
        return base;
      })
      .collect();
    rows.sort((a, b) => a.startTime - b.startTime);
    return rows;
  },
});

export const projectSummary = query({
  args: {
    projectId: v.id("projects"),
    rangeStart: v.optional(v.number()),
    rangeEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    if (!(await canViewProject(ctx, me, project))) return null;

    const rows = await ctx.db
      .query("timeEntries")
      .withIndex("by_project_start", (q) => {
        const base = q.eq("projectId", args.projectId);
        if (args.rangeStart !== undefined && args.rangeEnd !== undefined) {
          return base
            .gte("startTime", args.rangeStart)
            .lt("startTime", args.rangeEnd);
        }
        if (args.rangeStart !== undefined) {
          return base.gte("startTime", args.rangeStart);
        }
        if (args.rangeEnd !== undefined) {
          return base.lt("startTime", args.rangeEnd);
        }
        return base;
      })
      .collect();

    let totalHours = 0;
    const byUser = new Map<string, number>();
    const byTask = new Map<string, number>();
    for (const r of rows) {
      totalHours += r.hours;
      byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + r.hours);
      const key = (r.taskId as string | undefined) ?? "__general__";
      byTask.set(key, (byTask.get(key) ?? 0) + r.hours);
    }

    const userIds = Array.from(byUser.keys());
    const taskIds = Array.from(byTask.keys()).filter((k) => k !== "__general__");

    const users: Array<{ user: Doc<"users">; hours: number }> = [];
    for (const uid of userIds) {
      const u = await ctx.db.get(uid as Id<"users">);
      if (u) users.push({ user: u, hours: Math.round((byUser.get(uid) ?? 0) * 100) / 100 });
    }
    users.sort((a, b) => b.hours - a.hours);

    const tasks: Array<{ task: Doc<"tasks">; hours: number }> = [];
    for (const tid of taskIds) {
      const t = await ctx.db.get(tid as Id<"tasks">);
      if (t) tasks.push({ task: t, hours: Math.round((byTask.get(tid) ?? 0) * 100) / 100 });
    }
    tasks.sort((a, b) => b.hours - a.hours);

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      generalHours:
        Math.round((byTask.get("__general__") ?? 0) * 100) / 100,
      users,
      tasks,
      entryCount: rows.length,
    };
  },
});

export const pivot = query({
  args: {
    rangeStart: v.number(),
    rangeEnd: v.number(),
    department: v.optional(
      v.union(
        v.literal("it"),
        v.literal("facility"),
        v.literal("vyroba"),
        v.literal("cross"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!isAdmin(me) && !isPm(me) && !isDeptLead(me)) return null;

    const filtered = await ctx.db
      .query("timeEntries")
      .withIndex("by_start", (q) =>
        q.gte("startTime", args.rangeStart).lt("startTime", args.rangeEnd),
      )
      .collect();

    const projects = await ctx.db.query("projects").collect();
    const projectById = new Map(projects.map((p) => [p._id as string, p]));
    const users = await ctx.db.query("users").collect();
    const userById = new Map(users.map((u) => [u._id as string, u]));

    const isStrictDeptLead =
      isDeptLead(me) && !isAdmin(me) && !isPm(me) && !!me.department;
    const isStrictPm = isPm(me) && !isAdmin(me);

    // Project scope:
    //  - admin: all projects
    //  - pm (not admin): only projects they own
    //  - dept_lead (strict): own department + cross projects
    const allowedProjectIds = new Set(
      projects
        .filter((p) => {
          if (isAdmin(me)) return true;
          if (isStrictPm) return p.ownerId === me._id;
          if (isStrictDeptLead) {
            return p.department === me.department || p.department === "cross";
          }
          return false;
        })
        .map((p) => p._id as string),
    );

    // User scope: dept_lead sees only their dept; admin & pm see anyone who
    // logged time on a project in scope.
    const usersInScope = isStrictDeptLead
      ? users.filter((u) => u.department === me.department)
      : users;
    const allowedUserIds = new Set(usersInScope.map((u) => u._id as string));

    const visible = filtered.filter((r) => {
      if (!allowedUserIds.has(r.userId as string)) return false;
      if (!allowedProjectIds.has(r.projectId as string)) return false;
      const p = projectById.get(r.projectId as string);
      if (!p) return false;
      if (args.department && p.department !== args.department) return false;
      return true;
    });

    const userTotals = new Map<string, Map<string, number>>(); // userId → projectId → hours
    const userGrand = new Map<string, number>();
    const projectGrand = new Map<string, number>();
    for (const r of visible) {
      const userKey = r.userId as string;
      const projKey = r.projectId as string;
      let row = userTotals.get(userKey);
      if (!row) {
        row = new Map();
        userTotals.set(userKey, row);
      }
      row.set(projKey, (row.get(projKey) ?? 0) + r.hours);
      userGrand.set(userKey, (userGrand.get(userKey) ?? 0) + r.hours);
      projectGrand.set(projKey, (projectGrand.get(projKey) ?? 0) + r.hours);
    }

    const projectIds = Array.from(projectGrand.keys()).sort((a, b) =>
      (projectById.get(a)?.name ?? "").localeCompare(
        projectById.get(b)?.name ?? "",
        "cs",
      ),
    );

    // Include all active users in scope, even with 0 hours, so vedoucí vidí
    // kdo nevykazuje. PM nemanažuje lidi → vidí jen ty, co reálně logovali na
    // jejich projektech.
    const rowUserIds = new Set<string>(userTotals.keys());
    if (!isStrictPm) {
      for (const u of usersInScope) {
        if (u.isActive !== false) rowUserIds.add(u._id as string);
      }
    }

    const rowsOut = Array.from(rowUserIds)
      .map((uid) => ({
        user: userById.get(uid)!,
        cells: projectIds.map(
          (pid) => Math.round(((userTotals.get(uid)?.get(pid) ?? 0) * 100)) / 100,
        ),
        total: Math.round((userGrand.get(uid) ?? 0) * 100) / 100,
      }))
      .filter((r) => r.user)
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return (a.user.name ?? a.user.email ?? "").localeCompare(
          b.user.name ?? b.user.email ?? "",
          "cs",
        );
      });

    return {
      projects: projectIds.map((id) => ({
        project: projectById.get(id)!,
        total: Math.round((projectGrand.get(id) ?? 0) * 100) / 100,
      })),
      rows: rowsOut,
      grandTotal:
        Math.round(
          Array.from(projectGrand.values()).reduce((a, b) => a + b, 0) * 100,
        ) / 100,
    };
  },
});
