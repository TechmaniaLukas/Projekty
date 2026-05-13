"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { CalendarClock, AlertCircle, CheckCircle2, ListTodo } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  PROJECT_DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  DEPARTMENT_LABELS,
  type Department,
  type ProjectDepartment,
  type TaskStatus,
  type Priority,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function StatisticsPage() {
  const me = useQuery(api.users.me);
  const stats = useQuery(api.projects.stats);

  if (me === undefined || stats === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (me?.role !== "admin" && me?.role !== "pm") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Statistiky jsou dostupné jen pro admina a projektového manažera.
      </div>
    );
  }

  const taskStatusKeys: TaskStatus[] = ["todo", "in_progress", "blocked", "review", "done"];
  const priorityKeys: Priority[] = ["critical", "high", "medium", "low"];
  const deptKeys: ProjectDepartment[] = ["it", "facility", "vyroba", "cross"];

  const totalTasks = taskStatusKeys.reduce(
    (sum, s) => sum + (stats.tasksByStatus[s] ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Statistiky</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<ListTodo className="h-5 w-5 text-slate-600 dark:text-slate-400" />}
          label="Aktivní úkoly"
          value={stats.openTotal}
          hint={`z ${totalTasks} celkem`}
        />
        <KpiCard
          icon={<CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
          label="Termín tento týden"
          value={stats.dueThisWeek}
          hint="pouze nedokončené"
          tone={stats.dueThisWeek > 0 ? "warn" : undefined}
        />
        <KpiCard
          icon={<AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
          label="Po termínu"
          value={stats.overdue}
          hint="vyžaduje pozornost"
          tone={stats.overdue > 0 ? "danger" : undefined}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          label="Dokončené (7 dní)"
          value={stats.completedThisWeek}
          hint={`${stats.completedThisMonth} za 30 dní`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projekty po odděleních</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deptKeys.map((dep) => {
                const data = stats.projectsByDept[dep];
                if (!data) return null;
                return (
                  <div key={dep} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={DEPARTMENT_COLORS[dep]}>
                        {PROJECT_DEPARTMENT_LABELS[dep]}
                      </Badge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {data.total} celkem
                      </span>
                    </div>
                    <StackBar
                      segments={[
                        { value: data.active, color: "bg-blue-500", label: "aktivní" },
                        { value: data.planning, color: "bg-slate-400", label: "plán." },
                        { value: data.on_hold, color: "bg-orange-500", label: "pauza" },
                        { value: data.done, color: "bg-emerald-500", label: "hotovo" },
                      ]}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stav úkolů</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {taskStatusKeys.map((s) => {
                const count = stats.tasksByStatus[s] ?? 0;
                const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className="w-32 shrink-0">
                      <Badge tone={TASK_STATUS_COLORS[s]}>
                        {TASK_STATUS_LABELS[s]}
                      </Badge>
                    </div>
                    <div className="relative flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-5 rounded-full bg-slate-900 dark:bg-slate-300"
                        style={{ width: `${pct}%`, opacity: 0.85 }}
                      />
                    </div>
                    <div className="w-16 shrink-0 text-right text-sm">
                      <span className="font-medium">{count}</span>
                      <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Priorita úkolů</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {priorityKeys.map((p) => {
                const count = stats.tasksByPriority[p] ?? 0;
                const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
                return (
                  <div key={p} className="flex items-center gap-3">
                    <div className="w-24 shrink-0">
                      <Badge tone={PRIORITY_COLORS[p]}>
                        {PRIORITY_LABELS[p]}
                      </Badge>
                    </div>
                    <div className="relative flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={cn(
                          "h-5 rounded-full",
                          p === "critical"
                            ? "bg-red-500"
                            : p === "high"
                              ? "bg-orange-500"
                              : p === "medium"
                                ? "bg-amber-500"
                                : "bg-zinc-400",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-16 shrink-0 text-right text-sm">
                      <span className="font-medium">{count}</span>
                      <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top vytíženosti</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topAssignees.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Žádné přiřazené úkoly.</p>
            ) : (
              <ol className="space-y-2">
                {stats.topAssignees.map((a, i) => (
                  <li
                    key={a.userId}
                    className="flex items-center gap-3 rounded-md border border-slate-200 p-2 dark:border-slate-800"
                  >
                    <span className="w-5 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
                      {i + 1}
                    </span>
                    <Avatar name={a.name ?? null} email={a.email ?? null} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate dark:text-slate-100">
                        {a.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {a.department
                          ? DEPARTMENT_LABELS[a.department as Department]
                          : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {a.count}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">otevř.</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        Tip: <Link href="/projekty?archived=1" className="underline">Archivované projekty</Link> a
        jejich úkoly nejsou ve statistikách zahrnuté.
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: "warn" | "danger";
}) {
  return (
    <Card
      className={cn(
        tone === "warn" && "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
        tone === "danger" && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
      )}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            tone === "warn" ? "bg-amber-100 dark:bg-amber-950/50" : tone === "danger" ? "bg-red-100 dark:bg-red-950/50" : "bg-slate-100 dark:bg-slate-800",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
          {hint && <div className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function StackBar({
  segments,
}: {
  segments: { value: number; color: string; label: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="text-xs text-slate-400 dark:text-slate-500">Žádné projekty.</div>
    );
  }
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={i}
              className={s.color}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${s.value}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
            {s.label}: <span className="font-medium">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
