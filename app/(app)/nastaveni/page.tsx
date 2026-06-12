"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/constants";
import { fromDateInputValue, formatDate } from "@/lib/dates";

type NotifyMode = "instant" | "daily" | "off";

const NOTIFY_OPTIONS: { value: NotifyMode; label: string; desc: string }[] = [
  {
    value: "instant",
    label: "Okamžitě",
    desc: "E-mail při každé události (přiřazení, komentář, schválení…).",
  },
  {
    value: "daily",
    label: "Denní souhrn",
    desc: "Jen jeden souhrnný e-mail denně. V appce notifikace vidíš hned.",
  },
  {
    value: "off",
    label: "Vypnuto",
    desc: "Žádné e-maily. Notifikace jen v appce (zvoneček).",
  },
];

export default function NastaveniPage() {
  const me = useQuery(api.users.me);
  const updateName = useMutation(api.users.updateMyName);
  const updateNotify = useMutation(api.users.updateMyNotifyPref);
  const toast = useToast();

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);

  if (me === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (me === null) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Nepřihlášený uživatel.
      </div>
    );
  }

  const currentMode: NotifyMode = (me.notifyEmail as NotifyMode) ?? "instant";

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Nastavení
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Jméno</Label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jan Novák"
              />
              <Button
                disabled={savingName || !name.trim() || name === me.name}
                onClick={async () => {
                  setSavingName(true);
                  try {
                    await updateName({ name: name.trim() });
                    toast.success("Jméno uloženo");
                  } catch (err) {
                    toast.error(
                      "Chyba",
                      err instanceof Error ? err.message : "",
                    );
                  } finally {
                    setSavingName(false);
                  }
                }}
              >
                Uložit
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                E-mail:{" "}
              </span>
              <span className="font-medium">{me.email}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                Role:{" "}
              </span>
              <span className="font-medium">
                {me.role ? ROLE_LABELS[me.role] : "—"}
                {me.department
                  ? ` · ${DEPARTMENT_LABELS[me.department]}`
                  : ""}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>E-mailové notifikace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {NOTIFY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={async () => {
                if (o.value === currentMode) return;
                try {
                  await updateNotify({ notifyEmail: o.value });
                  toast.success("Preference uložena");
                } catch (err) {
                  toast.error(
                    "Chyba",
                    err instanceof Error ? err.message : "",
                  );
                }
              }}
              className={
                "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors " +
                (o.value === currentMode
                  ? "border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50")
              }
            >
              <span
                className={
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
                  (o.value === currentMode
                    ? "border-blue-600 bg-blue-600"
                    : "border-slate-400")
                }
              >
                {o.value === currentMode && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  {o.label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {o.desc}
                </span>
              </span>
            </button>
          ))}
          <p className="pt-1 text-xs text-slate-400 dark:text-slate-500">
            „Denní souhrn" zatím funguje jako „vypnuté e-maily" — souhrnný
            e-mail bude doplněn samostatně. Notifikace v appce (zvoneček)
            chodí vždy.
          </p>
        </CardContent>
      </Card>

      <AbsencesSection />
    </div>
  );
}

function AbsencesSection() {
  const absences = useQuery(api.absences.listMine, {});
  const add = useMutation(api.absences.add);
  const remove = useMutation(api.absences.remove);
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const fromMs = fromDateInputValue(from);
    const toMs = fromDateInputValue(to);
    if (fromMs === undefined || toMs === undefined) {
      toast.error("Vyplň od i do");
      return;
    }
    setBusy(true);
    try {
      await add({ from: fromMs, to: toMs, note: note || undefined });
      toast.success("Nepřítomnost uložena");
      setFrom("");
      setTo("");
      setNote("");
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nepřítomnosti (dovolená, nemoc)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Zadané dny se automaticky odečtou z tvé kapacity v plánování
          (heat-mapa, projekce termínů, varování u úkolů). Počítají se jen
          pracovní dny po–pá.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="abs-from">Od</Label>
            <Input
              id="abs-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="abs-to">Do (včetně)</Label>
            <Input
              id="abs-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Label htmlFor="abs-note">Poznámka</Label>
            <Input
              id="abs-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dovolená"
            />
          </div>
          <Button onClick={submit} disabled={busy || !from || !to}>
            Přidat
          </Button>
        </div>

        {absences === undefined ? (
          <p className="text-sm text-slate-400">Načítám…</p>
        ) : absences.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Žádné zadané nepřítomnosti.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {absences.map((a) => {
              const past = a.to < Date.now() - 24 * 3600 * 1000;
              return (
                <li
                  key={a._id}
                  className={
                    "flex items-center justify-between gap-3 py-2 text-sm" +
                    (past ? " opacity-50" : "")
                  }
                >
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatDate(a.from)} – {formatDate(a.to)}
                    {a.note && (
                      <span className="text-slate-500 dark:text-slate-400">
                        {" "}
                        · {a.note}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await remove({ absenceId: a._id });
                      } catch (err) {
                        toast.error(
                          "Chyba",
                          err instanceof Error ? err.message : "",
                        );
                      }
                    }}
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Smazat nepřítomnost"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
