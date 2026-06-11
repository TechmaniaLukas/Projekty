"use client";

import { useMemo, useState } from "react";
import { SKILL_LABELS, type Skill } from "@/lib/constants";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  Crown,
  ListChecks,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { formatDate, isOverdue, isDeadlineSoon } from "@/lib/dates";
import { cn } from "@/lib/utils";

type TaskStats = { total: number; done: number; percent: number | null };
type Milestone = Doc<"milestones"> & { taskStats?: TaskStats };
type Task = Doc<"tasks">;

const TASK_STATUS_LABEL: Record<Task["status"], string> = {
  todo: "K udělání",
  in_progress: "Probíhá",
  blocked: "Blokováno",
  review: "Kontrola",
  done: "Hotovo",
};

const TASK_STATUS_TONE: Record<Task["status"], string> = {
  todo: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  review: "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-200",
  done: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
};

interface Props {
  projectId: Id<"projects">;
  canManage: boolean;
}

const STATUS_LABEL: Record<Milestone["status"], string> = {
  planned: "Plánováno",
  in_progress: "Probíhá",
  submitted: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Vráceno k přepracování",
};

const STATUS_TONE: Record<Milestone["status"], string> = {
  planned:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  in_progress:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-900",
  submitted:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900",
  approved:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-200 dark:border-green-900",
  rejected:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900",
};

const STATUS_ICON: Record<Milestone["status"], React.ComponentType<{ className?: string }>> = {
  planned: Circle,
  in_progress: CircleDot,
  submitted: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
};

