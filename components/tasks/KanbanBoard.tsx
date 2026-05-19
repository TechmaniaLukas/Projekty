"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import {
  TASK_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  type TaskStatus,
  type Priority,
} from "@/lib/constants";
import { formatDate, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

const COLUMNS: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
];

export function KanbanBoard({
  projectId,
  project,
}: {
  projectId: Id<"projects">;
  project: Doc<"projects">;
}) {
  const tasks = useQuery(api.tasks.listForProject, { projectId });
  const users = useQuery(api.users.list, {});
  const update = useMutation(api.tasks.update);
  const toast = useToast();
  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);

  if (tasks === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  const userById = new Map<string, Doc<"users">>();
  for (const u of users ?? []) userById.set(u._id, u);

  const byStatus: Record<string, Doc<"tasks">[]> = {};
  for (const s of COLUMNS) byStatus[s] = [];
  for (const t of tasks) (byStatus[t.status] ??= []).push(t);

  async function move(task: Doc<"tasks">, dir: -1 | 1) {
    const idx = COLUMNS.indexOf(task.status);
    const next = COLUMNS[idx + dir];
    if (!next) return;
    try {
      await update({ taskId: task._id, status: next });
    } catch (err) {
      toast.error("Nelze přesunout", err instanceof Error ? err.message : "");
    }
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((status) => {
          const col = byStatus[status] ?? [];
          return (
            <div
              key={status}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {TASK_STATUS_LABELS[status]}
                </span>
                <span className="rounded-full bg-slate-200 px-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {col.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {col.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-slate-400 dark:text-slate-600">
                    Prázdné
                  </p>
                )}
                {col.map((t) => {
                  const assignee = t.assigneeId
                    ? userById.get(t.assigneeId)
                    : null;
                  const overdue =
                    t.status !== "done" && isOverdue(t.deadline);
                  const colIdx = COLUMNS.indexOf(status);
                  return (
                    <div
                      key={t._id}
                      className="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenTaskId(t._id)}
                        className="block w-full text-left text-sm font-medium text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
                      >
                        {t.title}
                      </button>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                            PRIORITY_COLORS[t.priority as Priority],
                          )}
                        >
                          {PRIORITY_LABELS[t.priority as Priority]}
                        </span>
                        {t.deadline && (
                          <span
                            className={cn(
                              "text-[10px]",
                              overdue
                                ? "font-medium text-red-600 dark:text-red-400"
                                : "text-slate-500 dark:text-slate-400",
                            )}
                          >
                            {formatDate(t.deadline)}
                          </span>
                        )}
                        {assignee && (
                          <span className="ml-auto">
                            <Avatar
                              name={assignee.name ?? null}
                              email={assignee.email ?? null}
                              size="sm"
                            />
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex justify-between">
                        <button
                          type="button"
                          disabled={colIdx === 0}
                          onClick={() => move(t, -1)}
                          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                          aria-label="Posunout zpět"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          disabled={colIdx === COLUMNS.length - 1}
                          onClick={() => move(t, 1)}
                          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                          aria-label="Posunout dál"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {openTaskId && (
        <TaskDetailDrawer
          taskId={openTaskId}
          project={project}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </>
  );
}
