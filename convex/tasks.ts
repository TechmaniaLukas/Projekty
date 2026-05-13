import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  canViewProject,
  canEditTask,
  canAddTask,
  canDeleteTask,
} from "./lib/permissions";
import { emit, actorName } from "./lib/notify";
import { logAction } from "./lib/audit";
import { propagateDeadlineChange } from "./lib/scheduling";
import { syncMilestoneDueDate } from "./milestones";
import { TASK_STATUS_LABELS } from "./constants";
import { TASK_STATUSES, PRIORITIES } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

const taskStatus = v.union(...TASK_STATUSES.map((s) => v.literal(s)));
const priority = v.union(...PRIORITIES.map((p) => v.literal(p)));

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    const allowed = await canViewProject(ctx, me, project);
    if (!allowed) return [];
    return await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const get = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const project = await ctx.db.get(task.projectId);
    if (!project) return null;
    const allowed = await canViewProject(ctx, me, project);
    if (!allowed) return null;
    return task;
  },
});

export const tasksForProjects = query({
  args: { projectIds: v.array(v.id("projects")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const out: Doc<"tasks">[] = [];
    const projectCache = new Map<Id<"projects">, Doc<"projects"> | null>();
    for (const projectId of args.projectIds) {
      let project = projectCache.get(projectId);
      if (project === undefined) {
        project = await ctx.db.get(projectId);
        projectCache.set(projectId, project);
      }
      if (!project) continue;
      if (!(await canViewProject(ctx, me, project))) continue;
      const rows = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      for (const t of rows) out.push(t);
    }
    return out;
  },
});

export const tasksWithDeadlines = query({
  args: { projectIds: v.array(v.id("projects")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const out: Doc<"tasks">[] = [];
    const projectCache = new Map<Id<"projects">, Doc<"projects"> | null>();
    for (const projectId of args.projectIds) {
      let project = projectCache.get(projectId);
      if (project === undefined) {
        project = await ctx.db.get(projectId);
        projectCache.set(projectId, project);
      }
      if (!project) continue;
      if (!(await canViewProject(ctx, me, project))) continue;
      const rows = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      for (const t of rows) {
        if (t.deadline) out.push(t);
      }
    }
    return out;
  },
});

export const listMyTasks = query({
  args: { onlyActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", me._id))
      .collect();
    if (args.onlyActive) {
      return tasks.filter((t) => t.status !== "done");
    }
    return tasks;
  },
});

export const listUpcoming = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const horizon = now + (args.days ?? 7) * 24 * 60 * 60 * 1000;

    const allTasks = await ctx.db.query("tasks").collect();
    const accessible: Doc<"tasks">[] = [];
    const projectCache = new Map<Id<"projects">, Doc<"projects"> | null>();
    for (const t of allTasks) {
      if (t.status === "done") continue;
      if (!t.deadline || t.deadline > horizon) continue;
      let project = projectCache.get(t.projectId);
      if (project === undefined) {
        project = await ctx.db.get(t.projectId);
        projectCache.set(t.projectId, project);
      }
      if (!project) continue;
      if (await canViewProject(ctx, me, project)) accessible.push(t);
    }
    accessible.sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));
    return accessible;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    parentTaskId: v.optional(v.id("tasks")),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    status: v.optional(taskStatus),
    priority: v.optional(priority),
    startDate: v.optional(v.number()),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canAddTask(me, project)) {
      throw new ConvexError("Nemáte oprávnění přidat úkol");
    }
    if (args.parentTaskId) {
      const parent = await ctx.db.get(args.parentTaskId);
      if (!parent) throw new ConvexError("Nadřazený úkol nenalezen");
      if (parent.projectId !== args.projectId) {
        throw new ConvexError("Nadřazený úkol je z jiného projektu");
      }
    }

    const siblings = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", args.parentTaskId))
      .collect();
    const order = siblings.length;

    if (
      args.startDate !== undefined &&
      args.deadline !== undefined &&
      args.startDate > args.deadline
    ) {
      throw new ConvexError("Začátek nemůže být po termínu");
    }

    const taskId = await ctx.db.insert("tasks", {
      projectId: args.projectId,
      parentTaskId: args.parentTaskId,
      title: args.title,
      description: args.description,
      assigneeId: args.assigneeId,
      status: args.status ?? "todo",
      priority: args.priority ?? "medium",
      startDate: args.startDate,
      deadline: args.deadline,
      completedAt: args.status === "done" ? Date.now() : undefined,
      order,
      createdBy: me._id,
    });

    if (args.assigneeId) {
      await emit(ctx, {
        recipientId: args.assigneeId,
        actorId: me._id,
        type: "task_assigned",
        title: `${actorName(me)} ti přiřadil úkol`,
        body: `${args.title} (${project.name})`,
        projectId: args.projectId,
        taskId,
      });
    }

    await logAction(ctx, {
      actor: me,
      action: "task.create",
      entityType: "task",
      entityId: taskId,
      projectId: args.projectId,
      summary: `Vytvořil úkol „${args.title}"`,
    });

    return taskId;
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.union(v.id("users"), v.null())),
    status: v.optional(taskStatus),
    priority: v.optional(priority),
    startDate: v.optional(v.union(v.number(), v.null())),
    deadline: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("Úkol nenalezen");
    const project = await ctx.db.get(task.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canEditTask(me, project, task)) {
      throw new ConvexError("Nemáte oprávnění editovat úkol");
    }

    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.assigneeId !== undefined) {
      patch.assigneeId = args.assigneeId === null ? undefined : args.assigneeId;
    }
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.startDate !== undefined) {
      patch.startDate = args.startDate === null ? undefined : args.startDate;
    }
    if (args.deadline !== undefined) {
      patch.deadline = args.deadline === null ? undefined : args.deadline;
    }
    const finalStart =
      args.startDate !== undefined
        ? args.startDate === null
          ? undefined
          : args.startDate
        : task.startDate;
    const finalDeadline =
      args.deadline !== undefined
        ? args.deadline === null
          ? undefined
          : args.deadline
        : task.deadline;
    if (
      finalStart !== undefined &&
      finalDeadline !== undefined &&
      finalStart > finalDeadline
    ) {
      throw new ConvexError("Začátek nemůže být po termínu");
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "done" && task.status !== "done") {
        patch.completedAt = Date.now();
      } else if (args.status !== "done" && task.status === "done") {
        patch.completedAt = undefined;
      }
    }

    await ctx.db.patch(args.taskId, patch);

    const deadlineChanged =
      args.deadline !== undefined &&
      (args.deadline === null ? undefined : args.deadline) !== task.deadline;
    if (deadlineChanged) {
      await propagateDeadlineChange(ctx, args.taskId);
      // Pokud je úkol navázaný na milník, přepočítej jeho termín.
      if (task.milestoneId) {
        await syncMilestoneDueDate(ctx, task.milestoneId);
      }
    }

    if (Object.keys(patch).length > 0) {
      const summaryParts: string[] = [];
      if (args.status !== undefined && args.status !== task.status) {
        summaryParts.push(`stav → ${TASK_STATUS_LABELS[args.status] ?? args.status}`);
      }
      if (args.assigneeId !== undefined) {
        summaryParts.push("přiřazení");
      }
      if (deadlineChanged) summaryParts.push("termín");
      if (args.priority !== undefined) summaryParts.push("priorita");
      if (args.startDate !== undefined) summaryParts.push("začátek");
      if (args.title !== undefined && args.title !== task.title) {
        summaryParts.push("název");
      }
      const summary =
        summaryParts.length > 0
          ? `Upravil úkol „${task.title}" (${summaryParts.join(", ")})`
          : `Upravil úkol „${task.title}"`;
      await logAction(ctx, {
        actor: me,
        action: "task.update",
        entityType: "task",
        entityId: args.taskId,
        projectId: task.projectId,
        summary,
        details: patch,
      });
    }

    const newAssignee = args.assigneeId === null ? null : args.assigneeId;
    if (
      newAssignee !== undefined &&
      newAssignee &&
      newAssignee !== task.assigneeId
    ) {
      await emit(ctx, {
        recipientId: newAssignee,
        actorId: me._id,
        type: "task_assigned",
        title: `${actorName(me)} ti přiřadil úkol`,
        body: `${task.title} (${project.name})`,
        projectId: project._id,
        taskId: task._id,
      });
    }

    if (args.status !== undefined && args.status !== task.status) {
      const recipients = new Set<Id<"users">>();
      if (task.createdBy && task.createdBy !== me._id) recipients.add(task.createdBy);
      if (task.assigneeId && task.assigneeId !== me._id) recipients.add(task.assigneeId);
      if (project.ownerId && project.ownerId !== me._id) recipients.add(project.ownerId);
      const watchers = await ctx.db
        .query("taskWatchers")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const w of watchers) {
        if (w.userId !== me._id) recipients.add(w.userId);
      }
      const statusLabel = TASK_STATUS_LABELS[args.status] ?? args.status;
      for (const recipientId of recipients) {
        await emit(ctx, {
          recipientId,
          actorId: me._id,
          type: "task_status_changed",
          title: `${actorName(me)} změnil stav úkolu`,
          body: `${task.title} → ${statusLabel}`,
          projectId: project._id,
          taskId: task._id,
        });
      }
    }
  },
});

