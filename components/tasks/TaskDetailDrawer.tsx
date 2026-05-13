"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CommentThread } from "@/components/comments/CommentThread";
import { TaskDependencies } from "@/components/tasks/TaskDependencies";
import { TaskAttachments } from "@/components/tasks/TaskAttachments";
import { WatchToggle } from "@/components/tasks/WatchToggle";
import { TimeBlockDialog } from "@/components/time/TimeBlockDialog";
import { useToast } from "@/components/ui/toast";
import {
  TASK_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  ROLE_LABELS,
  type TaskStatus,
  type Priority,
} from "@/lib/constants";
import { toDateInputValue, fromDateInputValue, formatDate, formatDateTime } from "@/lib/dates";

interface Props {
  taskId: Id<"tasks">;
  project: Doc<"projects">;
  onClose: () => void;
}

export function TaskDetailDrawer({ taskId, project, onClose }: Props) {
  const task = useQuery(api.tasks.get, { taskId });
  const me = useQuery(api.users.me);
  const users = useQuery(api.users.list, {});
  const blockerHint = useQuery(api.dependencies.earliestStartHint, { taskId });
  const update = useMutation(api.tasks.update);
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priorityVal, setPriorityVal] = useState<Priority>("medium");
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logTimeOpen, setLogTimeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    if (dirty) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriorityVal(task.priority);
    setStartDate(toDateInputValue(task.startDate));
    setDeadline(toDateInputValue(task.deadline));
    setAssigneeId(task.assigneeId ?? "");
    setError(null);
  }, [
    task?._id,
    task?.title,
    task?.description,
    task?.status,
    task?.priority,
    task?.startDate,
    task?.deadline,
    task?.assigneeId,
    dirty,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  function revertChanges() {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriorityVal(task.priority);
    setStartDate(toDateInputValue(task.startDate));
    setDeadline(toDateInputValue(task.deadline));
    setAssigneeId(task.assigneeId ?? "");
    setDirty(false);
    setError(null);
  }

  if (task === undefined) {
    return (
      <Drawer open onClose={onClose} title="Načítám úkol…">
        <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>
      </Drawer>
    );
  }
  if (task === null) {
    return (
      <Drawer open onClose={onClose} title="Úkol nenalezen">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Úkol byl smazán nebo k němu nemáte přístup.
        </div>
      </Drawer>
    );
  }

  const canEdit = !!(
    me &&
    (me.role === "admin" ||
      me.role === "pm" ||
      (me.role === "department_lead" &&
        (project.department === "cross" || project.department === me.department)) ||
      task.assigneeId === me._id)
  );

  async function save() {
    if (!task) return;
    const startMs = fromDateInputValue(startDate);
    const deadlineMs = fromDateInputValue(deadline);
    if (startMs !== undefined && deadlineMs !== undefined && startMs > deadlineMs) {
      setError("Začátek nemůže být po termínu");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await update({
        taskId: task._id,
        title: title.trim(),
        description: description.trim(),
        status,
        priority: priorityVal,
        startDate: startMs ?? null,
        deadline: deadlineMs ?? null,
        assigneeId: assigneeId ? (assigneeId as Id<"users">) : null,
      });
      setDirty(false);
      toast.success("Úkol uložen", title.trim());
    } catch (err) {
      toast.error("Uložení selhalo", err instanceof Error ? err.message : "Chyba");
    } finally {
      setSaving(false);
    }
  }

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  return (
    <Drawer open onClose={onClose} title="Detail úkolu">
      <div className="space-y-5">
        <div>
          <Label htmlFor="t-title">Název</Label>
          <Input
            id="t-title"
            value={title}
            onChange={(e) => markDirty(setTitle)(e.target.value)}
            disabled={!canEdit || saving}
          />
        </div>
        <div>
          <Label htmlFor="t-desc">Popis</Label>
          <Textarea
            id="t-desc"
            rows={5}
            value={description}
            onChange={(e) => markDirty(setDescription)(e.target.value)}
            disabled={!canEdit || saving}
            placeholder="Detailní popis úkolu…"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="t-status">Stav</Label>
            <Select
              id="t-status"
              value={status}
              onChange={(e) => markDirty(setStatus)(e.target.value as TaskStatus)}
              disabled={!canEdit || saving}
            >
              {TASK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-priority">Priorita</Label>
            <Select
              id="t-priority"
              value={priorityVal}
              onChange={(e) => markDirty(setPriorityVal)(e.target.value as Priority)}
              disabled={!canEdit || saving}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-assignee">Přiřazeno</Label>
            <Select
              id="t-assignee"
              value={assigneeId}
              onChange={(e) => markDirty(setAssigneeId)(e.target.value)}
              disabled={!canEdit || saving}
            >
              <option value="">— Nikdo —</option>
              {(users ?? []).map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name ?? u.email}{" "}
                  {u.role ? `(${ROLE_LABELS[u.role]})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-start">Začátek</Label>
            <Input
              id="t-start"
              type="date"
              value={startDate}
              max={deadline || undefined}
              onChange={(e) => markDirty(setStartDate)(e.target.value)}
              disabled={!canEdit || saving}
            />
            {blockerHint && (
              <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-300">
                Nejdříve {formatDate(blockerHint.earliestStart)} (blokuje:{" "}
                <span className="font-medium">{blockerHint.sourceTitle}</span>)
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="t-deadline">Termín</Label>
            <Input
              id="t-deadline"
              type="date"
              value={deadline}
              min={startDate || undefined}
              onChange={(e) => markDirty(setDeadline)(e.target.value)}
              disabled={!canEdit || saving}
            />
          </div>
        </div>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
        {canEdit && (
          <div className="flex gap-2">
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Ukládám…" : "Uložit změny"}
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={revertChanges} disabled={saving}>
                Vrátit změny
              </Button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Vytvořeno: {formatDateTime(task._creationTime)}
            {task.completedAt && (
              <> · Dokončeno: {formatDateTime(task.completedAt)}</>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogTimeOpen(true)}
            >
              + Zalogovat čas
            </Button>
            <WatchToggle taskId={task._id} />
          </div>
        </div>
        <TimeBlockDialog
          open={logTimeOpen}
          onClose={() => setLogTimeOpen(false)}
          defaultProject={project}
          defaultTaskId={task._id}
        />

        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
          <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Přílohy</h4>
          <TaskAttachments taskId={task._id} canUpload={canEdit} />
        </div>

        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
          <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Závislosti</h4>
          <TaskDependencies task={task} canEdit={canEdit} />
        </div>

        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
          <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Komentáře</h4>
          <CommentThread taskId={task._id} />
        </div>
      </div>
    </Drawer>
  );
}
