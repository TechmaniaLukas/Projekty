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

export function ProjectGantt({ projectId, project }: Props) {
  const tasks = useQuery(api.tasks.listForProject, { projectId });

  const data = useMemo(() => {
    if (!tasks) return null;

    const tasksWithDates = tasks.filter((t) => t.deadline);
    if (tasksWithDates.length === 0) {
      return {
        bars: [],
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

    return { bars, days, rangeStart };
  }, [tasks, project.deadline, project.startDate]);

  if (tasks === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (data === null) return null;
  if (data.bars.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Žádné úkoly s termínem. Přidej termíny v záložce „Úkoly".
      </div>
    );
  }

  const { bars, days } = data;
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
                height: bars.length * ROW_HEIGHT,
              }}
            />
          )}
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
        </div>
      </div>
    </div>
  );
}
