import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const REMINDER_HORIZON_DAYS = 3;
const REMIND_AGAIN_AFTER_HOURS = 22;
const DAY_MS = 24 * 3600 * 1000;

function startOfTodayUtc(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy}`;
}

export const runDeadlineReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = startOfTodayUtc();
    const horizon = today + REMINDER_HORIZON_DAYS * DAY_MS;

    const tasks = await ctx.db.query("tasks").collect();
    let emitted = 0;

    for (const task of tasks) {
      if (task.status === "done") continue;
      if (!task.deadline) continue;
      if (task.deadline > horizon) continue;
      if (!task.assigneeId) continue;

      const lastReminder = await ctx.db
        .query("notifications")
        .withIndex("by_recipient", (q) => q.eq("recipientId", task.assigneeId!))
        .filter((q) =>
          q.and(
            q.eq(q.field("type"), "deadline_soon"),
            q.eq(q.field("taskId"), task._id),
          ),
        )
        .order("desc")
        .first();
      if (
        lastReminder &&
        now - lastReminder._creationTime < REMIND_AGAIN_AFTER_HOURS * 3600 * 1000
      ) {
        continue;
      }

      const isOverdue = task.deadline < today;
      const daysUntil = Math.ceil((task.deadline - today) / DAY_MS);
      let body: string;
      if (isOverdue) {
        body = `${task.title} – termín ${formatDay(task.deadline)} (po termínu)`;
      } else if (daysUntil === 0) {
        body = `${task.title} – termín dnes`;
      } else if (daysUntil === 1) {
        body = `${task.title} – termín zítra`;
      } else {
        body = `${task.title} – termín za ${daysUntil} dny`;
      }

      const notificationId = await ctx.db.insert("notifications", {
        recipientId: task.assigneeId,
        type: "deadline_soon",
        title: isOverdue ? "Úkol po termínu" : "Blížící se termín úkolu",
        body,
        projectId: task.projectId,
        taskId: task._id,
      });
      await ctx.scheduler.runAfter(
        60 * 1000,
        internal.email.sendNotificationEmail,
        { notificationId },
      );
      emitted += 1;
    }

    return { emitted };
  },
});