export function MilestoneList({ projectId, canManage }: Props) {
  const me = useQuery(api.users.me);
  const milestones = useQuery(api.milestones.listForProject, { projectId });
  const users = useQuery(api.users.list, {});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);

  const approverCandidates = useMemo(
    () =>
      (users ?? []).filter((u) =>
        ["admin", "director", "pm", "department_lead"].includes(u.role ?? ""),
      ),
    [users],
  );

  if (milestones === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Milníky jsou klíčové dodávky projektu. Po dokončení je submituješ ke schválení;
          přiřazený schvalovatel je buď schválí, nebo vrátí k přepracování s důvodem.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Přidat milník
          </Button>
        )}
      </div>

      {milestones.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Zatím žádné milníky.
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-2">
          {milestones.map((m) => (
            <MilestoneRow
              key={m._id}
              milestone={m}
              me={me ?? null}
              approverCandidates={approverCandidates}
              canManage={canManage}
              onEdit={() => setEditing(m)}
            />
          ))}
        </ol>
      )}

      {creating && (
        <MilestoneFormDialog
          projectId={projectId}
          approverCandidates={approverCandidates}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && canManage && (
        <MilestoneFormDialog
          projectId={projectId}
          milestone={editing}
          approverCandidates={approverCandidates}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MilestoneRow({
  milestone,
  me,
  approverCandidates,
  canManage,
  onEdit,
}: {
  milestone: Milestone;
  me: Doc<"users"> | null;
  approverCandidates: Doc<"users">[];
  canManage: boolean;
  onEdit: () => void;
}) {
  const submit = useMutation(api.milestones.submit);
  const approve = useMutation(api.milestones.approve);
  const reject = useMutation(api.milestones.reject);
  const remove = useMutation(api.milestones.remove);
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const Icon = STATUS_ICON[milestone.status];
  const approver = approverCandidates.find((u) => u._id === milestone.approverId);
  const isApprover = me && me._id === milestone.approverId;
  const isAdmin = me?.role === "admin";

  const due = milestone.dueDate;
  const overdue =
    milestone.status !== "approved" && milestone.status !== "rejected" && isOverdue(due);
  const soon =
    milestone.status !== "approved" &&
    milestone.status !== "rejected" &&
    !overdue &&
    isDeadlineSoon(due, 7);

  async function onSubmit() {
    setSubmitting(true);
    try {
      await submit({ milestoneId: milestone._id, note: submitNote });
      toast.success("Odesláno ke schválení");
      setShowSubmit(false);
      setSubmitNote("");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setSubmitting(false);
    }
  }

  async function onApprove() {
    if (!confirm(`Schválit milník „${milestone.title}"?`)) return;
    setSubmitting(true);
    try {
      await approve({ milestoneId: milestone._id });
      toast.success("Schváleno");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setSubmitting(false);
    }
  }

  async function onReject() {
    if (!rejectReason.trim()) {
      toast.error("Důvod je povinný");
      return;
    }
    setSubmitting(true);
    try {
      await reject({ milestoneId: milestone._id, reason: rejectReason });
      toast.success("Vráceno k přepracování");
      setShowReject(false);
      setRejectReason("");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Smazat milník „${milestone.title}"?`)) return;
    setSubmitting(true);
    try {
      await remove({ milestoneId: milestone._id });
      toast.success("Smazáno");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {milestone.title}
                </h3>
              </div>
              {milestone.description && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {milestone.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                  STATUS_TONE[milestone.status],
                )}
              >
                {STATUS_LABEL[milestone.status]}
              </span>
              {canManage && milestone.status !== "approved" && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  title="Upravit"
                  aria-label="Upravit milník"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={submitting}
                  className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  title="Smazat"
                  aria-label="Smazat milník"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400">Termín:</span>
              <span
                className={cn(
                  "font-medium",
                  overdue
                    ? "text-red-600 dark:text-red-400"
                    : soon
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-700 dark:text-slate-300",
                )}
              >
                {formatDate(due)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-slate-500 dark:text-slate-400">Schvaluje:</span>
              {approver && (
                <>
                  <Avatar name={approver.name ?? null} email={approver.email ?? null} size="sm" />
                  <span className="text-slate-700 dark:text-slate-300">
                    {approver.name ?? approver.email}
                  </span>
                </>
              )}
            </div>
          </div>

          {(milestone.status === "planned" ||
            milestone.status === "in_progress" ||
            milestone.status === "rejected") && (
            <MilestoneForecast milestoneId={milestone._id} />
          )}

          {milestone.taskStats && milestone.taskStats.total > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Navázané úkoly
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {milestone.taskStats.done}/{milestone.taskStats.total} hotovo (
                  {milestone.taskStats.percent}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={cn(
                    "h-full transition-all",
                    milestone.taskStats.percent === 100
                      ? "bg-green-500"
                      : "bg-blue-500",
                  )}
                  style={{ width: `${milestone.taskStats.percent ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {milestone.status === "submitted" && milestone.submitNote && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900 dark:bg-amber-950/30">
              <div className="font-medium text-amber-900 dark:text-amber-200">
                Poznámka k odeslání:
              </div>
              <div className="text-amber-800 dark:text-amber-300">{milestone.submitNote}</div>
            </div>
          )}

          {milestone.status === "rejected" && milestone.rejectionReason && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs dark:border-red-900 dark:bg-red-950/30">
              <div className="font-medium text-red-900 dark:text-red-200">
                Důvod vrácení:
              </div>
              <div className="text-red-800 dark:text-red-300">{milestone.rejectionReason}</div>
            </div>
          )}

          {milestone.status === "approved" && milestone.decidedAt && (
            <div className="text-xs text-green-700 dark:text-green-400">
              ✓ Schváleno {formatDate(milestone.decidedAt)}
            </div>
          )}

          <MilestoneTasks
            milestoneId={milestone._id}
            canEdit={
              canManage &&
              milestone.status !== "submitted" &&
              milestone.status !== "approved"
            }
          />

          <MilestoneDependencies
            milestoneId={milestone._id}
            projectId={milestone.projectId}
            canEdit={canManage}
          />

          <MilestoneComments milestoneId={milestone._id} me={me} />

          {/* Akce */}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            {(milestone.status === "planned" ||
              milestone.status === "in_progress" ||
              milestone.status === "rejected") &&
              !showSubmit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSubmit(true)}
                  disabled={submitting}
                >
                  <Send className="h-3.5 w-3.5" />
                  Označit jako dodáno
                </Button>
              )}
            {showSubmit && (
              <div className="w-full space-y-2">
                <Label>Poznámka (volitelné — co bylo dodáno)</Label>
                <Textarea
                  value={submitNote}
                  onChange={(e) => setSubmitNote(e.target.value)}
                  rows={2}
                  placeholder="Stručný popis toho, co se podařilo dokončit…"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={onSubmit} disabled={submitting}>
                    Odeslat ke schválení
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowSubmit(false);
                      setSubmitNote("");
                    }}
                    disabled={submitting}
                  >
                    Zrušit
                  </Button>
                </div>
              </div>
            )}

            {milestone.status === "submitted" && (isApprover || isAdmin) && !showReject && (
              <>
                <Button size="sm" onClick={onApprove} disabled={submitting}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Schválit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowReject(true)}
                  disabled={submitting}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Vrátit k přepracování
                </Button>
              </>
            )}
            {showReject && (
              <div className="w-full space-y-2">
                <Label>Důvod vrácení (povinné)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  placeholder="Co je třeba dopracovat / opravit…"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={onReject} disabled={submitting}>
                    Vrátit k přepracování
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowReject(false);
                      setRejectReason("");
                    }}
                    disabled={submitting}
                  >
                    Zrušit
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function MilestoneFormDialog({
  projectId,
  milestone,
  approverCandidates,
  onClose,
}: {
  projectId: Id<"projects">;
  milestone?: Milestone;
  approverCandidates: Doc<"users">[];
  onClose: () => void;
}) {
  const create = useMutation(api.milestones.create);
  const update = useMutation(api.milestones.update);
  const toast = useToast();
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [dueDate, setDueDate] = useState(() => {
    if (milestone) {
      return new Date(milestone.dueDate).toISOString().slice(0, 10);
    }
    return "";
  });
  const [approverId, setApproverId] = useState<string>(
    milestone?.approverId ?? approverCandidates[0]?._id ?? "",
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) {
      toast.error("Vyplň název");
      return;
    }
    if (!dueDate) {
      toast.error("Vyplň termín");
      return;
    }
    if (!approverId) {
      toast.error("Vyber schvalovatele");
      return;
    }
    setBusy(true);
    try {
      const dueMs = new Date(dueDate + "T23:59:59").getTime();
      if (milestone) {
        await update({
          milestoneId: milestone._id,
          title,
          description: description || null,
          dueDate: dueMs,
          approverId: approverId as Id<"users">,
        });
        toast.success("Uloženo");
      } else {
        await create({
          projectId,
          title,
          description: description || undefined,
          dueDate: dueMs,
          approverId: approverId as Id<"users">,
        });
        toast.success("Milník přidán");
      }
      onClose();
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">
          {milestone ? "Upravit milník" : "Nový milník"}
        </h2>
        <div className="space-y-3">
          <div>
            <Label>Název *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Např. Dodávka technické dokumentace"
            />
          </div>
          <div>
            <Label>Popis (volitelné)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Co je obsah milníku, akceptační kritéria…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Termín *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Schvalovatel *</Label>
              <Select
                value={approverId}
                onChange={(e) => setApproverId(e.target.value)}
              >
                <option value="">— Vyber —</option>
                {approverCandidates.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name ?? u.email} ({u.role})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Zrušit
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Ukládám…" : "Uložit"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MilestoneTasks({
  milestoneId,
  canEdit,
}: {
  milestoneId: Id<"milestones">;
  canEdit: boolean;
}) {
  const attached = useQuery(api.milestones.listTasks, { milestoneId });
  const available = useQuery(
    api.milestones.availableTasks,
    canEdit ? { milestoneId } : "skip",
  );
  const attach = useMutation(api.milestones.attachTask);
  const detach = useMutation(api.milestones.detachTask);
  const toast = useToast();
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  if (attached === undefined) return null;

  const doneCount = attached.filter((t) => t.status === "done").length;

  async function onAttach(taskId: Id<"tasks">) {
    setBusy(true);
    try {
      await attach({ milestoneId, taskId });
      toast.success("Úkol připojen");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function onDetach(taskId: Id<"tasks">) {
    setBusy(true);
    try {
      await detach({ taskId });
      toast.success("Úkol odpojen");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          <ListChecks className="h-3.5 w-3.5 text-slate-400" />
          Úkoly
          <span className="text-slate-400 dark:text-slate-500">
            ({doneCount}/{attached.length})
          </span>
        </div>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPicker((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            {showPicker ? "Zavřít" : "Přiřadit úkol"}
          </Button>
        )}
      </div>

      {attached.length === 0 ? (
        <div className="text-xs italic text-slate-500 dark:text-slate-400">
          Zatím žádné úkoly. {canEdit && "Přiřaď libovolné úkoly projektu."}
        </div>
      ) : (
        <ul className="space-y-1">
          {attached.map((t) => (
            <li
              key={t._id}
              className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-800"
            >
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  TASK_STATUS_TONE[t.status],
                )}
              >
                {TASK_STATUS_LABEL[t.status]}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200",
                  t.status === "done" && "line-through text-slate-500",
                )}
              >
                {t.title}
              </span>
              {t.deadline && (
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  {formatDate(t.deadline)}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onDetach(t._id)}
                  disabled={busy}
                  className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  title="Odpojit od milníku"
                  aria-label="Odpojit úkol od milníku"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showPicker && canEdit && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/50">
          {available === undefined ? (
            <div className="text-xs text-slate-500">Načítám…</div>
          ) : available.length === 0 ? (
            <div className="text-xs italic text-slate-500 dark:text-slate-400">
              Žádné volné úkoly v projektu. Vytvoř úkol nebo odpoj jiný milník.
            </div>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {available.map((t) => (
                <li
                  key={t._id}
                  className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-white dark:hover:bg-slate-800"
                >
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      TASK_STATUS_TONE[t.status],
                    )}
                  >
                    {TASK_STATUS_LABEL[t.status]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {t.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAttach(t._id)}
                    disabled={busy}
                    className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-950/40"
                  >
                    Přidat
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MilestoneDependencies({
  milestoneId,
  projectId,
  canEdit,
}: {
  milestoneId: Id<"milestones">;
  projectId: Id<"projects">;
  canEdit: boolean;
}) {
  const deps = useQuery(api.milestones.listDependencies, { milestoneId });
  const allMilestones = useQuery(api.milestones.listForProject, { projectId });
  const addDep = useMutation(api.milestones.addDependency);
  const removeDep = useMutation(api.milestones.removeDependency);
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (deps === undefined) return null;

  const blockedByIds = new Set(deps.blockedBy.map((d) => d.milestone._id));
  const candidates = (allMilestones ?? []).filter(
    (m) => m._id !== milestoneId && !blockedByIds.has(m._id),
  );

  async function onAdd(blockingId: Id<"milestones">) {
    setBusy(true);
    try {
      await addDep({
        blockedMilestoneId: milestoneId,
        blockingMilestoneId: blockingId,
      });
      toast.success("Závislost přidána");
      setPicking(false);
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(depId: Id<"milestoneDependencies">) {
    setBusy(true);
    try {
      await removeDep({ depId });
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  if (
    deps.blockedBy.length === 0 &&
    deps.blocks.length === 0 &&
    !canEdit
  ) {
    return null;
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          Závislosti
        </span>
        {canEdit && candidates.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {picking ? "Zavřít" : "+ Přidat blokující milník"}
          </button>
        )}
      </div>

      {picking && (
        <Select
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value as Id<"milestones">);
          }}
          disabled={busy}
          defaultValue=""
        >
          <option value="">— Vyber milník, který musí být schválen dřív —</option>
          {candidates.map((m) => (
            <option key={m._id} value={m._id}>
              {m.title}
            </option>
          ))}
        </Select>
      )}

      {deps.blockedBy.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Závisí na (musí být schváleno dřív):
          </div>
          {deps.blockedBy.map((d) => (
            <div
              key={d.depId}
              className="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-800"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    d.milestone.status === "approved"
                      ? "bg-green-500"
                      : "bg-amber-500",
                  )}
                />
                {d.milestone.title}
                {d.milestone.status !== "approved" && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    (nehotovo)
                  </span>
                )}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onRemove(d.depId)}
                  disabled={busy}
                  className="text-slate-400 hover:text-red-500"
                  aria-label="Odebrat závislost"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {deps.blocks.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Blokuje (čekají na tento milník):
          </div>
          {deps.blocks.map((d) => (
            <div
              key={d.depId}
              className="rounded border border-slate-200 px-2 py-1 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400"
            >
              {d.milestone.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MilestoneComments({
  milestoneId,
  me,
}: {
  milestoneId: Id<"milestones">;
  me: Doc<"users"> | null;
}) {
  const comments = useQuery(api.milestones.listComments, { milestoneId });
  const add = useMutation(api.milestones.addComment);
  const remove = useMutation(api.milestones.removeComment);
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (comments === undefined) return null;

  async function onAdd() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await add({ milestoneId, text });
      setText("");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
        Diskuze ({comments.length})
      </span>
      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c._id} className="flex gap-2">
              <Avatar
                name={c.author?.name ?? null}
                email={c.author?.email ?? null}
                size="sm"
              />
              <div className="min-w-0 flex-1 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {c.author?.name ?? c.author?.email ?? "—"}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">
                      {new Date(c._creationTime).toLocaleString("cs-CZ", {
                        day: "numeric",
                        month: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {me && (c.authorId === me._id || me.role === "admin") && (
                      <button
                        type="button"
                        onClick={() => remove({ commentId: c._id })}
                        className="text-slate-400 hover:text-red-500"
                        aria-label="Smazat komentář"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                  {c.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="Napiš komentář…"
          className="flex-1"
        />
        <Button size="sm" onClick={onAdd} disabled={busy || !text.trim()}>
          Odeslat
        </Button>
      </div>
    </div>
  );
}

function MilestoneForecast({ milestoneId }: { milestoneId: Id<"milestones"> }) {
  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    if (day !== 1) d.setDate(d.getDate() - (day - 1));
    return d.getTime();
  }, []);
  const data = useQuery(api.capacity.milestoneForecast, { milestoneId, weekStart });

  if (!data) return null;
  if (data.blockedSkills.length > 0) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        ⚠ Nelze odhadnout dokončení — chybí lidé s disciplínou:{" "}
        {data.blockedSkills.map((s) => SKILL_LABELS[s as Skill] ?? s).join(", ")}
      </p>
    );
  }
  if (!data.forecastDate) return null;
  return (
    <p
      className={
        "text-xs " +
        (data.atRisk
          ? "font-medium text-red-600 dark:text-red-400"
          : "text-slate-500 dark:text-slate-400")
      }
    >
      {data.atRisk ? "⚠ " : ""}Realisticky dle kapacity: {formatDate(data.forecastDate)}
      {" "}({data.totalRemaining.toString().replace(".", ",")} h zbývá)
      {data.atRisk ? " — po plánovaném termínu" : ""}
      {data.missingEstimates > 0
        ? " · " + data.missingEstimates + " úkolů bez odhadu"
        : ""}
    </p>
  );
}
