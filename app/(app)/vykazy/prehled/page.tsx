"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronLeft, Download, ChevronLeftCircle, ChevronRightCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { toCsv, downloadCsv, safeFilename } from "@/lib/csv";
import {
  PROJECT_DEPARTMENT_LABELS,
  PROJECT_DEPARTMENT_OPTIONS,
  DEPARTMENT_COLORS,
  type ProjectDepartment,
} from "@/lib/constants";

type Period = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last30";

function rangeFor(period: Period): { start: number; end: number; label: string } {
  const now = new Date();
  if (period === "thisWeek" || period === "lastWeek") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    if (period === "lastWeek") d.setDate(d.getDate() - 7);
    const end = new Date(d);
    end.setDate(end.getDate() + 7);
    const label = `${d.getDate()}. ${d.getMonth() + 1}. – ${new Date(end.getTime() - 1).getDate()}. ${new Date(end.getTime() - 1).getMonth() + 1}.`;
    return { start: d.getTime(), end: end.getTime(), label };
  }
  if (period === "thisMonth" || period === "lastMonth") {
    const offset = period === "lastMonth" ? 1 : 0;
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const label = d.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
    return { start: d.getTime(), end: end.getTime(), label };
  }
  return {
    start: now.getTime() - 30 * 24 * 3600 * 1000,
    end: now.getTime() + 60 * 1000,
    label: "Posledních 30 dní",
  };
}

export default function VykazyPrehledPage() {
  const me = useQuery(api.users.me);
  const toast = useToast();
  const [period, setPeriod] = useState<Period>("thisWeek");
  const [dept, setDept] = useState<ProjectDepartment | "">("");
  const range = useMemo(() => rangeFor(period), [period]);

  const pivot = useQuery(api.timeEntries.pivot, {
    rangeStart: range.start,
    rangeEnd: range.end,
    department: dept || undefined,
  });

  if (me === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  if (me?.role !== "admin" && me?.role !== "pm" && me?.role !== "department_lead") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Přehled výkazů je dostupný jen pro admina, PM nebo vedoucího oddělení.
      </div>
    );
  }

  function exportCsv() {
    if (!pivot) return;
    const headers = [
      "Uživatel",
      "E-mail",
      ...pivot.projects.map((p) => p.project.name),
      "Celkem",
    ];
    const rows = pivot.rows.map((r) => [
      r.user.name ?? r.user.email ?? "—",
      r.user.email ?? "",
      ...r.cells.map((c) => (c === 0 ? "" : c.toString().replace(".", ","))),
      r.total.toString().replace(".", ","),
    ]);
    const total = [
      "Celkem",
      "",
      ...pivot.projects.map((p) => p.total.toString().replace(".", ",")),
      pivot.grandTotal.toString().replace(".", ","),
    ];
    rows.push(total);
    const csv = toCsv(headers, rows);
    downloadCsv(
      `vykazy-prehled-${safeFilename(range.label)}.csv`,
      csv,
    );
    toast.success("Exportováno");
  }

  return (
    <div className="space-y-6">
      <Link
        href="/vykazy"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" />
        Zpět na můj výkaz
      </Link>

      <div className="space-y-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Přehled výkazů
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="w-auto min-w-[170px]"
          >
            <option value="thisWeek">Tento týden</option>
            <option value="lastWeek">Minulý týden</option>
            <option value="thisMonth">Tento měsíc</option>
            <option value="lastMonth">Minulý měsíc</option>
            <option value="last30">Posledních 30 dní</option>
          </Select>
          <Select
            value={dept}
            onChange={(e) => setDept(e.target.value as ProjectDepartment | "")}
            className="w-auto min-w-[160px]"
          >
            <option value="">Všechna oddělení</option>
            {PROJECT_DEPARTMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!pivot || pivot.rows.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Období: <strong>{range.label}</strong>
      </p>

      {!pivot ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>
      ) : pivot.rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            V daném období nejsou žádné záznamy.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-left text-xs uppercase text-slate-600 dark:text-slate-400">
                    Uživatel
                  </th>
                  {pivot.projects.map((p) => (
                    <th
                      key={p.project._id}
                      className="px-2 py-2 text-right text-xs uppercase text-slate-600 dark:text-slate-400 whitespace-nowrap"
                      title={p.project.name}
                    >
                      <Link
                        href={`/projekty/${p.project._id}`}
                        className="inline-flex flex-col items-end gap-0.5 hover:text-slate-900 dark:hover:text-slate-100"
                      >
                        <Badge
                          tone={DEPARTMENT_COLORS[p.project.department]}
                        >
                          {PROJECT_DEPARTMENT_LABELS[p.project.department]}
                        </Badge>
                        <span
                          className="max-w-[120px] truncate"
                          title={p.project.name}
                        >
                          {p.project.name}
                        </span>
                      </Link>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-xs uppercase text-slate-600 dark:text-slate-400">
                    Celkem
                  </th>
                </tr>
              </thead>
              <tbody>
                {pivot.rows.map((r) => (
                  <tr
                    key={r.user._id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={r.user.name ?? null}
                          email={r.user.email ?? null}
                          size="sm"
                        />
                        <span className="text-slate-900 dark:text-slate-100">
                          {r.user.name ?? r.user.email}
                        </span>
                      </div>
                    </td>
                    {r.cells.map((c, i) => (
                      <td
                        key={i}
                        className="px-2 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300"
                      >
                        {c > 0 ? c.toString().replace(".", ",") : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {r.total.toString().replace(".", ",")}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/50">
                  <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                    Celkem
                  </td>
                  {pivot.projects.map((p) => (
                    <td
                      key={p.project._id}
                      className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                    >
                      {p.total.toString().replace(".", ",")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {pivot.grandTotal.toString().replace(".", ",")}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
