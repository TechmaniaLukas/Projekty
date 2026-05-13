"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  addDays,
  differenceInDays,
  startOfDay,
  startOfWeek,
  endOfWeek,
  format,
  isSameDay,
} from "date-fns";
import { cs } from "date-fns/locale";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  PROJECT_DEPARTMENT_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROJECT_DEPARTMENT_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
  DEPARTMENT_COLORS,
  type ProjectDepartment,
  type ProjectStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const DEFAULT_DURATION_DAYS = 14;
const COL_WIDTH = 36;
const ROW_HEIGHT = 44;
const LABEL_WIDTH = 240;

const DEPT_BAR_COLORS: Record<ProjectDepartment, string> = {
  it: "bg-sky-500",
  facility: "bg-emerald-500",
  vyroba: "bg-amber-500",
  cross: "bg-violet-500",
};

interface BarInfo {
  project: Doc<"projects">;
  start: Date;
  end: Date;
  startCol: number;
  spanCols: number;
  milestones: Array<{
    milestone: Doc<"milestones">;
    col: number;
  }>;
}

const MILESTONE_COLORS: Record<Doc<"milestones">["status"], string> = {
  planned: "bg-slate-500",
  in_progress: "bg-blue-700",
  submitted: "bg-amber-500",
  approved: "bg-green-600",
  rejected: "bg-red-600",
};

