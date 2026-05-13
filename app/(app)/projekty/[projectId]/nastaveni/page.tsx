"use client";

import Link from "next/link";
import { use } from "react";
import { ChevronLeft } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { Card, CardContent } from "@/components/ui/card";

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const id = projectId as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId: id });

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

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href={`/projekty/${project._id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
      >
        <ChevronLeft className="h-4 w-4" />
        Zpět na projekt
      </Link>
      <h1 className="text-2xl font-bold">Nastavení projektu</h1>
      <Card>
        <CardContent className="p-6">
          <ProjectForm project={project} />
        </CardContent>
      </Card>
    </div>
  );
}
