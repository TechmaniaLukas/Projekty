"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ChevronLeft, Printer } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  PROJECT_DEPARTMENT_LABELS,
  PROJECT_STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type ProjectDepartment,
  type ProjectStatus,
  type Priority,
  type TaskStatus,
} from "@/lib/constants";
import { formatDate } from "@/lib/dates";

const MS_STATUS_LABEL: Record<string, string> = {
  planned: "Plánováno",
  in_progress: "Probíhá",
  submitted: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Vráceno k přepracování",
};

export default function ProjectReportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const report = useQuery(api.projects.report, {
    projectId: projectId as Id<"projects">,
  });

  if (report === undefined) {
    return <div className="text-sm text-slate-500">Načítám…</div>;
  }
  if (report === null) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Projekt nenalezen nebo bez přístupu.
      </div>
    );
  }

  const { project, progress, milestones, overdueTasks, risks } = report;
  const hasRisks =
    risks.blockedTasks.length > 0 ||
    risks.rejectedMilestones.length > 0 ||
    risks.overdueMilestones.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none">
      {/* Ovládací lišta — skrytá při tisku */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/projekty/${projectId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Zpět na projekt
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <Printer className="h-4 w-4" />
          Tisk / Uložit jako PDF
        </button>
      </div>

      <article className="rounded-lg border border-slate-200 bg-white p-8 text-slate-900 print:border-0 print:p-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 print:dark:bg-white print:dark:text-black">
        {/* Hlavička */}
        <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Techmania Projekty · Stavový report
              </div>
              <h1 className="mt-1 text-2xl font-bold">{project.name}</h1>
            </div>
            <div className="text-right text-xs text-slate-500">
              Vygenerováno
              <br />
              {new Date(report.generatedAt).toLocaleString("cs-CZ")}
            </div>
          </div>
          {project.description && (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              {project.description}
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
            <Field
              label="Oddělení"
              value={
                PROJECT_DEPARTMENT_LABELS[
                  project.department as ProjectDepartment
                ]
              }
            />
            <Field
              label="Stav"
              value={PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
            />
            <Field
              label="Priorita"
              value={PRIORITY_LABELS[project.priority as Priority]}
            />
            <Field label="Vlastník" value={project.ownerName ?? "—"} />
            <Field
              label="Termín"
              value={project.deadline ? formatDate(project.deadline) : "—"}
            />
            <Field
              label="Start"
              value={project.startDate ? formatDate(project.startDate) : "—"}
            />
          </div>
        </header>

        {/* Progres */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Progres</h2>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {progress.progressPercent}%
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {progress.doneTasks} z {progress.totalTasks} úkolů hotovo
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {(
              ["todo", "in_progress", "blocked", "review", "done"] as TaskStatus[]
            ).map((s) => (
              <span key={s}>
                <span className="text-slate-500">
                  {TASK_STATUS_LABELS[s]}:
                </span>{" "}
                <strong>{progress.byStatus[s] ?? 0}</strong>
              </span>
            ))}
          </div>
        </section>

        {/* Milníky */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Milníky</h2>
          {milestones.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Žádné milníky.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                  <th className="py-1 pr-3">Milník</th>
                  <th className="py-1 pr-3">Stav</th>
                  <th className="py-1 pr-3">Úkoly</th>
                  <th className="py-1 pr-3 text-right">Termín</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => (
                  <tr
                    key={m._id}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-1.5 pr-3">{m.title}</td>
                    <td className="py-1.5 pr-3">
                      {MS_STATUS_LABEL[m.status] ?? m.status}
                    </td>
                    <td className="py-1.5 pr-3">
                      {m.taskTotal > 0
                        ? `${m.taskDone}/${m.taskTotal} (${m.percent}%)`
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {formatDate(m.dueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Rizika */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Rizika</h2>
          {!hasRisks ? (
            <p className="mt-1 text-sm text-green-700">
              Žádná identifikovaná rizika.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {risks.overdueMilestones.map((m) => (
                <li key={m._id} className="text-red-700 dark:text-red-400">
                  ⚠ Prošlý milník: <strong>{m.title}</strong> (termín{" "}
                  {formatDate(m.dueDate)})
                </li>
              ))}
              {risks.rejectedMilestones.map((m) => (
                <li key={m._id} className="text-red-700 dark:text-red-400">
                  ⚠ Vrácený milník: <strong>{m.title}</strong>
                  {m.reason ? ` — ${m.reason}` : ""}
                </li>
              ))}
              {risks.blockedTasks.map((t) => (
                <li key={t._id} className="text-amber-700 dark:text-amber-400">
                  ◼ Blokovaný úkol: <strong>{t.title}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Prošlé úkoly */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold">
            Prošlé úkoly ({overdueTasks.length})
          </h2>
          {overdueTasks.length === 0 ? (
            <p className="mt-1 text-sm text-green-700">
              Žádné úkoly po termínu.
            </p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                  <th className="py-1 pr-3">Úkol</th>
                  <th className="py-1 pr-3">Řešitel</th>
                  <th className="py-1 pr-3">Stav</th>
                  <th className="py-1 pr-3 text-right">Termín</th>
                </tr>
              </thead>
              <tbody>
                {overdueTasks.map((t) => (
                  <tr
                    key={t._id}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-1.5 pr-3">{t.title}</td>
                    <td className="py-1.5 pr-3">{t.assignee ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      {TASK_STATUS_LABELS[t.status as TaskStatus]}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-red-700 dark:text-red-400">
                      {formatDate(t.deadline)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-400 dark:border-slate-800">
          Techmania Science Center — interní dokument
        </footer>
      </article>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
