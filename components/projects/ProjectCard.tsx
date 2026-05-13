"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  PROJECT_DEPARTMENT_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  DEPARTMENT_COLORS,
} from "@/lib/constants";
import { formatDate, isOverdue, isDeadlineSoon } from "@/lib/dates";

interface Props {
  project: Doc<"projects">;
  owner?: Doc<"users"> | null;
  stats?: { total: number; done: number; overdue: number };
}

export function ProjectCard({ project, owner, stats }: Props) {
  const overdue = isOverdue(project.deadline);
  const soon = !overdue && isDeadlineSoon(project.deadline, 7);
  const progress = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <Link href={`/projekty/${project._id}`} className="group block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={DEPARTMENT_COLORS[project.department]}>
                {PROJECT_DEPARTMENT_LABELS[project.department]}
              </Badge>
              <Badge tone={PROJECT_STATUS_COLORS[project.status]}>
                {PROJECT_STATUS_LABELS[project.status]}
              </Badge>
              <Badge tone={PRIORITY_COLORS[project.priority]}>
                {PRIORITY_LABELS[project.priority]}
              </Badge>
            </div>
          </div>
          <h3 className="text-base font-semibold text-slate-900 group-hover:text-slate-700 dark:text-slate-100 dark:group-hover:text-slate-300">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-sm text-slate-500 line-clamp-2 dark:text-slate-400">
              {project.description}
            </p>
          )}
          {stats && stats.total > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1 dark:text-slate-400">
                <span>
                  {stats.done}/{stats.total} úkolů
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <span
                className={
                  overdue
                    ? "font-medium text-red-600 dark:text-red-400"
                    : soon
                    ? "font-medium text-amber-600 dark:text-amber-400"
                    : ""
                }
              >
                {formatDate(project.deadline)}
                {overdue && " (po termínu)"}
                {soon && " (brzy)"}
              </span>
            </div>
            {owner && <Avatar name={owner.name ?? null} email={owner.email ?? null} size="sm" />}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
