"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  PROJECT_DEPARTMENT_OPTIONS,
  type ProjectDepartment,
} from "@/lib/constants";

export default function NewTemplatePage() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const create = useMutation(api.templates.create);
  const toast = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState<ProjectDepartment>("cross");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (me === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  const allowed = me?.role === "admin" || me?.role === "pm" || me?.role === "department_lead";
  if (!allowed) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Pro vytvoření šablony potřebuješ roli admin, PM nebo vedoucí oddělení.
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Název je povinný");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await create({
        name: name.trim(),
        description: description.trim() || undefined,
        department,
      });
      toast.success("Šablona vytvořena", "Teď přidej úkoly do struktury");
      router.push(`/sablony/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chyba";
      setError(msg);
      toast.error("Vytvoření selhalo", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href="/sablony"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" />
        Zpět na šablony
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Nová šablona
      </h1>
      <Card>
        <CardContent className="p-6">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label htmlFor="name">Název *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Např. Vývoj nové expozice"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="description">Popis</Label>
              <Textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Stručný popis kdy a pro jaký typ projektu šablonu použít…"
              />
            </div>
            <div>
              <Label htmlFor="department">Oddělení</Label>
              <Select
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value as ProjectDepartment)}
              >
                {PROJECT_DEPARTMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Pro mezi-oddělenský projekt zvol „Mezi-oddělenský".
              </p>
            </div>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Vytvářím…" : "Vytvořit a přidat úkoly"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={busy}
              >
                Zrušit
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
