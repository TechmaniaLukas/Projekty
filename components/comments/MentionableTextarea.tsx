"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (text: string, mentions: Id<"users">[]) => void;
  users: Doc<"users">[];
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  onSubmitShortcut?: () => void;
}

interface MentionState {
  startIdx: number;
  filter: string;
}

function userDisplay(u: Doc<"users">): string {
  return (u.name ?? u.email ?? "Uživatel").replace(/\s+/g, " ").trim();
}

function detectMention(text: string, caret: number): MentionState | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@" && (i === 0 || /\s/.test(text[i - 1]))) {
      const filter = text.slice(i + 1, caret);
      if (/^[A-Za-zÀ-ž0-9 .'-]*$/.test(filter)) {
        return { startIdx: i, filter };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

function extractMentions(
  text: string,
  candidates: Doc<"users">[],
): Id<"users">[] {
  const result = new Set<string>();
  for (const u of candidates) {
    const display = userDisplay(u);
    const escaped = display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?])`, "g");
    if (re.test(text)) result.add(u._id);
  }
  return Array.from(result) as Id<"users">[];
}

export function MentionableTextarea({
  value,
  onChange,
  users,
  placeholder,
  disabled,
  rows = 3,
  onSubmitShortcut,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const filtered = useMemo(() => {
    if (!mention) return [];
    const filter = mention.filter.toLowerCase();
    return users
      .filter((u) => u.isActive !== false)
      .filter((u) => {
        if (!filter) return true;
        return (
          userDisplay(u).toLowerCase().includes(filter) ||
          (u.email?.toLowerCase().includes(filter) ?? false)
        );
      })
      .slice(0, 6);
  }, [mention, users]);

  useEffect(() => {
    setHighlighted(0);
  }, [mention?.filter]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newText = e.target.value;
    onChange(newText, extractMentions(newText, users));
    const caret = e.target.selectionStart;
    setMention(detectMention(newText, caret));
  }

  function selectUser(u: Doc<"users">) {
    if (!mention || !ref.current) return;
    const display = userDisplay(u);
    const before = value.slice(0, mention.startIdx);
    const after = value.slice(mention.startIdx + 1 + mention.filter.length);
    const newText = `${before}@${display} ${after}`.trimEnd() + (after.startsWith(" ") || after === "" ? "" : " ");
    const finalText = newText.endsWith(" ") ? newText : newText + " ";
    onChange(finalText, extractMentions(finalText, users));
    setMention(null);
    queueMicrotask(() => {
      const pos = before.length + 1 + display.length + 1;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectUser(filtered[highlighted]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (
      onSubmitShortcut &&
      e.key === "Enter" &&
      (e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
      onSubmitShortcut();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 100)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:bg-slate-50 md:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:border-slate-500 dark:focus-visible:ring-slate-500 dark:disabled:bg-slate-800/50"
      />
      {mention && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-72 max-w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Zmínit uživatele
          </div>
          <ul role="listbox">
            {filtered.map((u, idx) => (
              <li
                key={u._id}
                role="option"
                aria-selected={idx === highlighted}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectUser(u);
                }}
                onMouseEnter={() => setHighlighted(idx)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                  idx === highlighted ? "bg-slate-100 dark:bg-slate-800" : "bg-white dark:bg-slate-900",
                )}
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {userDisplay(u)}
                </span>
                {u.email && (
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {u.email}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
