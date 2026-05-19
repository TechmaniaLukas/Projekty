"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { FolderKanban } from "lucide-react";
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
    const filtered = !!(dept || status || q || includeArchived);
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
        <FolderKanban className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
        {filtered ? (
          <>
            <p className="mt-3 font-medium text-slate-700 dark:text-slate-300">
              Žádné projekty neodpovídají filtru
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Zkus rozšířit hledání nebo zrušit filtry nahoře.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 font-medium text-slate-700 dark:text-slate-300">
              Zatím tu nejsou žádné projekty
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Založ první projekt a začni přidávat úkoly, milníky a tým.
            </p>
            <Link
              href="/projekty/novy"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              + Nový projekt
            </Link>
          </>
        )}
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
