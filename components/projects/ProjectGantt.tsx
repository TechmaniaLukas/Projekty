"use client";

import { useMemo } from "react";
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
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  type TaskStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Props {
  projectId: Id<"projects">;
  project: Doc<"projects">;
}

const DEFAULT_DURATION_DAYS = 5;

const STATUS_BAR_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  blocked: "bg-red-500",
  review: "bg-purple-500",
  done: "bg-emerald-500",
};

interface BarInfo {
  task: Doc<"tasks">;
  start: Date;
  end: Date;
  startCol: number;
  spanCols: number;
}

interface MilestoneMarker {
  milestone: Doc<"milestones">;
  date: Date;
  col: number;
}

const MILESTONE_COLORS: Record<Doc<"milestones">["status"], string> = {
  planned: "bg-slate-500",
  in_progress: "bg-blue-600",
  submitted: "bg-amber-500",
  approved: "bg-green-600",
  rejected: "bg-red-600",
};

export function ProjectGantt({ projectId, project }: Props) {
  const tasks = useQuery(api.tasks.listForProject, { projectId });
  const milestones = useQuery(api.milestones.listForProject, { projectId });
  const deps = useQuery(api.dependencies.listForProject, { projectId });

  const data = useMemo(() => {
    if (!tasks || !milestones) return null;

    const tasksWithDates = tasks.filter((t) => t.deadline);
    if (tasksWithDates.length === 0 && milestones.length === 0) {
      return {
        bars: [],
        milestoneMarkers: [],
        days: [],
        rangeStart: startOfDay(new Date()),
      };
    }

    const today = startOfDay(new Date());

    let earliest = today.getTime();
    let latest = today.getTime();
    for (const t of tasksWithDates) {
      const end = t.deadline!;
      const start = t.startDate ?? end - DEFAULT_DURATION_DAYS * 24 * 3600 * 1000;
      earliest = Math.min(earliest, start);
      latest = Math.max(latest, end);
    }
    for (const m of milestones) {
      earliest = Math.min(earliest, m.dueDate);
      latest = Math.max(latest, m.dueDate);
    }
    if (project.deadline) latest = Math.max(latest, project.deadline);
    if (project.startDate) earliest = Math.min(earliest, project.startDate);

    const rangeStart = startOfWeek(new Date(earliest - 3 * 24 * 3600 * 1000), {
      weekStartsOn: 1,
    });
    const rangeEnd = endOfWeek(new Date(latest + 7 * 24 * 3600 * 1000), {
      weekStartsOn: 1,
    });
    const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;

    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) days.push(addDays(rangeStart, i));

    const bars: BarInfo[] = tasksWithDates
      .map((t) => {
        const end = new Date(t.deadline!);
        const start = t.startDate
          ? new Date(t.startDate)
          : new Date(t.deadline! - DEFAULT_DURATION_DAYS * 24 * 3600 * 1000);
        const startCol = Math.max(0, differenceInDays(start, rangeStart));
        const endCol = Math.min(
          totalDays - 1,
          differenceInDays(end, rangeStart),
        );
        const spanCols = Math.max(1, endCol - startCol + 1);
        return { task: t, start, end, startCol, spanCols };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime() || a.task.title.localeCompare(b.task.title));

    const milestoneMarkers: MilestoneMarker[] = milestones
      .map((m) => {
        const date = new Date(m.dueDate);
        const col = differenceInDays(date, rangeStart);
        return { milestone: m, date, col };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return { bars, milestoneMarkers, days, rangeStart };
  }, [tasks, milestones, project.deadline, project.startDate]);

  if (tasks === undefined || milestones === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (data === null) return null;
  if (data.bars.length === 0 && data.milestoneMarkers.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Žádné úkoly ani milníky s termínem. Přidej termíny v záložce „Úkoly" nebo „Milníky".
      </div>
    );
  }

  const { bars, milestoneMarkers, days } = data;
  const today = startOfDay(new Date());
  const todayIdx = differenceInDays(today, data.rangeStart);

  const COL_WIDTH = 36;
  const HEADER_HEIGHT = 56;
  const ROW_HEIGHT = 40;
  const LABEL_WIDTH = 200;

  const months = days.reduce<{ label: string; span: number }[]>((acc, d) => {
    const label = format(d, "LLL yyyy", { locale: cs });
    const last = acc[acc.length - 1];
    if (last && last.label === label) last.span += 1;
    else acc.push({ label, span: 1 });
    return acc;
  }, []);

  // Šipky závislostí mezi úkoly (blocking → blocked)
  const barByTaskId = new Map<
    string,
    { startCol: number; spanCols: number; rowIdx: number }
  >();
  bars.forEach((b, i) => {
    barByTaskId.set(b.task._id as string, {
      startCol: b.startCol,
      spanCols: b.spanCols,
      rowIdx: milestoneMarkers.length + i,
    });
  });
  const depLines: { d: string }[] = [];
  for (const dep of deps ?? []) {
    const from = barByTaskId.get(dep.blockingTaskId as string);
    const to = barByTaskId.get(dep.blockedTaskId as string);
    if (!from || !to) continue;
    const x1 =
      LABEL_WIDTH + (from.startCol + from.spanCols) * COL_WIDTH - 4;
    const y1 = from.rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x2 = LABEL_WIDTH + to.startCol * COL_WIDTH;
    const y2 = to.rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const midX = Math.max(x1 + 8, x2 - 12);
    depLines.push({
      d: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`,
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div
        className="relative"
        style={{
          width: LABEL_WIDTH + days.length * COL_WIDTH,
          minWidth: "100%",
        }}
      >
        <div
          className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            className="shrink-0 border-r border-slate-200 px-3 py-2 text-xs font-semibold uppercase text-slate-600 dark:border-slate-800 dark:text-slate-400"
            style={{ width: LABEL_WIDTH }}
          >
            Úkol
          </div>
          <div className="flex-1">
            <div className="flex border-b border-slate-200 dark:border-slate-800">
              {months.map((m, i) => (
                <div
                  key={`${m.label}-${i}`}
                  style={{ width: m.span * COL_WIDTH }}
                  className="px-2 py-1 text-xs font-semibold text-slate-700 capitalize dark:text-slate-300"
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
                height: (bars.length + milestoneMarkers.length) * ROW_HEIGHT,
              }}
            />
          )}
          {milestoneMarkers.map((m) => (
            <div
              key={m.milestone._id}
              className="flex border-b border-slate-100 bg-amber-50/40 dark:border-slate-800 dark:bg-amber-950/10"
              style={{ height: ROW_HEIGHT }}
            >
              <div
                className="flex shrink-0 items-center gap-2 border-r border-slate-200 px-3 text-sm dark:border-slate-800"
                style={{ width: LABEL_WIDTH }}
                title={`Milník: ${m.milestone.title}`}
              >
                <span className="text-amber-500">◆</span>
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {m.milestone.title}
                </span>
                {(m.milestone as { taskStats?: { total: number; percent: number | null } }).taskStats &&
                  ((m.milestone as { taskStats?: { total: number } }).taskStats?.total ?? 0) > 0 && (
                    <span className="ml-auto shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
                      {(m.milestone as { taskStats?: { percent: number | null } }).taskStats?.percent}%
                    </span>
                  )}
              </div>
              <div className="relative flex-1">
                {m.col >= 0 && m.col < days.length && (
                  <div
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: m.col * COL_WIDTH + COL_WIDTH / 2 }}
                    title={`${m.milestone.title}\n${format(m.date, "d. M. yyyy", { locale: cs })}`}
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rotate-45 border-2 border-white shadow-sm dark:border-slate-900",
                        MILESTONE_COLORS[m.milestone.status],
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {bars.map((b, i) => {
            const status = b.task.status;
            return (
              <div
                key={b.task._id}
                className={cn(
                  "flex border-b border-slate-100 dark:border-slate-800",
                  i % 2 === 1 && "bg-slate-50/40 dark:bg-slate-800/30",
                )}
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="flex shrink-0 items-center gap-2 border-r border-slate-200 px-3 text-sm dark:border-slate-800"
                  style={{ width: LABEL_WIDTH }}
                  title={b.task.title}
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      STATUS_BAR_COLORS[status],
                    )}
                  />
                  <span className="truncate">{b.task.title}</span>
                </div>
                <div className="relative flex-1">
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 rounded text-[10px] font-medium text-white px-1.5 py-1 truncate hover:opacity-90 cursor-default",
                      STATUS_BAR_COLORS[status],
                      status === "done" && "opacity-70",
                    )}
                    style={{
                      left: b.startCol * COL_WIDTH,
                      width: Math.max(b.spanCols * COL_WIDTH - 4, 24),
                    }}
                    title={`${b.task.title} (${TASK_STATUS_LABELS[status]})\n${format(b.start, "d. M.")} → ${format(b.end, "d. M.")}`}
                  >
                    {b.spanCols > 2 ? format(b.end, "d. M.") : ""}
                  </div>
                </div>
              </div>
            );
          })}
          {depLines.length > 0 && (
            <svg
              className="pointer-events-none absolute left-0 top-0 z-20"
              width={LABEL_WIDTH + days.length * COL_WIDTH}
              height={
                (bars.length + milestoneMarkers.length) * ROW_HEIGHT
              }
            >
              <defs>
                <marker
                  id="gantt-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-400" />
                </marker>
              </defs>
              {depLines.map((l, idx) => (
                <path
                  key={idx}
                  d={l.d}
                  fill="none"
                  className="stroke-slate-400"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  markerEnd="url(#gantt-arrow)"
                />
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
