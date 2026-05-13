"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import {
  ChevronLeft,
  History,
  FolderKanban,
  ListTodo,
  MessageSquare,
  User as UserIcon,
  Link2,
  Paperclip,
  BookTemplate,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { relativeTime, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

type EntityType =
  | "project"
  | "task"
  | "comment"
  | "user"
  | "dependency"
  | "attachment"
  | "template";

const ICONS: Record<EntityType, React.ComponentType<{ className?: string }>> = {
  project: FolderKanban,
  task: ListTodo,
  comment: MessageSquare,
  user: UserIcon,
  dependency: Link2,
  attachment: Paperclip,
  template: BookTemplate,
};

const ENTITY_LABEL: Record<EntityType, string> = {
  project: "Projekt",
  task: "Úkol",
  comment: "Komentář",
  user: "Uživatel",
  dependency: "Závislost",
  attachment: "Příloha",
  template: "Šablona",
};

const ENTITY_TONES: Record<EntityType, string> = {
  project: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  task: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  comment: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  user: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  dependency: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
  attachment: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  template: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
};

export default function AuditPage() {
  const me = useQuery(api.users.me);
  const users = useQuery(api.users.list, { includeInactive: true });
  const [actorId, setActorId] = useState<string>("");
  const [entityType, setEntityType] = useState<EntityType | "">("");

  const entries = useQuery(api.auditLog.list, {
    actorId: actorId ? (actorId as Id<"users">) : undefined,
    entityType: entityType || undefined,
    limit: 200,
  });

  if (me === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (me?.role !== "admin") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Audit log je dostupný jen pro admina.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/uzivatele"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" />
        Zpět
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
          <History className="h-6 w-6" />
          Audit log
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="w-auto min-w-[180px]"
          >
            <option value="">Všichni uživatelé</option>
            {(users ?? []).map((u) => (
              <option key={u._id} value={u._id}>
                {u.name ?? u.email ?? "Uživatel"}
              </option>
            ))}
          </Select>
          <Select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType | "")}
            className="w-auto min-w-[160px]"
          >
            <option value="">Všechny entity</option>
            {(Object.keys(ENTITY_LABEL) as EntityType[]).map((k) => (
              <option key={k} value={k}>
                {ENTITY_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {entries === undefined ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Žádné záznamy odpovídající filtrům.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
            {entries.map((e) => {
              const type = e.entityType as EntityType;
              const Icon = ICONS[type] ?? History;
              const projectLink =
                e.projectId && e.entityType !== "user"
                  ? `/projekty/${e.projectId}`
                  : null;
              return (
                <div
                  key={e._id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                >
                  <Avatar
                    name={e.actor?.name ?? null}
                    email={e.actor?.email ?? null}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {e.actor?.name ?? e.actor?.email ?? "—"}
                      </span>
                      <Badge tone={ENTITY_TONES[type]} className="!text-[10px]">
                        <Icon className="h-3 w-3" />
                        {ENTITY_LABEL[type]}
                      </Badge>
                      <span
                        className="text-xs text-slate-500 dark:text-slate-400"
                        title={formatDateTime(e._creationTime)}
                      >
                        {relativeTime(e._creationTime)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                      {projectLink ? (
                        <Link
                          href={projectLink}
                          className="hover:underline underline-offset-2"
                        >
                          {e.summary}
                        </Link>
                      ) : (
                        <span>{e.summary}</span>
                      )}
                    </div>
                    {e.details && Object.keys(e.details as object).length > 0 && (
                      <details className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <summary className="cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300">
                          Detaily
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-slate-700 dark:bg-slate-800/50">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 hidden sm:inline-block rounded px-1.5 py-0.5 text-[10px] font-mono",
                      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                    )}
                  >
                    {e.action}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
