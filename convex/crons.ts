import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "deadline reminders",
  { hourUTC: 6, minuteUTC: 0 },
  internal.deadlines.runDeadlineReminders,
);

crons.weekly(
  "weekly timesheet reminders",
  { dayOfWeek: "monday", hourUTC: 7, minuteUTC: 0 },
  internal.timeReminders.runWeeklyTimesheetReminders,
);

export default crons;
