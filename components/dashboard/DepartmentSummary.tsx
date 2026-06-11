"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEPARTMENT_LABELS,
  PROJECT_DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  type Department,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { pluralize } from "@/lib/utils";

export function DepartmentSummary() {
  const projects = useQuery(api.projects.list, {});

  if (projects === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Přehled oddělení</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">Načítám…</p>
        </CardContent>
      </Card>
    );
  }

  const summary: Record<string, {
    label: string;
    tone: string;
    total: number;
    active: number;
    onHold: number;
    overdue: number;
  }> = {};

  for (const dep of ["it", "facility", "vyroba", "cross"] as const) {
    summary[dep] = {
      label: PROJECT_DEPARTMENT_LABELS[dep],
      tone: DEPARTMENT_COLORS[dep],
      total: 0,
      active: 0,
      onHold: 0,
      overdue: 0,
    };
  }

  const now = Date.now();
  for (const p of projects) {
    const s = summary[p.department];
    if (!s) continue;
    s.total += 1;
    if (p.status === "active") s.active += 1;
    if (p.status === "on_hold") s.onHold += 1;
    if (p.deadline && p.deadline < now && p.status !== "done" && p.status !== "archived") {
      s.overdue += 1;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Přehled oddělení</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(summary).map(([key, s]) => (
            <div
              key={key}
              className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="mb-2 flex items-center justify-between">
                <Badge tone={s.tone}>{s.label}</Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {pluralize(s.total, "projekt", "projekty", "projektů")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Aktivní</div>
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{s.active}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Pozastav.</div>
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{s.onHold}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Po termínu</div>
                  <div
                    className={
                      s.overdue > 0
                        ? "text-base font-semibold text-red-600 dark:text-red-400"
                        : "text-base font-semibold text-slate-900 dark:text-slate-100"
                    }
                  >
                    {s.overdue}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
