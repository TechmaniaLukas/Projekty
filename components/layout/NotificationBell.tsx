"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Bell } from "lucide-react";
import { api } from "@/convex/_generated/api";

export function NotificationBell() {
  const count = useQuery(api.notifications.unreadCount);

  return (
    <Link
      href="/notifikace"
      className="relative inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label={`Notifikace${count ? ` (${count} nepřečtených)` : ""}`}
      title={`Notifikace${count ? ` (${count} nepřečtených)` : ""}`}
    >
      <Bell className="h-5 w-5" />
      {!!count && count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
