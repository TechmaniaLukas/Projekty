"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserPlus, X } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  selectedIds: Set<Id<"users">>;
  onChange: (ids: Set<Id<"users">>) => void;
  meId?: Id<"users"> | null;
  defaultRecipients: Array<{
    user: Doc<"users">;
    reason: "assignee" | "creator" | "owner" | "watcher";
  }>;
  mentionedIds: Set<Id<"users">>;
  allUsers: Doc<"users">[];
}

const REASON_LABEL: Record<"assignee" | "creator" | "owner" | "watcher", string> = {
  assignee: "přiřazen",
  creator: "autor",
  owner: "vlastník projektu",
  watcher: "sleduje úkol",
};

export function NotifyPicker({
  selectedIds,
  onChange,
  meId,
  defaultRecipients,
  mentionedIds,
  allUsers,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setFilter("");
      return;
    }
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const userById = useMemo(() => {
    const m = new Map<string, Doc<"users">>();
    for (const u of allUsers) m.set(u._id, u);
    return m;
  }, [allUsers]);

  const reasonById = useMemo(() => {
    const m = new Map<string, "assignee" | "creator" | "owner" | "watcher">();
    for (const r of defaultRecipients) m.set(r.user._id, r.reason);
    return m;
  }, [defaultRecipients]);

  const selectedList = Array.from(selectedIds)
    .map((id) => userById.get(id))
    .filter((u): u is Doc<"users"> => !!u)
    .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));

  const candidates = useMemo(() => {
    const lower = filter.toLowerCase();
    return allUsers
      .filter((u) => u.isActive !== false)
      .filter((u) => meId !== u._id)
      .filter((u) => !selectedIds.has(u._id))
      .filter((u) => {
        if (!lower) return true;
        return (
          (u.name ?? "").toLowerCase().includes(lower) ||
          (u.email ?? "").toLowerCase().includes(lower)
        );
      })
      .slice(0, 20);
  }, [allUsers, filter, meId, selectedIds]);

  function toggle(id: Id<"users">) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Notifikovat:
        </span>
        {selectedList.length === 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Nikoho navíc — pošle se jen autorovi a přiřazeným.
          </span>
        )}
        {selectedList.map((u) => {
          const reason = reasonById.get(u._id);
          const isMention = mentionedIds.has(u._id);
          return (
            <span
              key={u._id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs",
                isMention
                  ? "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                  : reason
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                    : "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
              )}
              title={
                isMention
                  ? "Zmíněn @ v textu"
                  : reason
                    ? `Auto: ${REASON_LABEL[reason]}`
                    : "Ručně přidán"
              }
            >
              <Avatar
                name={u.name ?? null}
                email={u.email ?? null}
                size="sm"
                className="!h-4 !w-4 !text-[8px]"
              />
              <span className="max-w-[120px] truncate">
                {u.name ?? u.email}
              </span>
              <button
                type="button"
                onClick={() => toggle(u._id)}
                className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                aria-label={`Odebrat ${u.name ?? u.email}`}
                title="Odebrat z notifikace"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <UserPlus className="h-3 w-3" />
            Přidat
          </button>
          {open && (
            <div
              ref={popoverRef}
              className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Hledat uživatele…"
                className="w-full border-b border-slate-200 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-slate-400 dark:border-slate-700 dark:placeholder:text-slate-500"
                autoFocus
              />
              <div className="max-h-64 overflow-y-auto">
                {candidates.length === 0 ? (
                  <div className="px-3 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                    {filter
                      ? "Nic nenalezeno."
                      : "Žádní další uživatelé."}
                  </div>
                ) : (
                  <ul role="listbox">
                    {candidates.map((u) => (
                      <li
                        key={u._id}
                        onClick={() => {
                          toggle(u._id);
                        }}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Avatar
                          name={u.name ?? null}
                          email={u.email ?? null}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {u.name ?? u.email}
                          </div>
                          {u.email && u.name && (
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {u.email}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
