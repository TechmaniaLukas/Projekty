"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  isSameDay,
  isBefore,
  startOfDay,
} from "date-fns";
import { cs } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  PROJECT_DEPARTMENT_OPTIONS,
  DEPARTMENT_COLORS,
  PROJECT_DEPARTMENT_LABELS,
  type ProjectDepartment,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

interface DayItem {
  type: "project" | "task";
  id: string;
  title: string;
  href: string;
  department: ProjectDepartment;
  done: boolean;
}

export default function KalendarPage() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [deptFilter, setDeptFilter] = useState<ProjectDepartment | "">("");

  const projects = useQuery(api.projects.list, {
    department: deptFilter || undefined,
    includeArchived: false,
  });

  const taskFetchProjectIds = projects?.map((p) => p._id) ?? [];
  const allTasks = useQuery(
    api.tasks.tasksWithDeadlines,
    projects ? { projectIds: taskFetchProjectIds } : "skip",
  );

  const days = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = start;
    while (!isBefore(end, d)) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [cursor]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    for (const p of projects ?? []) {
      if (!p.deadline) continue;
      const key = format(new Date(p.deadline), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push({
        type: "project",
        id: p._id,
        title: p.name,
        href: `/projekty/${p._id}`,
        department: p.department,
        done: p.status === "done",
      });
      map.set(key, arr);
    }
    const projectById = new Map<string, Doc<"projects">>();
    for (const p of projects ?? []) projectById.set(p._id, p);
    for (const t of allTasks ?? []) {
      if (!t.deadline) continue;
      const project = projectById.get(t.projectId);
      if (!project) continue;
      const key = format(new Date(t.deadline), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push({
        type: "task",
        id: t._id,
        title: t.title,
        href: `/projekty/${t.projectId}`,
        department: project.department,
        done: t.status === "done",
      });
      map.set(key, arr);
    }
    return map;
  }, [projects, allTasks]);

  const today = startOfDay(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kalendář</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value as ProjectDepartment | "")}
            className="w-auto min-w-[160px]"
          >
            <option value="">Všechna oddělení</option>
            {PROJECT_DEPARTMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(subMonths(cursor, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(startOfMonth(new Date()))}
          >
            Dnes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <h2 className="text-lg font-semibold capitalize">
        {format(cursor, "LLLL yyyy", { locale: cs })}
      </h2>
      <Card>
        <CardContent className="p-0 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600 dark:text-slate-400"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, cursor);
              const isToday = isSameDay(day, today);
              const dayItems = itemsByDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[100px] border-b border-r border-slate-200 p-1.5 last-of-row:border-r-0 dark:border-slate-800",
                    !inMonth && "bg-slate-50/40 text-slate-400 dark:bg-slate-800/30 dark:text-slate-500",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex h-5 w-5 items-center justify-center text-xs font-semibold",
                      isToday && "rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
                      !isToday && inMonth && "text-slate-700 dark:text-slate-300",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={cn(
                          "block truncate rounded border px-1 py-0.5 text-[10px] font-medium",
                          DEPARTMENT_COLORS[item.department],
                          item.done && "line-through opacity-60",
                        )}
                        title={`${item.type === "project" ? "Projekt" : "Úkol"}: ${item.title}`}
                      >
                        {item.type === "project" ? "★ " : ""}
                        {item.title}
                      </Link>
                    ))}
                    {dayItems.length > 3 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        +{dayItems.length - 3} dalších
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs">
        {(["it", "facility", "vyroba", "cross"] as const).map((dep) => (
          <div key={dep} className="flex items-center gap-1.5">
            <Badge tone={DEPARTMENT_COLORS[dep]}>
              {PROJECT_DEPARTMENT_LABELS[dep]}
            </Badge>
          </div>
        ))}
        <span className="text-slate-500 dark:text-slate-400">★ projekt · text úkol</span>
      </div>
    </div>
  );
}
