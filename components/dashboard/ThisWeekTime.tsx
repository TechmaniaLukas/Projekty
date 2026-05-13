"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Clock, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TimeBlockDialog } from "@/components/time/TimeBlockDialog";
import { cn } from "@/lib/utils";

function clientWeekRange(): { weekStart: number; weekEnd: number } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  const start = d.getTime();
  const end = start + 7 * 24 * 3600 * 1000;
  return { weekStart: start, weekEnd: end };
}

export function ThisWeekTime() {
  const range = useMemo(() => clientWeekRange(), []);
  const data = useQuery(api.timeEntries.myThisWeekTotal, range);
  const [logOpen, setLogOpen] = useState(false);

  if (data === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tento týden</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">Načítám…</p>
        </CardContent>
      </Card>
    );
  }

  const target = 40;
  const pct = Math.min(100, Math.round((data.hours / target) * 100));
  const formatted = data.hours.toString().replace(".", ",");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Tento týden
            </span>
          </CardTitle>
          <Link
            href="/vykazy"
            className="text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
          >
            Otevřít výkaz →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {formatted}
          </span>
          <span className="text-base text-slate-500 dark:text-slate-400">
            / {target} h
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pct >= 100
                ? "bg-emerald-500"
                : pct >= 50
                  ? "bg-blue-500"
                  : "bg-amber-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Zalogovat čas
        </Button>
      </CardContent>
      <TimeBlockDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </Card>
  );
}
