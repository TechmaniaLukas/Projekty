"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Printer } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  PROJECT_DEPARTMENT_LABELS,
  type ProjectDepartment,
} from "@/lib/constants";

const MONTHS = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

export default function MonthlyReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const me = useQuery(api.users.me);
  const report = useQuery(api.directorDashboard.monthlyReport, { year, month });

  if (me === undefined) {
    return <div className="text-sm text-slate-500">Načítám…</div>;
  }
  if (me?.role !== "director" && me?.role !== "admin") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Měsíční report je dostupný jen pro ředitele a admina.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          <Printer className="h-4 w-4" />
          Tisk / Uložit jako PDF
        </button>
      </div>

      {report === undefined ? (
        <div className="text-sm text-slate-500">Načítám report…</div>
      ) : report === null ? (
        <div className="text-sm text-slate-500">Report není dostupný.</div>
      ) : (
        <article className="rounded-lg border border-slate-200 bg-white p-8 text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 print:border-0 print:p-0 print:dark:bg-white print:dark:text-black">
          <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Techmania Projekty · Měsíční souhrn
            </div>
            <h1 className="mt-1 text-2xl font-bold">
              {MONTHS[report.period.month - 1]} {report.period.year}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Celkem zalogováno{" "}
              <strong>
                {report.totalHours.toString().replace(".", ",")} h
              </strong>{" "}
              · vygenerováno{" "}
              {new Date(report.generatedAt).toLocaleString("cs-CZ")}
            </p>
          </header>

          <section className="mt-6">
            <h2 className="text-lg font-semibold">Přehled po odděleních</h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                  <th className="py-1 pr-3">Oddělení</th>
                  <th className="py-1 pr-3">Aktivní</th>
                  <th className="py-1 pr-3">Dokončené úkoly</th>
                  <th className="py-1 pr-3">Schválené milníky</th>
                  <th className="py-1 pr-3 text-right">Hodiny</th>
                </tr>
              </thead>
              <tbody>
                {report.byDept.map((d) => (
                  <tr
                    key={d.department}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-1.5 pr-3 font-medium">
                      {
                        PROJECT_DEPARTMENT_LABELS[
                          d.department as ProjectDepartment
                        ]
                      }
                    </td>
                    <td className="py-1.5 pr-3">{d.activeProjects}</td>
                    <td className="py-1.5 pr-3">{d.tasksDone}</td>
                    <td className="py-1.5 pr-3">{d.milestonesApproved}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {d.hours.toString().replace(".", ",")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-semibold">
              Schválené milníky ({report.approvedMilestones.length})
            </h2>
            {report.approvedMilestones.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                Žádné milníky schválené v tomto měsíci.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {report.approvedMilestones.map((m, i) => (
                  <li key={i}>
                    <strong>{m.title}</strong> —{" "}
                    <span className="text-slate-600 dark:text-slate-400">
                      {m.projectName}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-semibold">Top kontributoři</h2>
            {report.topContributors.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                Žádný zalogovaný čas.
              </p>
            ) : (
              <ol className="mt-2 space-y-1 text-sm">
                {report.topContributors.map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {i + 1}. {c.name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {c.hours.toString().replace(".", ",")} h
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <footer className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-400 dark:border-slate-800">
            Techmania Science Center — interní dokument
          </footer>
        </article>
      )}
    </div>
  );
}
