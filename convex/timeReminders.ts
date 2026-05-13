import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const WEEK_MS = 7 * 24 * 3600 * 1000;
const MIN_HOURS_TO_SKIP = 20;

function startOfLastWeekUtc(now: Date): number {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1) - 7);
  return d.getTime();
}

export const runWeeklyTimesheetReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const lastWeekStart = startOfLastWeekUtc(now);
    const lastWeekEnd = lastWeekStart + WEEK_MS;

    const users = await ctx.db.query("users").collect();
    let sent = 0;

    for (const u of users) {
      if (u.isActive === false) continue;
      if (!u.role) continue;
      if (u.role === "admin" || u.role === "pm") continue;

      const hadActiveAssignedTask = await ctx.db
        .query("tasks")
        .withIndex("by_assignee", (q) => q.eq("assigneeId", u._id))
        .filter((q) =>
          q.and(
            q.lt(q.field("_creationTime"), lastWeekEnd),
            q.neq(q.field("status"), "done"),
          ),
        )
        .first();
      if (!hadActiveAssignedTask) continue;

      const entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_user_start", (q) =>
          q
            .eq("userId", u._id)
            .gte("startTime", lastWeekStart)
            .lt("startTime", lastWeekEnd),
        )
        .collect();
      const totalHours = entries.reduce((s, e) => s + e.hours, 0);
      if (totalHours >= MIN_HOURS_TO_SKIP) continue;

      const recent = await ctx.db
        .query("notifications")
        .withIndex("by_recipient", (q) => q.eq("recipientId", u._id))
        .filter((q) => q.eq(q.field("type"), "deadline_soon"))
        .order("desc")
        .first();
      if (
        recent &&
        recent.title === "Doplň výkaz za minulý týden" &&
        now.getTime() - recent._creationTime < 5 * 24 * 3600 * 1000
      ) {
        continue;
      }

      const notificationId: Id<"notifications"> = await ctx.db.insert(
        "notifications",
        {
          recipientId: u._id,
          type: "deadline_soon",
          title: "Doplň výkaz za minulý týden",
          body:
            totalHours > 0
              ? `Máš zalogováno ${totalHours.toString().replace(".", ",")} h. Doplň zbytek v /vykazy.`
              : `Žádné záznamy. Doplň výkaz v /vykazy.`,
        },
      );
      await ctx.scheduler.runAfter(
        60 * 1000,
        internal.email.sendNotificationEmail,
        { notificationId },
      );
      sent += 1;
    }

    return { sent };
  },
});
