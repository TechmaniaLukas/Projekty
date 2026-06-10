"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Gauge, Info } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  SKILL_LABELS,
  DEPARTMENT_LABELS,
  type Skill,
  type Department,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay() || 7;
  if (day !== 1) r.setDate(r.getDate() - (day - 1));
  return r;
}

function weekLabel(startMs: number): string {
  const s = new Date(startMs);
  const e = new Date(startMs + 6 * 24 * 3600 * 1000);
  return `${s.getDate()}.${s.getMonth() + 1}.–${e.getDate()}.${e.getMonth() + 1}.`;
}

function fmtH(h: number): string {
  return h.toString().replace(".", ",");
}

function loadTone(load: number | null): string {
  if (load === null) return "bg-slate-100 text-slate-400 dark:bg-slate-800/50 dark:text-slate-600";
  if (load > 130)
    return "bg-red-600 text-white dark:bg-red-700";
  if (load > 95)
    return "bg-red-200 text-red-900 dark:bg-red-950/70 dark:text-red-200";
  if (load >= 70)
    return "bg-amber-200 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200";
  return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
}

interface SelectedCell {
  title: string;
  capacity: number | null;
  demand: number;
  tasks: {
    taskId: string;
    title: string;
    projectId: string;
    projectName: string;
    hours: number;
    assigneeName: string | null;
  }[];
}

