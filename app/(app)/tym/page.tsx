"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  ROLE_LABELS,
  DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  type Department,
} from "@/lib/constants";

const departmentSections: Array<{ key: Department | "none"; label: string }> = [
  { key: "it", label: "IT" },
  { key: "facility", label: "Facility" },
  { key: "vyroba", label: "Výroba" },
  { key: "none", label: "Bez oddělení (vedení)" },
];

export default function TymPage() {
  const users = useQuery(api.users.list, {});
  const projects = useQuery(api.projects.list, { includeArchived: true });
  const allTasks = useQuery(api.tasks.listMyTasks, {});

  if (users === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  const taskCounts = new Map<string, number>();
  for (const t of allTasks ?? []) {
    if (t.assigneeId && t.status !== "done") {
      taskCounts.set(t.assigneeId, (taskCounts.get(t.assigneeId) ?? 0) + 1);
    }
  }

  const projectCounts = new Map<string, number>();
  for (const p of projects ?? []) {
    projectCounts.set(p.ownerId, (projectCounts.get(p.ownerId) ?? 0) + 1);
  }

  const grouped: Record<string, Doc<"users">[]> = { it: [], facility: [], vyroba: [], none: [] };
  for (const u of users) {
    if (u.isActive === false) continue;
    const key = u.department ?? "none";
    grouped[key]?.push(u);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tým</h1>
      <div className="space-y-6">
        {departmentSections.map((section) => {
          const list = grouped[section.key] ?? [];
          if (list.length === 0) return null;
          return (
            <section key={section.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{section.label}</h2>
                {section.key !== "none" && (
                  <Badge tone={DEPARTMENT_COLORS[section.key as Department]}>
                    {DEPARTMENT_LABELS[section.key as Department]}
                  </Badge>
                )}
                <span className="text-sm text-slate-500 dark:text-slate-400">{list.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((u) => (
                  <Card key={u._id}>
                    <CardContent className="flex items-center gap-3 p-4">
                      <Avatar name={u.name ?? null} email={u.email ?? null} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate dark:text-slate-100">
                          {u.name ?? u.email ?? "Bez jména"}
                        </div>
                        <div className="text-xs text-slate-500 truncate dark:text-slate-400">
                          {u.role ? ROLE_LABELS[u.role] : "—"}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>{taskCounts.get(u._id) ?? 0} aktivních</span>
                          <span>{projectCounts.get(u._id) ?? 0} projektů</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
