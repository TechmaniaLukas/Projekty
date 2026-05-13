"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck, MessageSquare, UserPlus, RefreshCw, Calendar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

const TYPE_ICONS = {
  task_assigned: UserPlus,
  task_status_changed: RefreshCw,
  comment_added: MessageSquare,
  project_assigned: UserPlus,
  deadline_soon: Calendar,
} as const;

export default function NotificationsPage() {
  const notifications = useQuery(api.notifications.listMine, { limit: 100 });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const unreadIds = useMemo<Id<"notifications">[]>(() => {
    if (!notifications) return [];
    return notifications.filter((n) => !n.readAt).map((n) => n._id);
  }, [notifications]);

  useEffect(() => {
    if (unreadIds.length > 0) {
      const t = setTimeout(() => {
        markRead({ notificationIds: unreadIds });
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [unreadIds.join(","), markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" /> Notifikace
        </h1>
        {notifications && notifications.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead({})}
            disabled={unreadIds.length === 0}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Označit vše jako přečtené
          </Button>
        )}
      </div>

      {notifications === undefined && (
        <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>
      )}

      {notifications && notifications.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Žádné notifikace.
          </CardContent>
        </Card>
      )}

      {notifications && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            const href = n.taskId && n.projectId
              ? `/projekty/${n.projectId}?task=${n.taskId}`
              : n.projectId
                ? `/projekty/${n.projectId}`
                : "#";
            return (
              <Link
                key={n._id}
                href={href}
                className={cn(
                  "flex gap-3 rounded-lg border p-3 transition-colors",
                  n.readAt
                    ? "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                    : "border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800",
                )}
              >
                <div className="relative shrink-0">
                  {n.actor ? (
                    <Avatar
                      name={n.actor.name ?? null}
                      email={n.actor.email ?? null}
                      size="md"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      <Icon className="h-4 w-4" />
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{n.title}</div>
                  {n.body && (
                    <div className="text-sm text-slate-600 truncate dark:text-slate-400">{n.body}</div>
                  )}
                  <div className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">
                    {relativeTime(n._creationTime)}
                  </div>
                </div>
                {!n.readAt && (
                  <span
                    className="self-start mt-1 h-2 w-2 rounded-full bg-blue-500"
                    title="Nepřečteno"
                  />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
