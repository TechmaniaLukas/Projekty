"use client";

import Link from "next/link";
import { Layers, FilePlus2, Pencil } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PROJECT_DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
} from "@/lib/constants";

interface Props {
  template: Doc<"projects">;
  taskCount: number;
  canEdit: boolean;
  canUse: boolean;
  onUse: () => void;
}

export function TemplateCard({ template, taskCount, canEdit, canUse, onUse }: Props) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex-1 space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Badge tone={DEPARTMENT_COLORS[template.department]}>
            {PROJECT_DEPARTMENT_LABELS[template.department]}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Layers className="h-3.5 w-3.5" />
            {taskCount} {taskCount === 1 ? "úkol" : taskCount >= 2 && taskCount <= 4 ? "úkoly" : "úkolů"}
          </span>
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {template.name}
        </h3>
        {template.description && (
          <p className="text-sm text-slate-500 line-clamp-3 dark:text-slate-400">
            {template.description}
          </p>
        )}
      </CardContent>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
        {canUse && (
          <Button size="sm" onClick={onUse}>
            <FilePlus2 className="h-3.5 w-3.5" />
            Použít šablonu
          </Button>
        )}
        {canEdit && (
          <Link href={`/sablony/${template._id}`}>
            <Button size="sm" variant="outline">
              <Pencil className="h-3.5 w-3.5" />
              Upravit
            </Button>
          </Link>
        )}
      </div>
    </Card>
  );
}
