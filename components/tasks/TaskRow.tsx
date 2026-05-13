"use client";

import { ChevronRight, ChevronDown, Plus, MessageSquare, Trash2, Link2, Paperclip, GripVertical } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import { formatDate, isOverdue, isDeadlineSoon } from "@/lib/dates";
import { TASK_STATUS_OPTIONS, type TaskStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Props {
  task: Doc<"tasks">;
  assignee?: Doc<"users"> | null;
  childCount: number;
  commentCount: number;
  attachmentCount?: number;
  incompleteBlockers?: number;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  dragHandle?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown> | undefined;
  } | null;
  expanded: boolean;
  depth: number;
  canEdit: boolean;
  canDelete: boolean;
  canAddSub: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAddSub: () => void;
}

export function TaskRow({
  task,
  assignee,
  childCount,
  commentCount,
  attachmentCount = 0,
  incompleteBlockers = 0,
  selectMode = false,
  selected = false,
  onToggleSelect,
  dragHandle,
  expanded,
  depth,
  canEdit,
  canDelete,
  canAddSub,
  onToggle,
  onOpen,
  onAddSub,
}: Props) {
  const update = useMutation(api.tasks.update);
  const remove = useMutation(api.tasks.remove);
  const [busy, setBusy] = useState(false);

  const overdue = task.status !== "done" && isOverdue(task.deadline);
  const soon = task.status !== "done" && !overdue && isDeadlineSoon(task.deadline, 7);

  async function setStatus(status: TaskStatus) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await update({ taskId: task._id, status });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Smazat úkol „${task.title}"? Včetně všech podúkolů a komentářů.`)) return;
    setBusy(true);
    try {
      await remove({ taskId: task._id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-2 border-b border-slate-100 px-2 py-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50",
        task.status === "done" && "opacity-60",
        selected && "bg-blue-50 hover:bg-blue-50 dark:bg-blue-950/30 dark:hover:bg-blue-950/30",
      )}
      style={{ paddingLeft: `${depth * 24 + 8}px` }}
    >
      {dragHandle ? (
        <button
          type="button"
          {...(dragHandle.attributes as object)}
          {...(dragHandle.listeners as object)}
          className="flex h-5 w-4 shrink-0 touch-none cursor-grab items-center justify-center text-slate-400 hover:text-slate-700 active:cursor-grabbing opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity dark:text-slate-500 dark:hover:text-slate-300"
          aria-label="Přetáhnout"
          title="Přetáhnout pro změnu pořadí"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200",
          childCount === 0 && "invisible",
        )}
        aria-label={expanded ? "Sbalit" : "Rozbalit"}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {selectMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          disabled={!canEdit}
          className="h-4 w-4 shrink-0 rounded border-slate-400 accent-blue-600 dark:border-slate-600"
          title={canEdit ? "Vybrat úkol" : "Bez oprávnění upravit"}
        />
      ) : (
        <input
          type="checkbox"
          checked={task.status === "done"}
          onChange={() => setStatus(task.status === "done" ? "todo" : "done")}
          disabled={!canEdit || busy}
          className="h-4 w-4 shrink-0 rounded border-slate-300 dark:border-slate-600"
          title={canEdit ? "Označit jako hotovo" : "Bez oprávnění"}
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex-1 truncate text-left text-sm font-medium text-slate-900 hover:text-slate-700 dark:text-slate-100 dark:hover:text-slate-300",
          task.status === "done" && "line-through text-slate-500 dark:text-slate-500",
        )}
      >
        {task.title}
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <PriorityBadge priority={task.priority} />
        {canEdit ? (
          <>
            <span className="sm:hidden">
              <StatusBadge status={task.status} />
            </span>
            <select
              value={task.status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              disabled={busy}
              className="hidden sm:inline-block h-7 rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {TASK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <StatusBadge status={task.status} />
        )}
        {task.deadline && (
          <span
            className={cn(
              "hidden md:inline-block text-xs",
              overdue
                ? "text-red-600 font-medium dark:text-red-400"
                : soon
                  ? "text-amber-600 font-medium dark:text-amber-400"
                  : "text-slate-500 dark:text-slate-400",
            )}
          >
            {formatDate(task.deadline)}
          </span>
        )}
        {assignee && (
          <Avatar name={assignee.name ?? null} email={assignee.email ?? null} size="sm" />
        )}
        {commentCount > 0 && (
          <span className="hidden sm:inline-flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400">
            <MessageSquare className="h-3.5 w-3.5" />
            {commentCount}
          </span>
        )}
        {attachmentCount > 0 && (
          <span className="hidden sm:inline-flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400">
            <Paperclip className="h-3.5 w-3.5" />
            {attachmentCount}
          </span>
        )}
        {task.status !== "done" && incompleteBlockers > 0 && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
            title={`Blokováno ${incompleteBlockers} úkoly`}
          >
            <Link2 className="h-3 w-3" />
            {incompleteBlockers}
          </span>
        )}
        {canAddSub && (
          <button
            type="button"
            onClick={onAddSub}
            className="inline-flex md:hidden md:group-hover:inline-flex items-center rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="Přidat podúkol"
            aria-label="Přidat podúkol"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex md:hidden md:group-hover:inline-flex items-center rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            title="Smazat úkol"
            aria-label="Smazat úkol"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
