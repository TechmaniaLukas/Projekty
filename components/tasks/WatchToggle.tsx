"use client";

import { useMutation, useQuery } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function WatchToggle({ taskId }: { taskId: Id<"tasks"> }) {
  const watching = useQuery(api.watchers.isWatching, { taskId });
  const watchers = useQuery(api.watchers.listForTask, { taskId });
  const toggle = useMutation(api.watchers.toggle);
  const toast = useToast();

  if (watching === undefined) return null;

  async function onToggle() {
    const result = await toggle({ taskId });
    toast.success(
      result.watching ? "Sleduješ tento úkol" : "Sledování zrušeno",
      result.watching
        ? "Budeš dostávat notifikace o změnách"
        : "Notifikace ukončeny",
    );
  }

  const count = watchers?.length ?? 0;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={watching ? "secondary" : "outline"}
        size="sm"
        onClick={onToggle}
      >
        {watching ? (
          <>
            <EyeOff className="h-3.5 w-3.5" />
            Sleduji
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" />
            Sledovat
          </>
        )}
      </Button>
      {count > 0 && (
        <span
          className="text-xs text-slate-500 dark:text-slate-400"
          title={`${count} ${count === 1 ? "uživatel sleduje" : count >= 2 && count <= 4 ? "uživatelé sledují" : "uživatelů sleduje"}`}
        >
          {count} {count === 1 ? "sledující" : "sledujících"}
        </span>
      )}
    </div>
  );
}
