"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Clock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type TaskOption = { _id: Id<"tasks">; title: string; projectId: Id<"projects"> };

interface Props {
  open: boolean;
  onClose: () => void;
  /** When provided: prefill project + task */
  defaultProject?: Doc<"projects">;
  defaultTaskId?: Id<"tasks">;
  /** When editing existing entry */
  editEntry?: Doc<"timeEntries">;
}

function toDateInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function toTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function combineDateTime(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0, 0, 0);
  return date.getTime();
}

function roundQuarter(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const rounded = Math.round((m ?? 0) / 15) * 15;
  const finalH = h ?? 0;
  const finalM = rounded === 60 ? 0 : rounded;
  const extraH = rounded === 60 ? 1 : 0;
  return `${String(finalH + extraH).padStart(2, "0")}:${String(finalM).padStart(2, "0")}`;
}

export function TimeBlockDialog({
  open,
  onClose,
  defaultProject,
  defaultTaskId,
  editEntry,
}: Props) {
  const toast = useToast();
  const projects = useQuery(
    api.projects.list,
    open ? { includeArchived: false } : "skip",
  );
  const add = useMutation(api.timeEntries.add);
  const update = useMutation(api.timeEntries.update);

  const initialDate = editEntry
    ? toDateInput(editEntry.startTime)
    : toDateInput(Date.now());
  const initialStart = editEntry
    ? toTimeInput(editEntry.startTime)
    : "09:00";
  const initialEnd = editEntry ? toTimeInput(editEntry.endTime) : "12:00";

  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [projectId, setProjectId] = useState<string>(
    editEntry?.projectId ?? defaultProject?._id ?? "",
  );
  const [taskId, setTaskId] = useState<string>(
    editEntry?.taskId ?? defaultTaskId ?? "",
  );
  const [note, setNote] = useState(editEntry?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasksForProject = useQuery(
    api.tasks.listForProject,
    open && projectId
      ? { projectId: projectId as Id<"projects"> }
      : "skip",
  );

  useEffect(() => {
    if (open && !editEntry) {
      setDate(toDateInput(Date.now()));
      setStartTime("09:00");
      setEndTime("12:00");
      setProjectId(defaultProject?._id ?? "");
      setTaskId(defaultTaskId ?? "");
      setNote("");
      setError(null);
    }
  }, [open, defaultProject, defaultTaskId, editEntry]);

  if (!open) return null;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (!projectId) throw new Error("Vyberte projekt");
      const start = combineDateTime(date, roundQuarter(startTime));
      const end = combineDateTime(date, roundQuarter(endTime));
      if (end <= start) throw new Error("Konec musí být po začátku");

      if (editEntry) {
        await update({
          entryId: editEntry._id,
          startTime: start,
          endTime: end,
          projectId: projectId as Id<"projects">,
          taskId: taskId ? (taskId as Id<"tasks">) : null,
          note: note.trim() || null,
        });
        toast.success("Záznam upraven");
      } else {
        await add({
          projectId: projectId as Id<"projects">,
          taskId: taskId ? (taskId as Id<"tasks">) : undefined,
          startTime: start,
          endTime: end,
          note: note.trim() || undefined,
        });
        const hours = Math.round(((end - start) / 3600000) * 100) / 100;
        toast.success(`Zalogováno ${hours} h`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  const hours = (() => {
    try {
      const s = combineDateTime(date, roundQuarter(startTime));
      const e = combineDateTime(date, roundQuarter(endTime));
      if (e <= s) return 0;
      return Math.round(((e - s) / 3600000) * 100) / 100;
    } catch {
      return 0;
    }
  })();

  return (
    <Drawer
      open
      onClose={onClose}
      title={editEntry ? "Upravit záznam práce" : "Zalogovat čas"}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
          <div>
            <Label htmlFor="te-date">Datum</Label>
            <Input
              id="te-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={toDateInput(Date.now())}
            />
          </div>
          <div>
            <Label htmlFor="te-start">Od</Label>
            <Input
              id="te-start"
              type="time"
              step={900}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="te-end">Do</Label>
            <Input
              id="te-end"
              type="time"
              step={900}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
          <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span className="text-slate-700 dark:text-slate-300">
            Doba: <strong>{hours} h</strong>
          </span>
        </div>

        <div>
          <Label htmlFor="te-project">Projekt *</Label>
          <Select
            id="te-project"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              if (!editEntry) setTaskId("");
            }}
          >
            <option value="">— Zvol projekt —</option>
            {(projects ?? []).map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="te-task">Úkol (volitelné)</Label>
          <Select
            id="te-task"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={!projectId}
          >
            <option value="">— Obecná práce na projektu —</option>
            {(tasksForProject ?? []).map((t: TaskOption) => (
              <option key={t._id} value={t._id}>
                {t.title}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Nech prázdné pro jednání, plánování, brainstorm…
          </p>
        </div>

        <div>
          <Label htmlFor="te-note">Poznámka</Label>
          <Textarea
            id="te-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Co konkrétně se dělalo (volitelné)"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Ukládám…" : editEntry ? "Uložit změny" : "Zalogovat"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Zrušit
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
