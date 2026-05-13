"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  projectId: Id<"projects">;
  parentTaskId?: Id<"tasks">;
  depth: number;
  onCancel: () => void;
  onCreated: () => void;
}

export function QuickAddTaskRow({
  projectId,
  parentTaskId,
  depth,
  onCancel,
  onCreated,
}: Props) {
  const create = useMutation(api.tasks.create);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await create({ projectId, parentTaskId, title: title.trim() });
      setTitle("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-800/50"
      style={{ paddingLeft: `${depth * 24 + 32}px` }}
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Název nového úkolu… (Enter = uložit, Esc = zrušit)"
        disabled={busy}
        className="h-8"
      />
      <Button size="sm" onClick={submit} disabled={busy || !title.trim()}>
        Přidat
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        Zrušit
      </Button>
    </div>
  );
}
