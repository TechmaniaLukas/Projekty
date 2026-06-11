"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Crown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, isOverdue, isDeadlineSoon } from "@/lib/dates";
import { SKILL_LABELS, type Skill } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function PendingApprovals() {
  const items = useQuery(api.milestones.myPendingApprovals, {});

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    if (day !== 1) d.setDate(d.getDate() - (day - 1));
    return d.getTime();
  }, []);
  const bottlenecks = useQuery(
    api.capacity.bottleneckSummary,
    items && items.length > 0 ? { weekStart, weeks: 4 } : "skip",
  );

  if (items === undefined) return null;
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          Vyžaduje moje schválení
          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            {items.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bottlenecks && bottlenecks.length > 0 && (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            ⚠ Kontext pro rozhodování — přetížené disciplíny v příštích 4
            týdnech:{" "}
            {bottlenecks
              .map(
                (b) =>
                  `${SKILL_LABELS[b.skill as Skill] ?? b.skill} ${b.maxLoad} %`,
              )
              .join(", ")}
          </p>
        )}
        <ul className="space-y-2">
          {items.map((m) => {
            const overdue = isOverdue(m.dueDate);
            const soon = !overdue && isDeadlineSoon(m.dueDate, 7);
            return (
              <li
                key={m._id}
                className="rounded-md border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <Link
                  href={`/projekty/${m.projectId}?tab=milestones`}
                  className="block"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {m.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {m.project?.name ?? ""}
                      </div>
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
                    </span>
                  </div>
                  {m.taskStats && m.taskStats.total > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${m.taskStats.percent ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {m.taskStats.done}/{m.taskStats.total}
                      </span>
                    </div>
                  )}
                  {m.submitNote && (
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                      „{m.submitNote}"
                    </div>
                  )}
                  {m.submitter && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Avatar
                        name={m.submitter.name ?? null}
                        email={m.submitter.email ?? null}
                        size="sm"
                      />
                      Odeslal {m.submitter.name ?? m.submitter.email}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
