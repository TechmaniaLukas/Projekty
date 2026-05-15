"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Settings, Archive, ArchiveRestore, FileText } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { TaskTree } from "@/components/tasks/TaskTree";
import { ProjectMembersTab } from "@/components/projects/ProjectMembersTab";
import { ProjectActivity } from "@/components/projects/ProjectActivity";
import { ProjectGantt } from "@/components/projects/ProjectGantt";
import { ProjectTimeReport } from "@/components/projects/ProjectTimeReport";
import { MilestoneList } from "@/components/milestones/MilestoneList";
import { ExportButton } from "@/components/projects/ExportButton";
import { useToast } from "@/components/ui/toast";
import {
  PROJECT_DEPARTMENT_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  DEPARTMENT_COLORS,
} from "@/lib/constants";
import { formatDate, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const id = projectId as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId: id });
  const me = useQuery(api.users.me);
  const users = useQuery(api.users.list, {});
  const archive = useMutation(api.projects.archive);
  const unarchive = useMutation(api.projects.unarchive);
  const toast = useToast();

  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs = [
    "tasks",
    "milestones",
    "gantt",
    "time",
    "members",
    "activity",
  ] as const;
  const initialTab = (
    validTabs as readonly string[]
  ).includes(tabParam ?? "")
    ? (tabParam as (typeof validTabs)[number])
    : "tasks";
  const [tab, setTab] = useState<
    "tasks" | "milestones" | "gantt" | "time" | "members" | "activity"
  >(initialTab);

  if (project === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (project === null) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Projekt nenalezen nebo k němu nemáte přístup.
      </div>
    );
  }

  const owner = users?.find((u) => u._id === project.ownerId) ?? null;

  const canEdit = !!(
    me &&
    (me.role === "admin" ||
      me.role === "pm" ||
      (me.role === "department_lead" &&
        (project.department === "cross" || project.department === me.department)))
  );

  const overdue = isOverdue(project.deadline);

  return (
    <div className="space-y-6">
      <Link
        href="/projekty"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
      >
        <ChevronLeft className="h-4 w-4" />
        Zpět na projekty
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={DEPARTMENT_COLORS[project.department]}>
              {PROJECT_DEPARTMENT_LABELS[project.department]}
            </Badge>
            <Badge tone={PROJECT_STATUS_COLORS[project.status]}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            <Badge tone={PRIORITY_COLORS[project.priority]}>
              {PRIORITY_LABELS[project.priority]}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">
              {project.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 pt-1 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className={cn(overdue && "font-medium text-red-600 dark:text-red-400")}>
                Termín: {formatDate(project.deadline)}
                {overdue && " (po termínu)"}
              </span>
            </div>
            {owner && (
              <div className="flex items-center gap-1.5">
                <Avatar name={owner.name ?? null} email={owner.email ?? null} size="sm" />
                <span>{owner.name ?? owner.email}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/projekty/${project._id}/report`}>
            <Button variant="outline" size="sm">
              <FileText className="h-3.5 w-3.5" />
              Report
            </Button>
          </Link>
          <ExportButton project={project} />
          {canEdit && (
            <Link href={`/projekty/${project._id}/nastaveni`}>
              <Button variant="outline" size="sm">
                <Settings className="h-3.5 w-3.5" />
                Nastavení
              </Button>
            </Link>
          )}
          {canEdit && project.status === "archived" && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await unarchive({ projectId: project._id });
                toast.success("Projekt obnoven", project.name);
              }}
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              Obnovit
            </Button>
          )}
          {canEdit && project.status !== "archived" && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!confirm(`Archivovat projekt „${project.name}"?`)) return;
                await archive({ projectId: project._id });
                toast.success("Projekt archivován", project.name);
              }}
            >
              <Archive className="h-3.5 w-3.5" />
              Archivovat
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto">
          {[
            { value: "tasks", label: "Úkoly" },
            { value: "milestones", label: "Milníky" },
            { value: "gantt", label: "Gantt" },
            { value: "time", label: "Výkazy" },
            { value: "members", label: "Členové" },
            { value: "activity", label: "Aktivita" },
          ].map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value as typeof tab)}
              className={cn(
                "border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap",
                tab === t.value
                  ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "tasks" && <TaskTree projectId={project._id} project={project} />}
      {tab === "milestones" && (
        <MilestoneList projectId={project._id} canManage={canEdit} />
      )}
      {tab === "gantt" && <ProjectGantt projectId={project._id} project={project} />}
      {tab === "time" && <ProjectTimeReport project={project} />}
      {tab === "members" && (
        <ProjectMembersTab project={project} canEdit={canEdit} />
      )}
      {tab === "activity" && <ProjectActivity projectId={project._id} />}
    </div>
  );
}