export default function KapacityPage() {
  const me = useQuery(api.users.me);
  const [weeks, setWeeks] = useState(8);
  const [view, setView] = useState<"skills" | "people">("skills");
  const [selected, setSelected] = useState<SelectedCell | null>(null);

  const weekStart = useMemo(() => startOfWeek(new Date()).getTime(), []);
  const data = useQuery(api.capacity.overview, { weekStart, weeks });

  if (me === undefined || data === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (
    me?.role !== "admin" &&
    me?.role !== "pm" &&
    me?.role !== "department_lead" &&
    me?.role !== "director"
  ) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Kapacitní plánování je dostupné jen pro management.
      </div>
    );
  }
  if (data === null) return null;

  const weekStarts = Array.from(
    { length: data.weeks },
    (_, i) => data.weekStart + i * 7 * 24 * 3600 * 1000,
  );

  const rows =
    view === "skills"
      ? data.skills.map((s) => ({
          key: s.skill,
          label:
            s.skill === "ostatni"
              ? "Nezařazeno"
              : SKILL_LABELS[s.skill as Skill],
          sub: s.skill === "ostatni" ? "bez disciplíny" : `${s.people} lidí`,
          capacity: s.capacity,
          cells: s.cells,
          later: s.later,
          unscheduled: s.unscheduled,
        }))
      : data.people.map((p) => ({
          key: p.userId,
          label: p.name,
          sub:
            (p.skills as Skill[]).map((s) => SKILL_LABELS[s]).join(", ") ||
            (p.department
              ? DEPARTMENT_LABELS[p.department as Department]
              : "—"),
          capacity: p.capacity,
          cells: p.cells,
          later: p.later,
          unscheduled: p.unscheduled,
        }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <Gauge className="h-6 w-6" />
            Kapacity
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Vytížení podle zbývajících odhadů otevřených úkolů (kalibrováno
            podle historie). Úkol se počítá do týdne svého termínu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm dark:border-slate-700">
            <button
              type="button"
              onClick={() => setView("skills")}
              className={cn(
                "rounded px-3 py-1",
                view === "skills"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400",
              )}
            >
              Disciplíny
            </button>
            <button
              type="button"
              onClick={() => setView("people")}
              className={cn(
                "rounded px-3 py-1",
                view === "people"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400",
              )}
            >
              Lidé
            </button>
          </div>
          <Select
            value={String(weeks)}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="w-auto"
          >
            <option value="4">4 týdny</option>
            <option value="8">8 týdnů</option>
            <option value="12">12 týdnů</option>
          </Select>
        </div>
      </div>

      {data.missingEstimateCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{data.missingEstimateCount}</strong> otevřených úkolů nemá
            odhad hodin — nejsou v plánu zahrnuté. Doplň odhady v detailu
            úkolu, ať je obraz úplný.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left text-xs uppercase text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                    {view === "skills" ? "Disciplína" : "Člověk"}
                  </th>
                  <th className="px-2 py-2 text-right text-xs uppercase text-slate-600 dark:text-slate-400">
                    Kap./t
                  </th>
                  {weekStarts.map((ws, i) => (
                    <th
                      key={ws}
                      className={cn(
                        "px-1.5 py-2 text-center text-[10px] uppercase whitespace-nowrap text-slate-600 dark:text-slate-400",
                        i === 0 && "font-bold",
                      )}
                    >
                      {weekLabel(ws)}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right text-[10px] uppercase text-slate-500 dark:text-slate-500">
                    Později
                  </th>
                  <th className="px-2 py-2 text-right text-[10px] uppercase text-slate-500 dark:text-slate-500">
                    Bez term.
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 dark:bg-slate-900">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {r.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {r.sub}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {r.capacity > 0 ? fmtH(r.capacity) : "—"}
                    </td>
                    {r.cells.map((c, i) => {
                      const load =
                        r.capacity > 0
                          ? Math.round((c.demand / r.capacity) * 100)
                          : c.demand > 0
                            ? null
                            : 0;
                      const empty = c.demand === 0;
                      return (
                        <td key={i} className="px-1 py-1 text-center">
                          <button
                            type="button"
                            disabled={empty}
                            onClick={() =>
                              setSelected({
                                title: `${r.label} · ${weekLabel(weekStarts[i])}`,
                                capacity: r.capacity > 0 ? r.capacity : null,
                                demand: c.demand,
                                tasks: c.tasks,
                              })
                            }
                            className={cn(
                              "w-full min-w-[52px] rounded px-1 py-1.5 text-xs font-medium tabular-nums",
                              empty
                                ? "text-slate-300 dark:text-slate-700"
                                : cn(loadTone(load), "hover:opacity-80"),
                            )}
                            title={
                              empty
                                ? undefined
                                : `${fmtH(c.demand)} h poptávka${r.capacity > 0 ? ` / ${fmtH(r.capacity)} h kapacita (${load}%)` : " — bez kapacity!"}`
                            }
                          >
                            {empty
                              ? "·"
                              : load === null
                                ? `${fmtH(c.demand)}h!`
                                : `${load}%`}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {r.later > 0 ? `${fmtH(r.later)} h` : "·"}
                    </td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {r.unscheduled > 0 ? `${fmtH(r.unscheduled)} h` : "·"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-emerald-100 dark:bg-emerald-950/50" /> &lt; 70 % volno
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-amber-200 dark:bg-amber-950/70" /> 70–95 % vytíženo
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-red-200 dark:bg-red-950/70" /> &gt; 95 % přetíženo
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-red-600 dark:bg-red-700" /> &gt; 130 % kriticky
        </span>
        <span>
          „h!" = poptávka bez lidí s danou disciplínou · „Později" = termín za
          horizontem · čísla jsou ± kalibrace
        </span>
      </div>

      {selected && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                {selected.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
              >
                Zavřít ✕
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Poptávka <strong>{fmtH(selected.demand)} h</strong>
              {selected.capacity
                ? ` z kapacity ${fmtH(selected.capacity)} h/týden`
                : " — žádná kapacita (nikdo nemá tuto disciplínu)"}
            </p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {selected.tasks
                .sort((a, b) => b.hours - a.hours)
                .map((t) => (
                  <li
                    key={t.taskId}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/projekty/${t.projectId}?task=${t.taskId}`}
                        className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
                      >
                        {t.title}
                      </Link>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {t.projectName}
                        {t.assigneeName ? ` · ${t.assigneeName}` : " · nepřiřazeno"}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {fmtH(t.hours)} h
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
