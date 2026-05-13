"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { Card, CardContent } from "@/components/ui/card";

export default function NewProjectPage() {
  const me = useQuery(api.users.me);

  if (me === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  const allowed = me?.role === "admin" || me?.role === "pm" || me?.role === "department_lead";
  if (!allowed) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Pro vytvoření projektu potřebujete roli admin, PM nebo vedoucí oddělení.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/projekty"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
      >
        <ChevronLeft className="h-4 w-4" />
        Zpět na projekty
      </Link>
      <h1 className="text-2xl font-bold">Nový projekt</h1>
      <Card>
        <CardContent className="p-6">
          <ProjectForm />
        </CardContent>
      </Card>
    </div>
  );
}
