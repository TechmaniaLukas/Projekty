"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
  Search as SearchIcon,
  FolderKanban,
  ListTodo,
  User as UserIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const results = useQuery(
    api.search.global,
    open && q.trim().length >= 2 ? { q, limit: 8 } : "skip",
  );

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQ("");
      setHighlighted(0);
    }
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const items = results ?? [];

  function go(idx: number) {
    const item = items[idx];
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) =>
        items.length === 0 ? 0 : (i + 1) % items.length,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) =>
        items.length === 0 ? 0 : (i - 1 + items.length) % items.length,
      );
    } else if (e.key === "Enter" && items.length > 0) {
      e.preventDefault();
      go(highlighted);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm pt-24 px-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
          <SearchIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Hledej projekty, úkoly nebo uživatele…"
            className="flex-1 border-0 bg-transparent py-3 text-sm outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            autoComplete="off"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-slate-300 bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            ESC
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {q.trim().length < 2 && (
            <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Začni psát alespoň 2 znaky.
            </div>
          )}
          {q.trim().length >= 2 && results === undefined && (
            <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Hledám…
            </div>
          )}
          {results !== undefined && results.length === 0 && q.trim().length >= 2 && (
            <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Nic nenalezeno.
            </div>
          )}
          {items.length > 0 && (
            <ul role="listbox">
              {items.map((item, idx) => {
                const Icon =
                  item.kind === "project"
                    ? FolderKanban
                    : item.kind === "task"
                      ? ListTodo
                      : UserIcon;
                return (
                  <li
                    key={`${item.kind}-${item.id}`}
                    role="option"
                    aria-selected={idx === highlighted}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(idx);
                    }}
                    onMouseEnter={() => setHighlighted(idx)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 dark:border-slate-800",
                      idx === highlighted ? "bg-slate-100 dark:bg-slate-800" : "bg-white dark:bg-slate-900",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                        item.kind === "project"
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                          : item.kind === "task"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate dark:text-slate-100">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-slate-500 truncate dark:text-slate-400">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {item.kind === "project"
                        ? "projekt"
                        : item.kind === "task"
                          ? "úkol"
                          : "uživatel"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
          ↑↓ pohyb · Enter otevřít · Esc zavřít · Ctrl/Cmd+K kdekoli
        </div>
      </div>
    </div>
  );
}
