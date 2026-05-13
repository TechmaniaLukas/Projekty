"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { SmilePlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface Props {
  commentId: Id<"comments">;
  reactions: Array<{ emoji: string; count: number; userIds: Id<"users">[] }>;
  meId: Id<"users"> | null | undefined;
}

const QUICK_EMOJIS = ["👍", "❤️", "✅", "🚀", "👀", "🎉"];

export function CommentReactions({ commentId, reactions, meId }: Props) {
  const toggle = useMutation(api.reactions.toggle);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function onToggle(emoji: string) {
    setBusy(emoji);
    try {
      await toggle({ commentId, emoji });
    } finally {
      setBusy(null);
      setPickerOpen(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {reactions.map((r) => {
        const mine = !!meId && r.userIds.includes(meId);
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={() => onToggle(r.emoji)}
            disabled={busy === r.emoji}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors",
              mine
                ? "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
            title={mine ? "Odebrat tvou reakci" : "Přidat reakci"}
          >
            <span className="text-sm leading-none">{r.emoji}</span>
            <span className="font-medium">{r.count}</span>
          </button>
        );
      })}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Přidat reakci"
          title="Přidat reakci"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setPickerOpen(false)}
              aria-hidden
            />
            <div className="absolute left-0 bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onToggle(e)}
                  disabled={busy === e}
                  className="rounded-full p-1 text-base hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