async function descendantIds(
  ctx: { db: { query: (t: "tasks") => any } },
  rootIds: Id<"tasks">[],
): Promise<Id<"tasks">[]> {
  const result: Id<"tasks">[] = [];
  let frontier = [...rootIds];
  while (frontier.length) {
    const next: Id<"tasks">[] = [];
    for (const id of frontier) {
      const children = await ctx.db
        .query("tasks")
        .withIndex("by_parent", (q: any) => q.eq("parentTaskId", id))
        .collect();
      for (const c of children) {
        result.push(c._id);
        next.push(c._id);
      }
    }
    frontier = next;
  }
  return result;
}

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return;
    const project = await ctx.db.get(task.projectId);
    if (!project) return;
    if (!canDeleteTask(me, project)) {
      throw new ConvexError("Nemáte oprávnění mazat úkoly");
    }
    await logAction(ctx, {
      actor: me,
      action: "task.delete",
      entityType: "task",
      entityId: args.taskId,
      projectId: task.projectId,
      summary: `Smazal úkol „${task.title}"`,
    });
    const descendants = await descendantIds(ctx as any, [args.taskId]);
    const allIds = [args.taskId, ...descendants];
    for (const id of allIds) {
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_task", (q) => q.eq("taskId", id))
        .collect();
      for (const c of comments) {
        const reactions = await ctx.db
          .query("commentReactions")
          .withIndex("by_comment", (q) => q.eq("commentId", c._id))
          .collect();
        for (const r of reactions) await ctx.db.delete(r._id);
        await ctx.db.delete(c._id);
      }
      const blockingDeps = await ctx.db
        .query("taskDependencies")
        .withIndex("by_blocking", (q) => q.eq("blockingTaskId", id))
        .collect();
      for (const d of blockingDeps) await ctx.db.delete(d._id);
      const blockedDeps = await ctx.db
        .query("taskDependencies")
        .withIndex("by_blocked", (q) => q.eq("blockedTaskId", id))
        .collect();
      for (const d of blockedDeps) await ctx.db.delete(d._id);
      const attachments = await ctx.db
        .query("attachments")
        .withIndex("by_task", (q) => q.eq("taskId", id))
        .collect();
      for (const a of attachments) {
        await ctx.storage.delete(a.storageId);
        await ctx.db.delete(a._id);
      }
      const watchers = await ctx.db
        .query("taskWatchers")
        .withIndex("by_task", (q) => q.eq("taskId", id))
        .collect();
      for (const w of watchers) await ctx.db.delete(w._id);
      const tEntries = await ctx.db
        .query("timeEntries")
        .withIndex("by_task", (q) => q.eq("taskId", id))
        .collect();
      for (const te of tEntries) await ctx.db.patch(te._id, { taskId: undefined });
      await ctx.db.delete(id);
    }
    // Po smazání úkolu(ů) přepočítej termíny milníků, na které byly navázány.
    const affectedMilestoneIds = new Set<string>();
    const allDeletedTasks = [task];
    for (const t of allDeletedTasks) {
      if (t.milestoneId) affectedMilestoneIds.add(t.milestoneId as string);
    }
    for (const mid of affectedMilestoneIds) {
      await syncMilestoneDueDate(ctx, mid as Id<"milestones">);
    }
  },
});