export default function CasovaOsaPage() {
  const [deptFilter, setDeptFilter] = useState<ProjectDepartment | "">("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");

  const projects = useQuery(api.projects.list, {
    department: deptFilter || undefined,
    status: statusFilter || undefined,
    includeArchived: false,
  });

  const milestones = useQuery(
    api.milestones.listForProjects,
    projects ? { projectIds: projects.map((p) => p._id) } : "skip",
  );

  const data = useMemo(() => {
    if (!projects) return null;

    const withDates = projects.filter((p) => p.deadline);
    if (withDates.length === 0) {
      return { bars: [], days: [], rangeStart: startOfDay(new Date()) };
    }

    const today = startOfDay(new Date());
    let earliest = today.getTime();
    let latest = today.getTime();
    for (const p of withDates) {
      const end = p.deadline!;
      const start =
        p.startDate ?? end - DEFAULT_DURATION_DAYS * 24 * 3600 * 1000;
      earliest = Math.min(earliest, start);
      latest = Math.max(latest, end);
    }
    const rangeStart = startOfWeek(
      new Date(earliest - 5 * 24 * 3600 * 1000),
      { weekStartsOn: 1 },
    );
    const rangeEnd = endOfWeek(new Date(latest + 14 * 24 * 3600 * 1000), {
      weekStartsOn: 1,
    });
    const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;

    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) days.push(addDays(rangeStart, i));

    const milestonesByProject = new Map<string, Doc<"milestones">[]>();
    for (const m of milestones ?? []) {
      const arr = milestonesByProject.get(m.projectId as string) ?? [];
      arr.push(m);
      milestonesByProject.set(m.projectId as string, arr);
    }

    const bars: BarInfo[] = withDates
      .map((p) => {
        const end = new Date(p.deadline!);
        const start = p.startDate
          ? new Date(p.startDate)
          : new Date(p.deadline! - DEFAULT_DURATION_DAYS * 24 * 3600 * 1000);
        const startCol = Math.max(0, differenceInDays(start, rangeStart));
        const endCol = Math.min(
          totalDays - 1,
          differenceInDays(end, rangeStart),
        );
        const spanCols = Math.max(1, endCol - startCol + 1);
        const projectMs = (milestonesByProject.get(p._id as string) ?? []).map(
          (m) => ({
            milestone: m,
            col: differenceInDays(new Date(m.dueDate), rangeStart),
          }),
        );
        return { project: p, start, end, startCol, spanCols, milestones: projectMs };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    return { bars, days, rangeStart };
  }, [projects, milestones]);

  if (projects === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Časová osa projektů</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={deptFilter}
            onChange={(e) =>
              setDeptFilter(e.target.value as ProjectDepartment | "")
            }
            className="w-auto min-w-[160px]"
          >
            <option value="">Všechna oddělení</option>
            {PROJECT_DEPARTMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ProjectStatus | "")
            }
            className="w-auto min-w-[160px]"
          >
            <option value="">Všechny stavy</option>
            {PROJECT_STATUS_OPTIONS.filter((o) => o.value !== "archived").map(
              (o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ),
            )}
          </Select>
        </div>
      </div>

      {data === null || data.bars.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Žádné projekty s termínem k zobrazení.
          </CardContent>
        </Card>
      ) : (
        <Timeline data={data} />
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {(["it", "facility", "vyroba", "cross"] as const).map((dep) => (
          <Badge key={dep} tone={DEPARTMENT_COLORS[dep]}>
            {PROJECT_DEPARTMENT_LABELS[dep]}
          </Badge>
        ))}
        <span className="ml-2 text-slate-500 dark:text-slate-400">
          Bar = od startu do termínu (default 14 dní zpět)
        </span>
      </div>
    </div>
  );
}

function Timeline({
  data,
}: {
  data: { bars: BarInfo[]; days: Date[]; rangeStart: Date };
}) {
  const { bars, days, rangeStart } = data;
  const today = startOfDay(new Date());
  const todayIdx = differenceInDays(today, rangeStart);

  const months = days.reduce<{ label: string; span: number }[]>((acc, d) => {
    const label = format(d, "LLL yyyy", { locale: cs });
    const last = acc[acc.length - 1];
    if (last && last.label === label) last.span += 1;
    else acc.push({ label, span: 1 });
    return acc;
  }, []);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div
        className="relative"
        style={{
          width: LABEL_WIDTH + days.length * COL_WIDTH,
          minWidth: "100%",
        }}
      >
        <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
          <div
            className="shrink-0 border-r border-slate-200 px-3 py-2 text-xs font-semibold uppercase text-slate-600 dark:border-slate-800 dark:text-slate-400"
            style={{ width: LABEL_WIDTH }}
          >
            Projekt
          </div>
          <div className="flex-1">
            <div className="flex border-b border-slate-200 dark:border-slate-800">
              {months.map((m, i) => (
                <div
                  key={`${m.label}-${i}`}
                  style={{ width: m.span * COL_WIDTH }}
                  className="px-2 py-1 text-xs font-semibold capitalize text-slate-700 dark:text-slate-300"
                >
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex">
              {days.map((d, i) => (
                <div
                  key={i}
                  style={{ width: COL_WIDTH }}
                  className={cn(
                    "border-r border-slate-100 py-1 text-center text-[10px] dark:border-slate-800",
                    isSameDay(d, today) && "bg-blue-50 font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
                    [0, 6].includes(d.getDay()) && "bg-slate-50/60 dark:bg-slate-800/30",
                  )}
                  title={format(d, "EEEE d. M. yyyy", { locale: cs })}
                >
                  {format(d, "d")}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          {todayIdx >= 0 && todayIdx < days.length && (
            <div
              className="absolute top-0 z-0 w-px bg-blue-400"
              style={{
                left: LABEL_WIDTH + todayIdx * COL_WIDTH + COL_WIDTH / 2,
                height: bars.length * ROW_HEIGHT,
              }}
            />
          )}
          {bars.map((b, i) => (
            <Link
              key={b.project._id}
              href={`/projekty/${b.project._id}`}
              className={cn(
                "flex border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50",
                i % 2 === 1 && "bg-slate-50/40 dark:bg-slate-800/30",
              )}
              style={{ height: ROW_HEIGHT }}
            >
              <div
                className="flex shrink-0 flex-col justify-center gap-0.5 border-r border-slate-200 px-3 dark:border-slate-800"
                style={{ width: LABEL_WIDTH }}
                title={b.project.name}
              >
                <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {b.project.name}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={DEPARTMENT_COLORS[b.project.department]}>
                    {PROJECT_DEPARTMENT_LABELS[b.project.department]}
                  </Badge>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {PROJECT_STATUS_LABELS[b.project.status]}
                  </span>
                </div>
              </div>
              <div className="relative flex-1">
                <div
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 rounded text-[11px] font-medium text-white px-2 py-1.5 truncate shadow-sm",
                    DEPT_BAR_COLORS[b.project.department],
                    b.project.status === "done" && "opacity-60",
                    b.project.status === "on_hold" &&
                      "bg-stripes opacity-80",
                  )}
                  style={{
                    left: b.startCol * COL_WIDTH,
                    width: Math.max(b.spanCols * COL_WIDTH - 4, 24),
                  }}
                  title={`${b.project.name}\n${format(b.start, "d. M.")} → ${format(b.end, "d. M.")}\n${PROJECT_STATUS_LABELS[b.project.status]}`}
                >
                  {b.spanCols > 3 ? format(b.end, "d. M. yyyy") : ""}
                </div>
                {b.milestones.map((m) => (
                  <div
                    key={m.milestone._id}
                    className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: m.col * COL_WIDTH + COL_WIDTH / 2 }}
                    title={`◆ Milník: ${m.milestone.title}\n${format(new Date(m.milestone.dueDate), "d. M. yyyy", { locale: cs })}`}
                  >
                    <div
                      className={cn(
                        "h-4 w-4 rotate-45 border-2 border-white shadow-sm dark:border-slate-900",
                        MILESTONE_COLORS[m.milestone.status],
                      )}
                    />
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
