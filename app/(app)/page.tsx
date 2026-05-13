"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BootstrapView } from "@/components/dashboard/BootstrapView";
import { MyTasks } from "@/components/dashboard/MyTasks";
import { UpcomingDeadlines } from "@/components/dashboard/UpcomingDeadlines";
import { DepartmentSummary } from "@/components/dashboard/DepartmentSummary";
import { ThisWeekTime } from "@/components/dashboard/ThisWeekTime";
import { PendingApprovals } from "@/components/milestones/PendingApprovals";
import { ROLE_LABELS } from "@/lib/constants";

export default function DashboardPage() {
  const me = useQuery(api.users.me);

  if (me === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  if (!me?.role) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Můj přehled
        </h1>
        <BootstrapView />
      </div>
    );
  }

  const today = new Date().toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const showDeptSummary = me.role === "admin" || me.role === "pm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Dobrý den, {me.name ?? me.email?.split("@")[0] ?? "uživateli"}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {today} · {ROLE_LABELS[me.role]}
        </p>
      </div>
      <PendingApprovals />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ThisWeekTime />
        <MyTasks />
        <UpcomingDeadlines />
      </div>
      {showDeptSummary && <DepartmentSummary />}
    </div>
  );
}
