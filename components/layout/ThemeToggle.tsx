"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeChoice } from "./ThemeProvider";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options: { value: ThemeChoice; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "light", label: "Světlý", icon: Sun },
    { value: "system", label: "Systém", icon: Monitor },
    { value: "dark", label: "Tmavý", icon: Moon },
  ];
  return (
    <div
      className="hidden sm:inline-flex h-8 items-center rounded-md border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
      role="radiogroup"
      aria-label="Vzhled"
    >
      {options.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            role="radio"
            aria-checked={active}
            title={o.label}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
              active
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function ThemeToggleMobile() {
  const { resolved, toggle } = useTheme();
  const Icon = resolved === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      className="sm:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label="Přepnout vzhled"
      title={resolved === "dark" ? "Přepnout na světlý" : "Přepnout na tmavý"}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
