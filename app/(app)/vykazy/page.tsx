"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { TimeBlockDialog } from "@/components/time/TimeBlockDialog";
import { PROJECT_DEPARTMENT_LABELS, DEPARTMENT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay() || 7;
  if (day !== 1) r.setDate(r.getDate() - (day - 1));
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatHours(h: number): string {
  return h.toString().replace(".", ",");
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

export default function VykazyPage() {
  const me = useQuery(api.users.me);
  const projects = useQuery(api.projects.list, { includeArchived: true });
  const allTasks = useQuery(
    api.tasks.tasksForProjects,
    projects ? { projectIds: projects.map((p) => p._id) } : "skip",
  );
  const remove = useMutation(api.timeEntries.remove);
  const submitWeek = useMutation(api.timesheets.submitWeek);
  const toast = useToast();

  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [logOpen, setLogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Doc<"timeEntries"> | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const entries = useQuery(api.timeEntries.listForUserRange, {
    rangeStart: weekStart.getTime(),
    rangeEnd: weekEnd.getTime(),
  });

  const submission = useQuery(api.timesheets.statusForWeek, {
    periodStart: weekStart.getTime(),
  });

  const projectsById = useMemo(() => {
    const m = new Map<string, Doc<"projects">>();
    for (const p of projects ?? []) m.set(p._id, p);
    return m;
  }, [projects]);

  const tasksById = useMemo(() => {
    const m = new Map<string, Doc<"tasks">>();
    for (const t of allTasks ?? []) m.set(t._id, t);
    return m;
  }, [allTasks]);

  const byDay = useMemo(() => {
    const map: Doc<"timeEntries">[][] = Array.from({ length: 7 }, () => []);
    for (const e of entries ?? []) {
      const d = new Date(e.startTime);
      d.setHours(0, 0, 0, 0);
      const diff = Math.floor((d.getTime() - weekStart.getTime()) / 86400000);
      if (diff >= 0 && diff < 7) map[diff].push(e);
    }
    for (const arr of map) arr.sort((a, b) => a.startTime - b.startTime);
    return map;
  }, [entries, weekStart]);

  const totalHours = (entries ?? []).reduce((s, e) => s + e.hours, 0);
  const target = 40;
  const todayMidnight = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  async function onDelete(id: Id<"timeEntries">) {
    if (!confirm("Smazat tento záznam?")) return;
    await remove({ entryId: id });
    toast.success("Záznam smazán");
  }

  const weekLabel = `${weekStart.getDate()}. ${weekStart.getMonth() + 1}. – ${addDays(weekStart, 6).getDate()}. ${addDays(weekStart, 6).getMonth() + 1}. ${addDays(weekStart, 6).getFullYear()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Můj výkaz
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Týden {weekLabel} —{" "}
            <strong>
              {formatHours(Math.round(totalHours * 100) / 100)} h
            </strong>{" "}
            zalogováno{target ? ` / cíl ${target} h` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            Tento týden
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={() => setLogOpen(true)}>
            <Plus className="h-4 w-4" />
            Zalogovat čas
          </Button>
          {(me?.role === "admin" ||
            me?.role === "pm" ||
            me?.role === "department_lead") && (
            <Link href="/vykazy/prehled">
              <Button variant="outline" size="sm">
                Přehled týmu →
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="text-sm">
          {!submission && (
            <span className="text-slate-500 dark:text-slate-400">
              Tento týden zatím nebyl odeslán ke schválení.
            </span>
          )}
          {submission?.status === "submitted" && (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              ⏳ Odesláno ke schválení ({formatHours(submission.totalHours)} h)
            </span>
          )}
          {submission?.status === "approved" && (
            <span className="font-medium text-green-700 dark:text-green-400">
              ✓ Schváleno ({formatHours(submission.totalHours)} h)
            </span>
          )}
          {submission?.status === "rejected" && (
            <span className="font-medium text-red-700 dark:text-red-400">
              ⚠ Vráceno k přepracování
              {submission.rejectionReason
                ? `: ${submission.rejectionReason}`
                : ""}
            </span>
          )}
        </div>
        {submission?.status !== "submitted" &&
          submission?.status !== "approved" && (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await submitWeek({
                    periodStart: weekStart.getTime(),
                    periodEnd: weekEnd.getTime(),
                  });
                  toast.success("Výkaz odeslán ke schválení");
                } catch (err) {
                  toast.error(
                    "Nelze odeslat",
                    err instanceof Error ? err.message : "",
                  );
                }
              }}
            >
              Odeslat ke schválení
            </Button>
          )}
      </div>

      <Card>
        <CardContent className="space-y-0 p-0 divide-y divide-slate-100 dark:divide-slate-800">
          {days.map((d, i) => {
            const dayEntries = byDay[i];
            const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
            const isToday = d.getTime() === todayMidnight;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={i}
                className={cn(
                  "px-4 py-3",
                  isToday && "bg-blue-50/40 dark:bg-blue-950/20",
                  isWeekend && !isToday && "bg-slate-50/40 dark:bg-slate-800/30",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "min-w-[60px]",
                        isToday && "font-bold text-blue-700 dark:text-blue-300",
                      )}
                    >
                      <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                        {DAY_NAMES[i]}
                      </div>
                      <div className="text-base text-slate-900 dark:text-slate-100">
                        {d.getDate()}. {d.getMonth() + 1}.
                      </div>
                    </div>
                    {dayTotal > 0 && (
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Σ {formatHours(Math.round(dayTotal * 100) / 100)} h
                      </span>
                    )}
                  </div>
                </div>

                {dayEntries.length === 0 ? (
                  <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                    Žádné záznamy.
                  </div>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {dayEntries.map((e) => {
                      const project = projectsById.get(e.projectId);
                      const task = e.taskId ? tasksById.get(e.taskId) : null;
                      return (
                        <li
                          key={e._id}
                          className="group flex flex-wrap items-center gap-2 sm:gap-3 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                        >
                          <span className="font-mono text-xs text-slate-600 tabular-nums dark:text-slate-400">
                            {formatTime(e.startTime)}–{formatTime(e.endTime)}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {formatHours(e.hours)} h
                          </span>
                          {project && (
                            <Badge
                              tone={DEPARTMENT_COLORS[project.department]}
                            >
                              {PROJECT_DEPARTMENT_LABELS[project.department]}
                            </Badge>
                          )}
                          <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-300">
                            {project && (
                              <Link
                                href={`/projekty/${project._id}`}
                                className="hover:underline"
                              >
                                {project.name}
                              </Link>
                            )}
                            {task ? (
                              <>
                                {" · "}
                                <span className="text-slate-600 dark:text-slate-400">
                                  {task.title}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">
                                {" · obecné"}
                              </span>
                            )}
                            {e.note && (
                              <>
                                {" — "}
                                <span className="text-slate-500 dark:text-slate-400 italic">
                                  {e.note}
                                </span>
                              </>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditEntry(e)}
                            className="inline-flex md:hidden md:group-hover:inline-flex rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                            title="Upravit"
                            aria-label="Upravit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(e._id)}
                            className="inline-flex md:hidden md:group-hover:inline-flex rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            title="Smazat"
                            aria-label="Smazat"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <TimeBlockDialog open={logOpen} onClose={() => setLogOpen(false)} />
      {editEntry && (
        <TimeBlockDialog
          open
          onClose={() => setEditEntry(null)}
          editEntry={editEntry}
        />
      )}
    </div>
  );
}
