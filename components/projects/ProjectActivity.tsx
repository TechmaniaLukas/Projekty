"use client";

import { useQuery } from "convex/react";
import { Plus, CheckCircle2, MessageSquare, Paperclip } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/dates";

interface Props {
  projectId: Id<"projects">;
}

export function ProjectActivity({ projectId }: Props) {
  const events = useQuery(api.projects.recentActivity, { projectId, limit: 80 });

  if (events === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám aktivitu…</div>;
  }
  if (events.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Žádná aktivita.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((e, i) => {
        const Icon = iconFor(e.kind);
        const bg = bgFor(e.kind);
        const actorName = e.actor?.name ?? e.actor?.email ?? "Někdo";
        return (
          <div
            key={`${e.at}-${i}`}
            className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="relative shrink-0">
              {e.actor ? (
                <Avatar
                  name={e.actor.name ?? null}
                  email={e.actor.email ?? null}
                  size="md"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                  <Icon className="h-4 w-4" />
                </div>
              )}
              <span
                className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white dark:border-slate-900 ${bg}`}
              >
                <Icon className="h-2.5 w-2.5 text-white" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-900 dark:text-slate-100">
                <span className="font-medium">{actorName}</span>{" "}
                {messageFor(e)}{" "}
                <span className="font-medium">„{e.taskTitle}"</span>
              </div>
              {e.kind === "comment_added" && (
                <div className="mt-1 rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700 line-clamp-3 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  {e.preview}
                </div>
              )}
              {e.kind === "attachment_added" && (
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Soubor: {e.fileName}
                </div>
              )}
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {relativeTime(e.at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function iconFor(kind: string) {
  if (kind === "task_created") return Plus;
  if (kind === "task_done") return CheckCircle2;
  if (kind === "comment_added") return MessageSquare;
  if (kind === "attachment_added") return Paperclip;
  return Plus;
}

function bgFor(kind: string): string {
  if (kind === "task_created") return "bg-blue-500";
  if (kind === "task_done") return "bg-emerald-500";
  if (kind === "comment_added") return "bg-violet-500";
  if (kind === "attachment_added") return "bg-amber-500";
  return "bg-slate-500";
}

function messageFor(e: {
  kind: string;
}): string {
  if (e.kind === "task_created") return "vytvořil úkol";
  if (e.kind === "task_done") return "dokončil úkol";
  if (e.kind === "comment_added") return "okomentoval úkol";
  if (e.kind === "attachment_added") return "přidal přílohu k úkolu";
  return "upravil úkol";
}
