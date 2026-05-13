"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "./StatusBadge";
import { Trash2, ArrowDown, ArrowUp } from "lucide-react";

interface Props {
  task: Doc<"tasks">;
  canEdit: boolean;
}

export function TaskDependencies({ task, canEdit }: Props) {
  const deps = useQuery(api.dependencies.listForTask, { taskId: task._id });
  const projectTasks = useQuery(api.tasks.listForProject, {
    projectId: task.projectId,
  });
  const add = useMutation(api.dependencies.add);
  const remove = useMutation(api.dependencies.remove);

  const [direction, setDirection] = useState<"blocked_by" | "blocking">(
    "blocked_by",
  );
  const [otherTaskId, setOtherTaskId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = useMemo(() => {
    const s = new Set<string>([task._id]);
    if (deps) {
      for (const d of deps.blocking) s.add(d.task._id);
      for (const d of deps.blockedBy) s.add(d.task._id);
    }
    return s;
  }, [deps, task._id]);

  const candidates = (projectTasks ?? []).filter(
    (t) => !linkedIds.has(t._id),
  );

  async function onAdd() {
    if (!otherTaskId) return;
    setBusy(true);
    setError(null);
    try {
      if (direction === "blocked_by") {
        await add({
          blockingTaskId: otherTaskId as Id<"tasks">,
          blockedTaskId: task._id,
        });
      } else {
        await add({
          blockingTaskId: task._id,
          blockedTaskId: otherTaskId as Id<"tasks">,
        });
      }
      setOtherTaskId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  if (deps === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  return (
    <div className="space-y-4">
      <DependencyList
        title="Tento úkol blokuje"
        icon={<ArrowDown className="h-3.5 w-3.5" />}
        empty="Tento úkol nic neblokuje."
        items={deps.blocking}
        canEdit={canEdit}
        onRemove={(depId) => remove({ depId })}
      />
      <DependencyList
        title="Blokováno úkoly"
        icon={<ArrowUp className="h-3.5 w-3.5" />}
        empty="Není blokován žádným úkolem."
        items={deps.blockedBy}
        canEdit={canEdit}
        onRemove={(depId) => remove({ depId })}
      />

      {canEdit && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
            <div>
              <Label>Směr</Label>
              <Select
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as "blocked_by" | "blocking")
                }
                className="h-8 text-xs"
              >
                <option value="blocked_by">Blokuje mě</option>
                <option value="blocking">Já blokuji</option>
              </Select>
            </div>
            <div>
              <Label>Úkol</Label>
              <Select
                value={otherTaskId}
                onChange={(e) => setOtherTaskId(e.target.value)}
                className="h-8 text-xs"
              >
                <option value="">— Zvolte úkol —</option>
                {candidates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                disabled={!otherTaskId || busy}
                onClick={onAdd}
              >
                Přidat
              </Button>
            </div>
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ListProps {
  title: string;
  icon: React.ReactNode;
  empty: string;
  items: { depId: Id<"taskDependencies">; task: Doc<"tasks"> }[];
  canEdit: boolean;
  onRemove: (depId: Id<"taskDependencies">) => Promise<unknown>;
}

function DependencyList({ title, icon, empty, items, canEdit, onRemove }: ListProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
        {icon} {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.depId}
              className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <StatusBadge status={item.task.status} />
              <span
                className={
                  item.task.status === "done"
                    ? "flex-1 truncate line-through text-slate-500 dark:text-slate-400"
                    : "flex-1 truncate text-slate-900 dark:text-slate-100"
                }
              >
                {item.task.title}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onRemove(item.depId)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  title="Odstranit závislost"
                  aria-label="Odstranit závislost"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
