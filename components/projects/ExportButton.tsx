"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { toCsv, downloadCsv, safeFilename } from "@/lib/csv";
import {
  TASK_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_DEPARTMENT_LABELS,
} from "@/lib/constants";
import { format } from "date-fns";

interface Props {
  project: Doc<"projects">;
}

function formatDateOrEmpty(ts: number | undefined): string {
  if (!ts) return "";
  return format(new Date(ts), "yyyy-MM-dd");
}

export function ExportButton({ project }: Props) {
  const tasks = useQuery(api.tasks.listForProject, { projectId: project._id });
  const users = useQuery(api.users.list, { includeInactive: true });
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  function exportCsv() {
    if (!tasks) return;
    setBusy(true);
    try {
      const userById = new Map<string, Doc<"users">>();
      for (const u of users ?? []) userById.set(u._id, u);
      const taskById = new Map<string, Doc<"tasks">>();
      for (const t of tasks) taskById.set(t._id, t);

      const headers = [
        "Projekt",
        "Oddělení",
        "Úkol",
        "Nadřazený úkol",
        "Stav",
        "Priorita",
        "Přiřazeno",
        "E-mail přiřazeného",
        "Termín",
        "Začátek",
        "Vytvořeno",
        "Dokončeno",
      ];

      const rows = tasks.map((t) => {
        const assignee = t.assigneeId ? userById.get(t.assigneeId as string) : null;
        const parent = t.parentTaskId ? taskById.get(t.parentTaskId as string) : null;
        return [
          project.name,
          PROJECT_DEPARTMENT_LABELS[project.department],
          t.title,
          parent?.title ?? "",
          TASK_STATUS_LABELS[t.status],
          PRIORITY_LABELS[t.priority],
          assignee?.name ?? assignee?.email ?? "",
          assignee?.email ?? "",
          formatDateOrEmpty(t.deadline),
          formatDateOrEmpty(undefined),
          formatDateOrEmpty(t._creationTime),
          formatDateOrEmpty(t.completedAt),
        ];
      });

      const csv = toCsv(headers, rows);
      const filename = `${safeFilename(project.name) || "projekt"}-${format(new Date(), "yyyyMMdd")}.csv`;
      downloadCsv(filename, csv);
      toast.success("CSV exportováno", `${tasks.length} úkolů → ${filename}`);
    } catch (err) {
      toast.error("Export selhal", err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={exportCsv}
      disabled={busy || tasks === undefined}
      title="Stáhnout úkoly jako CSV"
    >
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </Button>
  );
}
