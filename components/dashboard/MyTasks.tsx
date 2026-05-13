"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/tasks/StatusBadge";
import { formatDate, isOverdue, isDeadlineSoon } from "@/lib/dates";
import { PRIORITY_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function MyTasks() {
  const tasks = useQuery(api.tasks.listMyTasks, { onlyActive: true });
  const projects = useQuery(api.projects.list, {});

  if (tasks === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Moje úkoly</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">Načítám…</p>
        </CardContent>
      </Card>
    );
  }

  const projectById = new Map<string, Doc<"projects">>();
  for (const p of projects ?? []) projectById.set(p._id, p);

  const sorted = [...tasks].sort((a, b) => {
    const da = a.deadline ?? Infinity;
    const db = b.deadline ?? Infinity;
    if (da !== db) return da - db;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Moje úkoly</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Aktuálně nemáš přiřazené žádné aktivní úkoly.</p>
        ) : (
          <div className="space-y-2">
            {sorted.slice(0, 8).map((t) => {
              const overdue = isOverdue(t.deadline);
              const soon = !overdue && isDeadlineSoon(t.deadline, 7);
              const project = projectById.get(t.projectId);
              return (
                <Link
                  key={t._id}
                  href={`/projekty/${t.projectId}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate dark:text-slate-100">{t.title}</div>
                    {project && (
                      <div className="text-xs text-slate-500 truncate dark:text-slate-400">{project.name}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                    {t.deadline && (
                      <span
                        className={cn(
                          "text-xs",
                          overdue
                            ? "text-red-600 font-medium dark:text-red-400"
                            : soon
                            ? "text-amber-600 font-medium dark:text-amber-400"
                            : "text-slate-500 dark:text-slate-400",
                        )}
                      >
                        {formatDate(t.deadline)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
            {sorted.length > 8 && (
              <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                + dalších {sorted.length - 8}…
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