export const bulkUpdate = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
    status: v.optional(taskStatus),
    priority: v.optional(priority),
    assigneeId: v.optional(v.union(v.id("users"), v.null())),
    startDate: v.optional(v.union(v.number(), v.null())),
    deadline: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const projectCache = new Map<Id<"projects">, Doc<"projects"> | null>();
    let updated = 0;
    let skipped = 0;
    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task) {
        skipped += 1;
        continue;
      }
      let project = projectCache.get(task.projectId);
      if (project === undefined) {
        project = await ctx.db.get(task.projectId);
        projectCache.set(task.projectId, project);
      }
      if (!project) {
        skipped += 1;
        continue;
      }
      if (!canEditTask(me, project, task)) {
        skipped += 1;
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (args.priority !== undefined) patch.priority = args.priority;
      if (args.assigneeId !== undefined) {
        patch.assigneeId =
          args.assigneeId === null ? undefined : args.assigneeId;
      }
      if (args.startDate !== undefined) {
        patch.startDate =
          args.startDate === null ? undefined : args.startDate;
      }
      if (args.deadline !== undefined) {
        patch.deadline = args.deadline === null ? undefined : args.deadline;
      }
      if (args.status !== undefined && args.status !== task.status) {
        patch.status = args.status;
        if (args.status === "done") patch.completedAt = Date.now();
        else if (task.status === "done") patch.completedAt = undefined;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(taskId, patch);
        updated += 1;
      }

      if (args.deadline !== undefined) {
        await propagateDeadlineChange(ctx, taskId);
        if (task.milestoneId) {
          await syncMilestoneDueDate(ctx, task.milestoneId);
        }
      }

      const newAssignee = args.assigneeId === null ? null : args.assigneeId;
      if (
        newAssignee !== undefined &&
        newAssignee &&
        newAssignee !== task.assigneeId
      ) {
        await emit(ctx, {
          recipientId: newAssignee,
          actorId: me._id,
          type: "task_assigned",
          title: `${actorName(me)} ti přiřadil úkol`,
          body: `${task.title} (${project.name})`,
          projectId: project._id,
          taskId: task._id,
        });
      }
    }
    return { updated, skipped };
  },
});

