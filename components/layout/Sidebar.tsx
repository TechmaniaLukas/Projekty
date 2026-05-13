"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, Users, Settings, Calendar, GanttChart, BarChart3, BookTemplate, History, Clock, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  managerOnly?: boolean;
}

const items: NavItem[] = [
  { href: "/", label: "Můj přehled", icon: LayoutDashboard },
  { href: "/projekty", label: "Projekty", icon: FolderKanban },
  { href: "/sablony", label: "Šablony", icon: BookTemplate },
  { href: "/vykazy", label: "Výkazy", icon: Clock },
  { href: "/kalendar", label: "Kalendář", icon: Calendar },
  { href: "/casova-osa", label: "Časová osa", icon: GanttChart },
  { href: "/statistiky", label: "Statistiky", icon: BarChart3, managerOnly: true },
  { href: "/tym", label: "Tým", icon: Users },
  { href: "/admin/uzivatele", label: "Uživatelé", icon: Settings, adminOnly: true },
  { href: "/admin/audit", label: "Audit log", icon: History, adminOnly: true },
];

interface Props {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  const isManager = isAdmin || me?.role === "pm";

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        if (item.adminOnly && !isAdmin) return null;
        if (item.managerOnly && !isManager) return null;
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-slate-200 md:bg-white md:p-4 md:dark:border-slate-800 md:dark:bg-slate-900">
        <div className="mb-6 px-2">
          <Link href="/" className="text-base font-bold text-slate-900 dark:text-slate-100">
            Techmania Projekty
          </Link>
        </div>
        {nav}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
            onClick={onMobileClose}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white p-4 shadow-xl flex flex-col dark:bg-slate-900">
            <div className="mb-6 flex items-center justify-between px-2">
              <Link href="/" className="text-base font-bold text-slate-900 dark:text-slate-100">
                Techmania Projekty
              </Link>
              <button
                type="button"
                onClick={onMobileClose}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Zavřít menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
