"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function BootstrapView() {
  const me = useQuery(api.users.me);
  const adminCount = useQuery(api.users.adminCount);
  const bootstrap = useMutation(api.users.bootstrapAdmin);

  const [name, setName] = useState(me?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (me === undefined || adminCount === undefined) return null;

  if (adminCount === 0) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Inicializace aplikace</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              V aplikaci ještě není žádný admin. Tvůj e-mail{" "}
              <strong>{me?.email}</strong> bude prvním adminem (vedoucí technického
              oddělení).
            </p>
          </div>
          <div>
            <Label htmlFor="bs-name">Jméno (volitelné)</Label>
            <Input
              id="bs-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lukáš Šuser"
            />
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await bootstrap({ name: name.trim() || undefined });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Chyba");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Inicializuji…" : "Stát se administrátorem"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Čeká se na přiřazení role
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tvůj účet <strong>{me?.email}</strong> ještě nemá přiřazenou roli ani
          oddělení. Požádej administrátora, aby tě nastavil v sekci Uživatelé.
        </p>
      </CardContent>
    </Card>
  );
}
