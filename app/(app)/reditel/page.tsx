"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Crown,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  PROJECT_DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  DEPARTMENT_LABELS,
  ROLE_LABELS,
  type ProjectDepartment,
} from "@/lib/constants";
import { formatDate, isOverdue, isDeadlineSoon } from "@/lib/dates";
import { PendingApprovals } from "@/components/milestones/PendingApprovals";
import { cn } from "@/lib/utils";

const MS_STATUS_LABEL: Record<string, string> = {
  planned: "Plánováno",
  in_progress: "Probíhá",
  submitted: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Vráceno",
};

export default function ReditelPage() {
  const me = useQuery(api.users.me);
  const summary = useQuery(api.directorDashboard.executiveSummary, {});
  const activity = useQuery(api.directorDashboard.recentActivity, { limit: 20 });

  if (me === undefined || summary === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  if (me?.role !== "director" && me?.role !== "admin") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Ředitelský přehled je dostupný pouze pro role „ředitel" a „admin".
      </div>
    );
  }

  if (summary === null) {
    return null;
  }

  const { kpi, byDept, milestones, topContributors } = summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Crown className="h-7 w-7 text-amber-500" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Ředitelský přehled
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Stav projektů technického oddělení napříč všemi sub-odděleními. Read-only.
          </p>
        </div>
        <Link
          href="/report-mesicni"
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Měsíční report →
        </Link>
      </div>

      <PendingApprovals />

      {/* KPI karty */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Aktivní projekty"
          value={kpi.activeProjects}
          subtitle={`z ${kpi.totalProjects} celkem`}
          icon={Activity}
          tone="blue"
        />
        <KpiCard
          label="Po termínu"
          value={kpi.overdueProjects}
          subtitle={kpi.overdueProjects > 0 ? "Vyžaduje pozornost" : "Žádné prošvihy"}
          icon={AlertTriangle}
          tone={kpi.overdueProjects > 0 ? "red" : "green"}
        />
        <KpiCard
          label="Hotovo tento měsíc"
          value={kpi.doneThisMonth}
          icon={CheckCircle2}
          tone="green"
        />
        <KpiCard
          label="Zalogováno (30 dní)"
          value={kpi.totalHours30d.toString().replace(".", ",")}
          suffix=" h"
          icon={Clock}
          tone="slate"
        />
      </div>

      {/* Oddělení */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Stav po odděleních
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {byDept.map((d) => (
            <Card key={d.department}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge tone={DEPARTMENT_COLORS[d.department as ProjectDepartment]}>
                    {PROJECT_DEPARTMENT_LABELS[d.department as ProjectDepartment]}
                  </Badge>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {d.total} projektů
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Metric label="Aktivní" value={d.active} />
                  <Metric label="Pozastav." value={d.onHold} />
                  <Metric
                    label="Po termínu"
                    value={d.overdue}
                    tone={d.overdue > 0 ? "red" : undefined}
                  />
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-xs dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Hodin 30 dní</span>
                  <span className="font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {d.hours30d.toString().replace(".", ",")} h
                  </span>
                </div>
                {d.upcoming.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Nejbližší deadliny
                    </div>
                    {d.upcoming.map((p) => (
                      <Link
                        key={p._id}
                        href={`/projekty/${p._id}`}
                        className="block text-sm hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-slate-700 dark:text-slate-300">
                            {p.name}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-xs",
                              isOverdue(p.deadline)
                                ? "text-red-600 dark:text-red-400"
                                : isDeadlineSoon(p.deadline, 14)
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-slate-500 dark:text-slate-400",
                            )}
                          >
                            {formatDate(p.deadline)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Nadcházející milníky napříč odděleními */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Nadcházející milníky (60 dní)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {milestones.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              V příštích 60 dnech žádné deadliny.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-3">Milník</th>
                    <th className="py-2 pr-3">Projekt</th>
                    <th className="py-2 pr-3">Oddělení</th>
                    <th className="py-2 pr-3">Schvaluje</th>
                    <th className="py-2 pr-3">Stav</th>
                    <th className="py-2 pr-3">Progres</th>
                    <th className="py-2 pr-3 text-right">Termín</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m) => (
                    <tr
                      key={m._id}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/projekty/${m.projectId}?tab=milestones`}
                          className="font-medium text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
                        >
                          {m.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {m.projectName}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={DEPARTMENT_COLORS[m.department as ProjectDepartment]}>
                          {PROJECT_DEPARTMENT_LABELS[m.department as ProjectDepartment]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {m.ownerName ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {MS_STATUS_LABEL[m.status] ?? m.status}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div
                              className="h-full bg-blue-500"
                              style={{ width: `${m.progress}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            {m.progress}%
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-3 text-right text-xs whitespace-nowrap",
                          isOverdue(m.deadline)
                            ? "font-medium text-red-600 dark:text-red-400"
                            : isDeadlineSoon(m.deadline, 14)
                              ? "font-medium text-amber-600 dark:text-amber-400"
                              : "text-slate-500 dark:text-slate-400",
                        )}
                      >
                        {formatDate(m.deadline)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top kontributoři & Activity */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Top kontributoři (30 dní)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topContributors.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                V posledních 30 dnech nikdo nelogoval čas.
              </p>
            ) : (
              <ul className="space-y-2">
                {topContributors.map((c, i) => (
                  <li
                    key={c._id}
                    className="flex items-center gap-3 rounded-md border border-slate-200 p-2 dark:border-slate-800"
                  >
                    <span className="w-5 text-center text-sm font-semibold text-slate-400">
                      {i + 1}.
                    </span>
                    <Avatar name={c.name} email={c.email} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {c.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {c.role ? ROLE_LABELS[c.role as keyof typeof ROLE_LABELS] : ""}
                        {c.department
                          ? ` · ${DEPARTMENT_LABELS[c.department as keyof typeof DEPARTMENT_LABELS]}`
                          : ""}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {c.hours.toString().replace(".", ",")} h
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Aktivita
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity === undefined ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Načítám…</p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Žádná zaznamenaná aktivita.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {activity.map((a) => (
                  <li
                    key={a._id}
                    className="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800"
                  >
                    <div className="text-slate-700 dark:text-slate-300">{a.summary}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {a.actorName} ·{" "}
                      {new Date(a._creationTime).toLocaleString("cs-CZ", {
                        day: "numeric",
                        month: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  suffix,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "red" | "green" | "slate";
}) {
  const toneClass = {
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300",
    red: "text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300",
    green: "text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-300",
    slate: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn("rounded-md p-2", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
            {label}
          </div>
          <div className="mt-0.5 text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {value}
            {suffix ?? ""}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red";
}) {
  return (
    <div>
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "red" && value > 0
            ? "text-red-600 dark:text-red-400"
            : "text-slate-900 dark:text-slate-100",
        )}
      >
        {value}
      </div>
    </div>
  );
}
