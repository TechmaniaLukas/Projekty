"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  PROJECT_DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
} from "@/lib/constants";
import { formatDate, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function UpcomingDeadlines() {
  const tasks = useQuery(api.tasks.listUpcoming, { days: 7 });
  const projects = useQuery(api.projects.list, {});
  const users = useQuery(api.users.list, {});

  if (tasks === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Termíny tento týden</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">Načítám…</p>
        </CardContent>
      </Card>
    );
  }

  const projectById = new Map<string, Doc<"projects">>();
  for (const p of projects ?? []) projectById.set(p._id, p);
  const userById = new Map<string, Doc<"users">>();
  for (const u of users ?? []) userById.set(u._id, u);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Termíny tento týden</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Žádné termíny v nejbližších 7 dnech.</p>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 8).map((t) => {
              const project = projectById.get(t.projectId);
              const assignee = t.assigneeId ? userById.get(t.assigneeId) : null;
              const overdue = isOverdue(t.deadline);
              return (
                <Link
                  key={t._id}
                  href={`/projekty/${t.projectId}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate dark:text-slate-100">{t.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {project && (
                        <Badge tone={DEPARTMENT_COLORS[project.department]}>
                          {PROJECT_DEPARTMENT_LABELS[project.department]}
                        </Badge>
                      )}
                      {project && (
                        <span className="text-xs text-slate-500 truncate dark:text-slate-400">
                          {project.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {assignee && (
                      <Avatar
                        name={assignee.name ?? null}
                        email={assignee.email ?? null}
                        size="sm"
                      />
                    )}
                    <span
                      className={cn(
                        "text-xs",
                        overdue ? "text-red-600 font-medium dark:text-red-400" : "text-amber-600 font-medium dark:text-amber-400",
                      )}
                    >
                      {formatDate(t.deadline)}
                      {overdue && " (po termínu)"}
                    </span>
                  </div>
                </Link>
              );
            })}
            {tasks.length > 8 && (
              <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                + dalších {tasks.length - 8}…
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
