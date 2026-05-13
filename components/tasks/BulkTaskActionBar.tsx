"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  TASK_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  ROLE_LABELS,
  TASK_STATUS_LABELS,
  PRIORITY_LABELS,
  type TaskStatus,
  type Priority,
} from "@/lib/constants";

interface Props {
  selectedIds: Id<"tasks">[];
  users: Doc<"users">[];
  onCleared: () => void;
}

export function BulkTaskActionBar({ selectedIds, users, onCleared }: Props) {
  const bulkUpdate = useMutation(api.tasks.bulkUpdate);
  const bulkRemove = useMutation(api.tasks.bulkRemove);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  function reportResult(action: string, updated: number, skipped: number) {
    if (updated > 0) {
      toast.success(
        `${action}: ${updated} úkolů`,
        skipped > 0 ? `Přeskočeno ${skipped} kvůli oprávněním` : undefined,
      );
    } else if (skipped > 0) {
      toast.error("Nic se nezměnilo", `Přeskočeno ${skipped} kvůli oprávněním`);
    }
  }

  async function applyStatus(status: TaskStatus) {
    setBusy(true);
    try {
      const r = await bulkUpdate({ taskIds: selectedIds, status });
      reportResult(`Stav → ${TASK_STATUS_LABELS[status]}`, r.updated, r.skipped);
      if (r.updated > 0) onCleared();
    } finally {
      setBusy(false);
    }
  }

  async function applyPriority(priority: Priority) {
    setBusy(true);
    try {
      const r = await bulkUpdate({ taskIds: selectedIds, priority });
      reportResult(`Priorita → ${PRIORITY_LABELS[priority]}`, r.updated, r.skipped);
      if (r.updated > 0) onCleared();
    } finally {
      setBusy(false);
    }
  }

  async function applyAssignee(value: string) {
    setBusy(true);
    try {
      const r = await bulkUpdate({
        taskIds: selectedIds,
        assigneeId: value === "" ? null : (value as Id<"users">),
      });
      const label =
        value === ""
          ? "Odebráno přiřazení"
          : `Přiřazeno: ${users.find((u) => u._id === value)?.name ?? users.find((u) => u._id === value)?.email ?? "uživatel"}`;
      reportResult(label, r.updated, r.skipped);
      if (r.updated > 0) onCleared();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (
      !confirm(
        `Smazat ${selectedIds.length} úkol${selectedIds.length === 1 ? "" : "ů"} včetně všech podúkolů, komentářů a příloh?`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await bulkRemove({ taskIds: selectedIds });
      reportResult("Smazáno", r.removed, r.skipped);
      if (r.removed > 0) onCleared();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 max-w-[calc(100vw-2rem)]">
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xl px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Vybráno: {selectedIds.length}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                applyStatus(e.target.value as TaskStatus);
                e.target.value = "";
              }}
              disabled={busy}
              className="h-8 text-xs min-w-[110px] sm:min-w-[130px]"
            >
              <option value="">Změnit stav…</option>
              {TASK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                applyPriority(e.target.value as Priority);
                e.target.value = "";
              }}
              disabled={busy}
              className="h-8 text-xs min-w-[110px] sm:min-w-[130px]"
            >
              <option value="">Změnit prioritu…</option>
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                applyAssignee(v === "__clear__" ? "" : v);
                e.target.value = "";
              }}
              disabled={busy}
              className="h-8 text-xs min-w-[130px] sm:min-w-[160px]"
            >
              <option value="">Přiřadit…</option>
              <option value="__clear__">— Odebrat přiřazení —</option>
              {users
                .filter((u) => u.isActive !== false)
                .map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name ?? u.email}
                    {u.role ? ` (${ROLE_LABELS[u.role]})` : ""}
                  </option>
                ))}
            </Select>
            <Button
              variant="danger"
              size="sm"
              onClick={deleteSelected}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Smazat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCleared}
              disabled={busy}
              title="Zavřít hromadnou úpravu"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
