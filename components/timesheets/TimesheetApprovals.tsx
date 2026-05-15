"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Clock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";

function fmtHours(h: number) {
  return h.toString().replace(".", ",");
}

function periodLabel(start: number) {
  const s = new Date(start);
  const e = new Date(start + 6 * 24 * 3600 * 1000);
  return `${s.getDate()}. ${s.getMonth() + 1}. – ${e.getDate()}. ${e.getMonth() + 1}. ${e.getFullYear()}`;
}

export function TimesheetApprovals() {
  const items = useQuery(api.timesheets.pendingForMe, {});
  const decide = useMutation(api.timesheets.decide);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (items === undefined || items.length === 0) return null;

  async function onApprove(id: Id<"timesheetSubmissions">) {
    setBusy(id);
    try {
      await decide({ submissionId: id, approve: true });
      toast.success("Výkaz schválen");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(null);
    }
  }

  async function onReject(id: Id<"timesheetSubmissions">) {
    const reason = prompt("Důvod vrácení výkazu k přepracování:");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Důvod je povinný");
      return;
    }
    setBusy(id);
    try {
      await decide({ submissionId: id, approve: false, reason });
      toast.success("Výkaz vrácen");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-500" />
          Výkazy ke schválení
          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            {items.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((s) => (
            <li
              key={s._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={s.user.name}
                  email={s.user.email}
                  size="sm"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {s.user.name ?? s.user.email}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {periodLabel(s.periodStart)} ·{" "}
                    <strong>{fmtHours(s.totalHours)} h</strong>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy === s._id}
                  onClick={() => onApprove(s._id)}
                >
                  Schválit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === s._id}
                  onClick={() => onReject(s._id)}
                >
                  Vrátit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
