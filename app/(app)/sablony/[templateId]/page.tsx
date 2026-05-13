"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2, FilePlus2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { TaskTree } from "@/components/tasks/TaskTree";
import { UseTemplateDialog } from "@/components/templates/UseTemplateDialog";
import {
  PROJECT_DEPARTMENT_OPTIONS,
  PROJECT_DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  type ProjectDepartment,
} from "@/lib/constants";

export default function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = use(params);
  const id = templateId as Id<"projects">;

  const router = useRouter();
  const toast = useToast();
  const me = useQuery(api.users.me);
  const template = useQuery(api.templates.get, { templateId: id });
  const update = useMutation(api.templates.update);
  const remove = useMutation(api.templates.remove);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState<ProjectDepartment>("cross");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usingThis, setUsingThis] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description ?? "");
      setDepartment(template.department);
      setDirty(false);
    }
  }, [template?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (template === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (template === null) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Šablona nenalezena nebo k ní nemáš přístup.
      </div>
    );
  }

  const canEdit =
    me?.role === "admin" ||
    me?.role === "pm" ||
    (me?.role === "department_lead" &&
      (template.department === "cross" || template.department === me.department));

  async function saveHeader() {
    setSaving(true);
    try {
      await update({
        templateId: id,
        name: name.trim(),
        description: description.trim() || undefined,
        department,
      });
      toast.success("Šablona uložena", name.trim());
      setDirty(false);
    } catch (err) {
      toast.error("Uložení selhalo", err instanceof Error ? err.message : "Chyba");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!template) return;
    if (!confirm(`Smazat šablonu „${template.name}" včetně všech úkolů?`)) return;
    try {
      await remove({ templateId: id });
      toast.success("Šablona smazána");
      router.push("/sablony");
    } catch (err) {
      toast.error("Smazání selhalo", err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/sablony"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" />
        Zpět na šablony
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge tone={DEPARTMENT_COLORS[template.department]}>
              {PROJECT_DEPARTMENT_LABELS[template.department]}
            </Badge>
            <Badge tone="bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-900">
              ŠABLONA
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {template.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button onClick={() => setUsingThis(true)}>
              <FilePlus2 className="h-3.5 w-3.5" />
              Použít šablonu
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              Smazat
            </Button>
          )}
        </div>
      </div>

      {canEdit && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div>
                <Label htmlFor="t-name">Název</Label>
                <Input
                  id="t-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="t-dept">Oddělení</Label>
                <Select
                  id="t-dept"
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value as ProjectDepartment);
                    setDirty(true);
                  }}
                >
                  {PROJECT_DEPARTMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="t-desc">Popis</Label>
              <Textarea
                id="t-desc"
                rows={2}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
            {dirty && (
              <div className="flex gap-2">
                <Button onClick={saveHeader} disabled={saving}>
                  {saving ? "Ukládám…" : "Uložit změny"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Struktura úkolů
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Přidej do šablony typové úkoly + podúkoly. Při použití šablony se vše
          naklonuje do nového projektu (bez přiřazení a termínů — ty doplníš v
          projektu).
        </p>
      </div>

      <TaskTree projectId={id} project={template} />

      {usingThis && (
        <UseTemplateDialog
          template={template}
          onClose={() => setUsingThis(false)}
        />
      )}
    </div>
  );
}
