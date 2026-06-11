"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Mail, Phone, Plus, Trash2, Building2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export function ProjectContacts({
  projectId,
  canEdit,
}: {
  projectId: Id<"projects">;
  canEdit: boolean;
}) {
  const contacts = useQuery(api.projectContacts.listForProject, { projectId });
  const add = useMutation(api.projectContacts.add);
  const remove = useMutation(api.projectContacts.remove);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    company: "",
    role: "",
    email: "",
    phone: "",
    note: "",
  });

  if (contacts === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error("Jméno je povinné");
      return;
    }
    try {
      await add({
        projectId,
        name: form.name,
        company: form.company || undefined,
        role: form.role || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        note: form.note || undefined,
      });
      toast.success("Kontakt přidán");
      setForm({ name: "", company: "", role: "", email: "", phone: "", note: "" });
      setAdding(false);
    } catch (err) {
      toast.error("Chyba", err instanceof Error ? err.message : "");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-sm text-slate-500 dark:text-slate-400">
          Dodavatelé, subdodávky a externí kontakty k projektu.
        </p>
        {canEdit && !adding && (
          <Button size="sm" className="shrink-0" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Přidat kontakt
          </Button>
        )}
      </div>

      {adding && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Jméno *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Jan Novák"
                />
              </div>
              <div>
                <Label>Firma</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="ACME s.r.o."
                />
              </div>
              <div>
                <Label>Role / pozice</Label>
                <Input
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="Subdodavatel — elektro"
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Poznámka</Label>
                <Input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit}>
                Uložit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAdding(false)}
              >
                Zrušit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Zatím žádné kontakty.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c: Doc<"projectContacts">) => (
            <Card key={c._id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {c.name}
                    </div>
                    {(c.role || c.company) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {c.role}
                        {c.role && c.company ? " · " : ""}
                        {c.company}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Smazat kontakt „${c.name}"?`)) return;
                        await remove({ contactId: c._id });
                      }}
                      className="text-slate-400 hover:text-red-500"
                      aria-label="Smazat kontakt"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  {c.company && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      {c.company}
                    </div>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-2 text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-2 text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {c.phone}
                    </a>
                  )}
                  {c.note && (
                    <p className="text-slate-500 dark:text-slate-400">{c.note}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
