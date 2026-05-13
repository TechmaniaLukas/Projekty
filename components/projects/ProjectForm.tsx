"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  PROJECT_DEPARTMENT_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  ROLE_LABELS,
  type ProjectDepartment,
  type ProjectStatus,
  type Priority,
} from "@/lib/constants";
import { toDateInputValue, fromDateInputValue } from "@/lib/dates";

interface Props {
  project?: Doc<"projects">;
  onSaved?: (id: Id<"projects">) => void;
}

export function ProjectForm({ project, onSaved }: Props) {
  const router = useRouter();
  const toast = useToast();
  const create = useMutation(api.projects.create);
  const update = useMutation(api.projects.update);
  const users = useQuery(api.users.list, {});

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [department, setDepartment] = useState<ProjectDepartment>(project?.department ?? "it");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "planning");
  const [priorityVal, setPriorityVal] = useState<Priority>(project?.priority ?? "medium");
  const [deadline, setDeadline] = useState(toDateInputValue(project?.deadline));
  const [startDate, setStartDate] = useState(toDateInputValue(project?.startDate));
  const [ownerId, setOwnerId] = useState<string>(project?.ownerId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleOwners = (users ?? []).filter(
    (u) => u.role === "pm" || u.role === "admin" || u.role === "department_lead",
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const owner = ownerId || (eligibleOwners[0]?._id ?? "");
      if (!owner) throw new Error("Zvolte vlastníka projektu");
      if (!name.trim()) throw new Error("Název je povinný");

      if (project) {
        await update({
          projectId: project._id,
          name: name.trim(),
          description: description.trim() || undefined,
          department,
          status,
          priority: priorityVal,
          deadline: fromDateInputValue(deadline) ?? null,
          startDate: fromDateInputValue(startDate) ?? null,
          ownerId: owner as Id<"users">,
        });
        toast.success("Projekt aktualizován", name.trim());
        onSaved?.(project._id);
        router.push(`/projekty/${project._id}`);
      } else {
        const id = await create({
          name: name.trim(),
          description: description.trim() || undefined,
          department,
          status,
          priority: priorityVal,
          deadline: fromDateInputValue(deadline),
          startDate: fromDateInputValue(startDate),
          ownerId: owner as Id<"users">,
        });
        toast.success("Projekt vytvořen", name.trim());
        onSaved?.(id);
        router.push(`/projekty/${id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Nastala chyba";
      setError(msg);
      toast.error("Uložení selhalo", msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label htmlFor="name">Název projektu *</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Např. Modernizace IT infrastruktury"
        />
      </div>
      <div>
        <Label htmlFor="description">Popis</Label>
        <Textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Stručný popis cíle a kontextu projektu…"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="department">Oddělení *</Label>
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
        </div>
        <div>
          <Label htmlFor="owner">Vlastník (PM/admin/vedoucí)</Label>
          <Select
            id="owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">— Zvolte —</option>
            {eligibleOwners.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name ?? u.email}{" "}
                {u.role ? `(${ROLE_LABELS[u.role]})` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Stav</Label>
          <Select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="priority">Priorita</Label>
          <Select
            id="priority"
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
          <Label htmlFor="startDate">Začátek</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="deadline">Termín</Label>
          <Input
            id="deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Ukládám…" : project ? "Uložit změny" : "Vytvořit projekt"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Zrušit
        </Button>
      </div>
    </form>
  );
}
