"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, BookTemplate } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { UseTemplateDialog } from "@/components/templates/UseTemplateDialog";

export default function TemplatesListPage() {
  const me = useQuery(api.users.me);
  const templates = useQuery(api.templates.list, {});
  const counts = useQuery(
    api.templates.taskCounts,
    templates ? { templateIds: templates.map((t) => t._id) } : "skip",
  );

  const [usingTemplate, setUsingTemplate] = useState<Doc<"projects"> | null>(null);

  const canManage =
    me?.role === "admin" ||
    me?.role === "pm" ||
    me?.role === "department_lead";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Šablony projektů
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Připrav si typové projekty (vývoj expozice, nový exponát, stavební práce…)
            — jedním kliknutím z nich vytvoříš nový projekt s prefilled úkoly.
          </p>
        </div>
        {canManage && (
          <Link href="/sablony/novy">
            <Button>
              <Plus className="h-4 w-4" />
              Nová šablona
            </Button>
          </Link>
        )}
      </div>

      {templates === undefined ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <BookTemplate className="mx-auto mb-3 h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="text-slate-600 dark:text-slate-400">
            Zatím žádné šablony.
          </p>
          {canManage && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Vytvoř první šablonu kliknutím na tlačítko nahoře.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t._id}
              template={t}
              taskCount={counts?.[t._id] ?? 0}
              canEdit={canManage}
              canUse={canManage}
              onUse={() => setUsingTemplate(t)}
            />
          ))}
        </div>
      )}

      <UseTemplateDialog
        template={usingTemplate}
        onClose={() => setUsingTemplate(null)}
      />
    </div>
  );
}