export const bulkRemove = mutation({
  args: { taskIds: v.array(v.id("tasks")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const projectCache = new Map<Id<"projects">, Doc<"projects"> | null>();
    let removed = 0;
    let skipped = 0;
    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task) continue;
      let project = projectCache.get(task.projectId);
      if (project === undefined) {
        project = await ctx.db.get(task.projectId);
        projectCache.set(task.projectId, project);
      }
      if (!project || !canDeleteTask(me, project)) {
        skipped += 1;
        continue;
      }
      const descendants = await descendantIds(ctx as any, [taskId]);
      const allIds = [taskId, ...descendants];
      for (const id of allIds) {
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_task", (q) => q.eq("taskId", id))
          .collect();
        for (const c of comments) {
          const reactions = await ctx.db
            .query("commentReactions")
            .withIndex("by_comment", (q) => q.eq("commentId", c._id))
            .collect();
          for (const r of reactions) await ctx.db.delete(r._id);
          await ctx.db.delete(c._id);
        }
        const blockingDeps = await ctx.db
          .query("taskDependencies")
          .withIndex("by_blocking", (q) => q.eq("blockingTaskId", id))
          .collect();
        for (const d of blockingDeps) await ctx.db.delete(d._id);
        const blockedDeps = await ctx.db
          .query("taskDependencies")
          .withIndex("by_blocked", (q) => q.eq("blockedTaskId", id))
          .collect();
        for (const d of blockedDeps) await ctx.db.delete(d._id);
        const attachments = await ctx.db
          .query("attachments")
          .withIndex("by_task", (q) => q.eq("taskId", id))
          .collect();
        for (const a of attachments) {
          await ctx.storage.delete(a.storageId);
          await ctx.db.delete(a._id);
        }
        const watchers = await ctx.db
          .query("taskWatchers")
          .withIndex("by_task", (q) => q.eq("taskId", id))
          .collect();
        for (const w of watchers) await ctx.db.delete(w._id);
        const tEntries = await ctx.db
          .query("timeEntries")
          .withIndex("by_task", (q) => q.eq("taskId", id))
          .collect();
        for (const te of tEntries) await ctx.db.patch(te._id, { taskId: undefined });
        await ctx.db.delete(id);
      }
      removed += 1;
    }
    return { removed, skipped };
  },
});

export const reorder = mutation({
  args: {
    parentTaskId: v.optional(v.id("tasks")),
    projectId: v.id("projects"),
    orderedTaskIds: v.array(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canAddTask(me, project)) {
      throw new ConvexError("Nemáte oprávnění přeuspořádat úkoly");
    }
    for (let i = 0; i < args.orderedTaskIds.length; i++) {
      const taskId = args.orderedTaskIds[i];
      const task = await ctx.db.get(taskId);
      if (!task) continue;
      if (task.projectId !== args.projectId) continue;
      if ((task.parentTaskId ?? null) !== (args.parentTaskId ?? null)) continue;
      if (task.order !== i) {
        await ctx.db.patch(taskId, { order: i });
      }
    }
  },
});

export const move = mutation({
  args: {
    taskId: v.id("tasks"),
    parentTaskId: v.optional(v.union(v.id("tasks"), v.null())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("Úkol nenalezen");
    const project = await ctx.db.get(task.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen");
    if (!canEditTask(me, project, task)) {
      throw new ConvexError("Nemáte oprávnění");
    }
    const patch: Record<string, unknown> = {};
    if (args.parentTaskId !== undefined) {
      const newParent = args.parentTaskId === null ? undefined : args.parentTaskId;
      if (newParent) {
        const parent = await ctx.db.get(newParent);
        if (!parent) throw new ConvexError("Nadřazený úkol nenalezen");
        if (parent.projectId !== task.projectId) {
          throw new ConvexError("Nadřazený úkol je z jiného projektu");
        }
        const descendants = await descendantIds(ctx as any, [task._id]);
        if (newParent === task._id || descendants.includes(newParent)) {
          throw new ConvexError("Nelze přesunout úkol pod jeho potomka");
        }
      }
      patch.parentTaskId = newParent;
    }
    if (args.order !== undefined) patch.order = args.order;
    await ctx.db.patch(args.taskId, patch);
  },
});
