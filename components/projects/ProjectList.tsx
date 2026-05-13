"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ProjectCard } from "./ProjectCard";
import { PRIORITY_ORDER } from "@/lib/constants";
import type { ProjectDepartment, ProjectStatus } from "@/lib/constants";

export function ProjectList() {
  const params = useSearchParams();
  const dept = params.get("dept") as ProjectDepartment | null;
  const status = params.get("status") as ProjectStatus | null;
  const includeArchived = params.get("archived") === "1";
  const q = params.get("q") ?? "";

  const projects = useQuery(api.projects.list, {
    department: dept ?? undefined,
    status: status ?? undefined,
    includeArchived,
    search: q || undefined,
  });

  const allUsers = useQuery(api.users.list, {});

  const projectIds: Id<"projects">[] = projects?.map((p) => p._id) ?? [];
  const stats = useQuery(
    api.projects.taskStats,
    projects ? { projectIds } : "skip",
  );

  if (projects === undefined) {
    return (
      <div className="py-12 text-center text-slate-500 dark:text-slate-400">
        Načítám projekty…
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="text-slate-500 dark:text-slate-400">Žádné projekty.</p>
      </div>
    );
  }

  const ownerById = new Map<string, Doc<"users">>();
  for (const u of allUsers ?? []) ownerById.set(u._id, u);

  const sorted = [...projects].sort((a, b) => {
    const da = a.deadline ?? Infinity;
    const db = b.deadline ?? Infinity;
    if (da !== db) return da - db;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((project) => (
        <ProjectCard
          key={project._id}
          project={project}
          owner={ownerById.get(project.ownerId) ?? null}
          stats={stats?.[project._id]}
        />
      ))}
    </div>
  );
}
