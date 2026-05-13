"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { toCsv, downloadCsv, safeFilename } from "@/lib/csv";
import { relativeTime } from "@/lib/dates";

interface Props {
  project: Doc<"projects">;
}

type Period = "thisWeek" | "thisMonth" | "last30" | "all";

function rangeFor(period: Period): { start: number | undefined; end: number | undefined } {
  const now = new Date();
  if (period === "all") return { start: undefined, end: undefined };
  if (period === "thisWeek") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    const end = new Date(d);
    end.setDate(end.getDate() + 7);
    return { start: d.getTime(), end: end.getTime() };
  }
  if (period === "thisMonth") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: d.getTime(), end: end.getTime() };
  }
  return {
    start: now.getTime() - 30 * 24 * 3600 * 1000,
    end: now.getTime() + 60 * 1000,
  };
}

export function ProjectTimeReport({ project }: Props) {
  const toast = useToast();
  const [period, setPeriod] = useState<Period>("thisMonth");
  const range = useMemo(() => rangeFor(period), [period]);

  const summary = useQuery(api.timeEntries.projectSummary, {
    projectId: project._id,
    rangeStart: range.start,
    rangeEnd: range.end,
  });
  const entries = useQuery(api.timeEntries.listForProject, {
    projectId: project._id,
    rangeStart: range.start,
    rangeEnd: range.end,
  });
  const users = useQuery(api.users.list, { includeInactive: true });
  const allTasks = useQuery(api.tasks.listForProject, { projectId: project._id });

  if (summary === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (summary === null) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Nemáte přístup.
      </div>
    );
  }

  const usersById = new Map<string, Doc<"users">>();
  for (const u of users ?? []) usersById.set(u._id, u);
  const tasksById = new Map<string, Doc<"tasks">>();
  for (const t of allTasks ?? []) tasksById.set(t._id, t);

  function exportCsv() {
    if (!entries) return;
    const headers = [
      "Datum",
      "Od",
      "Do",
      "Hodiny",
      "Uživatel",
      "E-mail",
      "Úkol",
      "Poznámka",
    ];
    const rows = entries.map((e) => {
      const u = usersById.get(e.userId);
      const task = e.taskId ? tasksById.get(e.taskId) : null;
      const d = new Date(e.startTime);
      const dStr = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
      const sT = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const eD = new Date(e.endTime);
      const eT = `${String(eD.getHours()).padStart(2, "0")}:${String(eD.getMinutes()).padStart(2, "0")}`;
      return [
        dStr,
        sT,
        eT,
        e.hours,
        u?.name ?? u?.email ?? "—",
        u?.email ?? "",
        task?.title ?? "obecné",
        e.note ?? "",
      ];
    });
    const csv = toCsv(headers, rows);
    const filename = `vykaz-${safeFilename(project.name)}-${period}.csv`;
    downloadCsv(filename, csv);
    toast.success(`Exportováno ${entries.length} záznamů`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="w-auto min-w-[160px]"
        >
          <option value="thisWeek">Tento týden</option>
          <option value="thisMonth">Tento měsíc</option>
          <option value="last30">Posledních 30 dní</option>
          <option value="all">Vše</option>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={!entries || entries.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
              Celkem
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary.totalHours.toString().replace(".", ",")} h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
              Lidí
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary.users.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
              Záznamů
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary.entryCount}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kdo kolik</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.users.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Žádné záznamy v období.
              </p>
            ) : (
              <ul className="space-y-2">
                {summary.users.map((row) => {
                  const pct =
                    summary.totalHours > 0
                      ? Math.round((row.hours / summary.totalHours) * 100)
                      : 0;
                  return (
                    <li key={row.user._id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={row.user.name ?? null}
                          email={row.user.email ?? null}
                          size="sm"
                        />
                        <span className="flex-1 truncate text-sm text-slate-900 dark:text-slate-100">
                          {row.user.name ?? row.user.email}
                        </span>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                          {row.hours.toString().replace(".", ",")} h
                        </span>
                        <span className="w-10 text-right text-xs text-slate-500 dark:text-slate-400">
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hodiny po úkolech</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.tasks.length === 0 && summary.generalHours === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Žádné záznamy.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {summary.tasks.map((row) => (
                  <li
                    key={row.task._id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex-1 truncate text-slate-900 dark:text-slate-100">
                      {row.task.title}
                    </span>
                    <span className="font-medium text-slate-700 tabular-nums dark:text-slate-300">
                      {row.hours.toString().replace(".", ",")} h
                    </span>
                  </li>
                ))}
                {summary.generalHours > 0 && (
                  <li className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex-1 italic text-slate-600 dark:text-slate-400">
                      Obecné (bez úkolu)
                    </span>
                    <span className="font-medium text-slate-700 tabular-nums dark:text-slate-300">
                      {summary.generalHours.toString().replace(".", ",")} h
                    </span>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Záznamy</CardTitle>
        </CardHeader>
        <CardContent>
          {!entries || entries.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Žádné záznamy.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.slice(0, 50).map((e) => {
                const u = usersById.get(e.userId);
                const t = e.taskId ? tasksById.get(e.taskId) : null;
                const d = new Date(e.startTime);
                const dStr = `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
                const sT = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                const eD = new Date(e.endTime);
                const eT = `${String(eD.getHours()).padStart(2, "0")}:${String(eD.getMinutes()).padStart(2, "0")}`;
                return (
                  <li
                    key={e._id}
                    className="flex flex-wrap items-center gap-2 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400 min-w-[80px]">
                      {dStr}
                    </span>
                    <span className="font-mono text-xs text-slate-600 tabular-nums dark:text-slate-400">
                      {sT}–{eT}
                    </span>
                    <Badge>{e.hours.toString().replace(".", ",")} h</Badge>
                    <Avatar
                      name={u?.name ?? null}
                      email={u?.email ?? null}
                      size="sm"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {u?.name ?? u?.email ?? "—"}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-400">
                      {t?.title ?? "obecné"}
                      {e.note && ` — ${e.note}`}
                    </span>
                  </li>
                );
              })}
              {entries.length > 50 && (
                <li className="pt-2 text-xs text-slate-500 dark:text-slate-400">
                  Zobrazeno 50 z {entries.length}. Pro úplný seznam použij CSV
                  export.
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
