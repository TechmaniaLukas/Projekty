"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Flag } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PROJECT_DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  type ProjectDepartment,
} from "@/lib/constants";
import { formatDate, isOverdue, isDeadlineSoon } from "@/lib/dates";
import { cn } from "@/lib/utils";

const MS_STATUS_LABEL: Record<string, string> = {
  planned: "Plánováno",
  in_progress: "Probíhá",
  submitted: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Vráceno",
};

export function UpcomingMilestones() {
  const items = useQuery(api.milestones.upcomingForMe, { days: 30 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="h-5 w-5" />
          Nadcházející milníky (30 dní)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items === undefined ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Načítám…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Žádné milníky v nejbližších 30 dnech.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 8).map((m) => {
              const overdue = isOverdue(m.dueDate);
              const soon = !overdue && isDeadlineSoon(m.dueDate, 7);
              return (
                <li key={m._id}>
                  <Link
                    href={`/projekty/${m.projectId}?tab=milestones`}
                    className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {m.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge
                          tone={
                            DEPARTMENT_COLORS[
                              m.department as ProjectDepartment
                            ]
                          }
                        >
                          {
                            PROJECT_DEPARTMENT_LABELS[
                              m.department as ProjectDepartment
                            ]
                          }
                        </Badge>
                        <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {m.projectName} · {MS_STATUS_LABEL[m.status]}
                        </span>
                      </div>
                      {m.taskStats.total > 0 && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div
                              className="h-full bg-blue-500"
                              style={{
                                width: `${m.taskStats.percent ?? 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {m.taskStats.done}/{m.taskStats.total}
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        overdue
                          ? "text-red-600 dark:text-red-400"
                          : soon
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-500 dark:text-slate-400",
                      )}
                    >
                      {formatDate(m.dueDate)}
                      {overdue && " (po termínu)"}
                    </span>
                  </Link>
                </li>
              );
            })}
            {items.length > 8 && (
              <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                + dalších {items.length - 8}…
              </p>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
