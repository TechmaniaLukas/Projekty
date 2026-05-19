"use client";

import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { LogOut, Menu, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle, ThemeToggleMobile } from "./ThemeToggle";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/constants";

interface Props {
  onMobileMenu?: () => void;
  onSearch?: () => void;
}

export function Navbar({ onMobileMenu, onSearch }: Props) {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-4 md:px-6 dark:border-slate-800 dark:bg-slate-900 print:hidden">
      <div className="flex items-center gap-1 min-w-0 md:hidden">
        <button
          type="button"
          onClick={onMobileMenu}
          className="-ml-1 rounded-md p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Otevřít menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-base font-bold text-slate-900 truncate dark:text-slate-100">
          Techmania
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-3 ml-auto">
        {me && (
          <button
            type="button"
            onClick={onSearch}
            className="hidden sm:inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Hledat (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Hledat…</span>
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Ctrl K
            </kbd>
          </button>
        )}
        {me && (
          <button
            type="button"
            onClick={onSearch}
            className="sm:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Hledat"
          >
            <Search className="h-5 w-5" />
          </button>
        )}
        {me && <ThemeToggle />}
        {me && <ThemeToggleMobile />}
        {me && <NotificationBell />}
        {me && (
          <Link
            href="/nastaveni"
            className="flex items-center gap-2 rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Nastavení profilu a notifikací"
          >
            <Avatar name={me.name ?? null} email={me.email ?? null} size="md" />
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {me.name ?? me.email ?? "Uživatel"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {me.role ? ROLE_LABELS[me.role] : ""}
                {me.department ? ` · ${DEPARTMENT_LABELS[me.department]}` : ""}
              </div>
            </div>
          </Link>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-700 hover:bg-slate-50 sm:px-3 sm:py-1.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Odhlásit"
        >
          <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">Odhlásit</span>
        </button>
      </div>
    </header>
  );
}
