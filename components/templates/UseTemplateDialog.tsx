"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  PROJECT_DEPARTMENT_OPTIONS,
  PRIORITY_OPTIONS,
  ROLE_LABELS,
  SKILL_LABELS,
  type ProjectDepartment,
  type Priority,
  type Skill,
} from "@/lib/constants";
import { toDateInputValue, fromDateInputValue, formatDate } from "@/lib/dates";

interface Props {
  template: Doc<"projects"> | null;
  onClose: () => void;
}

export function UseTemplateDialog({ template, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const users = useQuery(api.users.list, {});
  const clone = useMutation(api.templates.cloneToProject);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState<ProjectDepartment>("it");
  const [priorityVal, setPriorityVal] = useState<Priority>("medium");
  const [deadline, setDeadline] = useState("");
  const [startDate, setStartDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    if (day !== 1) d.setDate(d.getDate() - (day - 1));
    return d.getTime();
  }, []);
  const forecast = useQuery(
    api.capacity.templateForecast,
    template
      ? {
          templateId: template._id,
          weekStart,
          startDate: fromDateInputValue(startDate),
        }
      : "skip",
  );

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setDescription(template.description ?? "");
    setDepartment(template.department);
    setPriorityVal(template.priority);
    setDeadline("");
    setStartDate("");
    setOwnerId("");
    setError(null);
  }, [template?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!template) return null;

  const eligibleOwners = (users ?? []).filter(
    (u) => u.role === "pm" || u.role === "admin" || u.role === "department_lead",
  );

  async function submit() {
    if (!template) return;
    setError(null);
    setBusy(true);
    try {
      const owner = ownerId || (eligibleOwners[0]?._id ?? "");
      if (!owner) throw new Error("Zvolte vlastníka projektu");
      if (!name.trim()) throw new Error("Název je povinný");

      const newId = await clone({
        templateId: template._id,
        name: name.trim(),
        description: description.trim() || undefined,
        department,
        ownerId: owner as Id<"users">,
        priority: priorityVal,
        deadline: fromDateInputValue(deadline),
        startDate: fromDateInputValue(startDate),
      });
      toast.success("Projekt vytvořen ze šablony", name.trim());
      onClose();
      router.push(`/projekty/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={`Použít šablonu: ${template.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Vytvoří se nový projekt s naklonovanou strukturou úkolů ze šablony{" "}
          <strong>{template.name}</strong>. Stavy úkolů budou „K udělání", přiřazení a
          termíny prázdné — doplníš až v projektu.
        </p>

        <div>
          <Label htmlFor="ut-name">Název projektu *</Label>
          <Input
            id="ut-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Např. Expozice Optika 2026"
          />
        </div>
        <div>
          <Label htmlFor="ut-desc">Popis</Label>
          <Textarea
            id="ut-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ut-dept">Oddělení</Label>
            <Select
              id="ut-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value as ProjectDepartment)}
            >
              {PROJECT_DEPARTMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ut-owner">Vlastník</Label>
            <Select
              id="ut-owner"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              <option value="">— Zvolte —</option>
              {eligibleOwners.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name ?? u.email}
                  {u.role ? ` (${ROLE_LABELS[u.role]})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ut-priority">Priorita</Label>
            <Select
              id="ut-priority"
              value={priorityVal}
              onChange={(e) => setPriorityVal(e.target.value as Priority)}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ut-start">Začátek</Label>
            <Input
              id="ut-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ut-deadline">Termín</Label>
            <Input
              id="ut-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>

        {forecast && forecast.totalHours > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <div className="flex items-center gap-2 font-medium">
              <CalendarClock className="h-4 w-4 shrink-0" />
              Kapacitní projekce
            </div>
            <div className="mt-1 space-y-1">
              {forecast.blockedSkills.length > 0 ? (
                <p className="text-red-700 dark:text-red-300">
                  Nelze spočítat dokončení — nikdo nemá disciplínu:{" "}
                  <strong>
                    {forecast.blockedSkills
                      .map((s) => SKILL_LABELS[s as Skill] ?? s)
                      .join(", ")}
                  </strong>
                  . Přiřaď disciplíny lidem v Uživatelé.
                </p>
              ) : forecast.forecastDate ? (
                <p>
                  Při volné kapacitě realisticky hotovo{" "}
                  <strong>~{formatDate(forecast.forecastDate)}</strong> (
                  {forecast.totalHours.toString().replace(".", ",")} h práce
                  {forecast.perSkill[0]
                    ? `, nejdéle ${SKILL_LABELS[forecast.perSkill[0].skill as Skill] ?? forecast.perSkill[0].skill}`
                    : ""}
                  ).
                </p>
              ) : null}
              {forecast.unskilledHours > 0 && (
                <p className="text-xs opacity-80">
                  {forecast.unskilledHours.toString().replace(".", ",")} h úkolů
                  bez disciplíny není v projekci zahrnuto.
                </p>
              )}
              {forecast.forecastDate &&
                fromDateInputValue(deadline) !== undefined &&
                forecast.forecastDate > fromDateInputValue(deadline)! && (
                  <p className="font-medium text-red-700 dark:text-red-300">
                    ⚠ Zvolený termín je dřív než kapacitní projekce — projekt
                    pravděpodobně nestihnete bez posílení.
                  </p>
                )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Vytvářím…" : "Vytvořit projekt"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Zrušit
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
