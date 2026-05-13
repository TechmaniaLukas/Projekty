export type Role = "admin" | "pm" | "department_lead" | "member";
export type Department = "it" | "facility" | "vyroba";
export type ProjectDepartment = Department | "cross";
export type ProjectStatus = "planning" | "active" | "on_hold" | "done" | "archived";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "done";
export type Priority = "low" | "medium" | "high" | "critical";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Vedoucí tech. odd.",
  pm: "Projektový manažer",
  department_lead: "Vedoucí oddělení",
  member: "Člen",
};

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "pm", label: ROLE_LABELS.pm },
  { value: "department_lead", label: ROLE_LABELS.department_lead },
  { value: "member", label: ROLE_LABELS.member },
];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  it: "IT",
  facility: "Facility",
  vyroba: "Výroba",
};

export const DEPARTMENT_OPTIONS: { value: Department; label: string }[] = [
  { value: "it", label: "IT" },
  { value: "facility", label: "Facility" },
  { value: "vyroba", label: "Výroba" },
];

export const PROJECT_DEPARTMENT_LABELS: Record<ProjectDepartment, string> = {
  it: "IT",
  facility: "Facility",
  vyroba: "Výroba",
  cross: "Mezi-oddělenský",
};

export const PROJECT_DEPARTMENT_OPTIONS: { value: ProjectDepartment; label: string }[] = [
  { value: "it", label: "IT" },
  { value: "facility", label: "Facility" },
  { value: "vyroba", label: "Výroba" },
  { value: "cross", label: "Mezi-oddělenský" },
];

export const DEPARTMENT_COLORS: Record<ProjectDepartment, string> = {
  it: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-900",
  facility: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900",
  vyroba: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900",
  cross: "bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-900",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Plánování",
  active: "Aktivní",
  on_hold: "Pozastaveno",
  done: "Dokončeno",
  archived: "Archivováno",
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  active: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-900",
  on_hold: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-900",
  done: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-200 dark:border-green-900",
  archived: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "K udělání",
  in_progress: "Probíhá",
  blocked: "Blokováno",
  review: "Kontrola",
  done: "Hotovo",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-900",
  blocked: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900",
  review: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-900",
  done: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-200 dark:border-green-900",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Nízká",
  medium: "Střední",
  high: "Vysoká",
  critical: "Kritická",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  medium: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900",
  high: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-900",
  critical: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: PROJECT_STATUS_LABELS.planning },
  { value: "active", label: PROJECT_STATUS_LABELS.active },
  { value: "on_hold", label: PROJECT_STATUS_LABELS.on_hold },
  { value: "done", label: PROJECT_STATUS_LABELS.done },
  { value: "archived", label: PROJECT_STATUS_LABELS.archived },
];

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: TASK_STATUS_LABELS.todo },
  { value: "in_progress", label: TASK_STATUS_LABELS.in_progress },
  { value: "blocked", label: TASK_STATUS_LABELS.blocked },
  { value: "review", label: TASK_STATUS_LABELS.review },
  { value: "done", label: TASK_STATUS_LABELS.done },
];

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: PRIORITY_LABELS.low },
  { value: "medium", label: PRIORITY_LABELS.medium },
  { value: "high", label: PRIORITY_LABELS.high },
  { value: "critical", label: PRIORITY_LABELS.critical },
];
