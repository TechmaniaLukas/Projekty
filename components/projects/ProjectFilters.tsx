"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { Search, X, Star, Bookmark } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  PROJECT_DEPARTMENT_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type ProjectDepartment,
} from "@/lib/constants";

const departmentChips: { value: ProjectDepartment | ""; label: string }[] = [
  { value: "", label: "Vše" },
  ...PROJECT_DEPARTMENT_OPTIONS,
];

export function ProjectFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const dept = (params.get("dept") ?? "") as ProjectDepartment | "";
  const status = params.get("status") ?? "";
  const includeArchived = params.get("archived") === "1";
  const q = params.get("q") ?? "";

  const toast = useToast();
  const savedViews = useQuery(api.savedViews.listMine, { route: "projekty" });
  const saveView = useMutation(api.savedViews.save);
  const removeView = useMutation(api.savedViews.remove);

  const set = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname, router],
  );

  const currentQs = params.toString();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {departmentChips.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => set({ dept: c.value })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              dept === c.value
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            value={q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Hledat projekt podle názvu…"
            className="pl-9"
          />
          {q && (
            <button
              type="button"
              onClick={() => set({ q: null })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
              aria-label="Smazat hledání"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select
          value={status}
          onChange={(e) => set({ status: e.target.value })}
          className="w-auto min-w-[160px]"
        >
          <option value="">Všechny stavy</option>
          {PROJECT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => set({ archived: e.target.checked ? "1" : null })}
            className="h-4 w-4 dark:accent-slate-300"
          />
          Archivované
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        {(savedViews ?? []).map((v) => (
          <span
            key={v._id}
            className="group inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <button
              type="button"
              onClick={() =>
                router.replace(v.params ? `${pathname}?${v.params}` : pathname)
              }
              className="hover:text-slate-900 dark:hover:text-slate-100"
            >
              {v.name}
            </button>
            <button
              type="button"
              onClick={() => removeView({ viewId: v._id })}
              className="rounded-full p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-slate-800"
              aria-label={`Smazat pohled ${v.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={async () => {
            const name = prompt("Název pohledu (uloží aktuální filtry):");
            if (!name || !name.trim()) return;
            try {
              await saveView({
                name: name.trim(),
                route: "projekty",
                params: currentQs,
              });
              toast.success("Pohled uložen", name.trim());
            } catch (err) {
              toast.error("Chyba", err instanceof Error ? err.message : "");
            }
          }}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Star className="h-3 w-3" />
          Uložit pohled
        </button>
      </div>
    </div>
  );
}
