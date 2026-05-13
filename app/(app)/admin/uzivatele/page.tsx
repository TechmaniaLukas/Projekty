"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import {
  ROLE_OPTIONS,
  DEPARTMENT_OPTIONS,
  DEPARTMENT_LABELS,
  ROLE_LABELS,
  type Role,
  type Department,
} from "@/lib/constants";

export default function UsersAdminPage() {
  const me = useQuery(api.users.me);
  const users = useQuery(api.users.list, { includeInactive: true });
  const updateUser = useMutation(api.users.updateUser);
  const inviteUser = useMutation(api.users.inviteUser);
  const seed = useMutation(api.seed.seedDevData);
  const toast = useToast();

  const [seedBusy, setSeedBusy] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviteDept, setInviteDept] = useState<Department | "">("it");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  if (me === undefined || users === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>;
  }
  if (me?.role !== "admin") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Pro tuto stránku potřebuješ roli admin.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Uživatelé</h1>

      <Card>
        <CardHeader>
          <CardTitle>Pozvat uživatele</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Vytvoříme uživatele s předvyplněnou rolí. Pošli mu link na{" "}
            <code>/prihlaseni</code> – dostane magic link a po prvním přihlášení uvidí
            aplikaci s nastavenou rolí.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!inviteEmail.trim()) return;
              setInviting(true);
              setInviteError(null);
              try {
                await inviteUser({
                  email: inviteEmail.trim().toLowerCase(),
                  role: inviteRole,
                  department: inviteRole === "admin" || inviteRole === "pm" ? undefined : (inviteDept || undefined),
                  name: inviteName.trim() || undefined,
                });
                toast.success("Uživatel přidán", inviteEmail.trim().toLowerCase());
                setInviteEmail("");
                setInviteName("");
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Chyba";
                setInviteError(msg);
                toast.error("Pozvání selhalo", msg);
              } finally {
                setInviting(false);
              }
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.5fr_1fr_1fr_auto]"
          >
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="jmeno@techmania.cz"
              />
            </div>
            <div>
              <Label>Jméno (volitelné)</Label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Jan Novák"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Oddělení</Label>
              <Select
                value={inviteDept}
                onChange={(e) => setInviteDept(e.target.value as Department | "")}
                disabled={inviteRole === "admin" || inviteRole === "pm"}
              >
                <option value="">—</option>
                {DEPARTMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={inviting}>
                {inviting ? "Ukládám…" : "Vytvořit"}
              </Button>
            </div>
            {inviteError && (
              <div className="sm:col-span-2 lg:col-span-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {inviteError}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seznam uživatelů</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-3 py-2">Uživatel</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Oddělení</th>
                  <th className="px-3 py-2">Aktivní</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow
                    key={u._id}
                    user={u}
                    onUpdate={(patch) => updateUser({ userId: u._id, ...patch })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dev nástroje</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Naplň databázi testovacími daty: 5 uživatelů (PM, 3 vedoucí, 1 člen) a 3
            ukázkové projekty s úkoly.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={seedBusy}
              onClick={async () => {
                setSeedBusy(true);
                try {
                  await seed({});
                  toast.success("Dev data nasypána", "5 uživatelů a 3 projekty");
                } catch (err) {
                  toast.error(
                    "Seed selhal",
                    err instanceof Error ? err.message : "Chyba",
                  );
                } finally {
                  setSeedBusy(false);
                }
              }}
            >
              {seedBusy ? "Seedu ji…" : "Naseedovat dev data"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({
  user,
  onUpdate,
}: {
  user: Doc<"users">;
  onUpdate: (patch: { role?: Role; department?: Department | null; isActive?: boolean; name?: string }) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);

  async function patch(p: { role?: Role; department?: Department | null; isActive?: boolean }) {
    setBusy(true);
    try {
      await onUpdate(p);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name ?? null} email={user.email ?? null} size="md" />
          <div className="min-w-0">
            <div className="font-medium text-slate-900 truncate dark:text-slate-100">
              {user.name ?? "—"}
            </div>
            <div className="text-xs text-slate-500 truncate dark:text-slate-400">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <Select
          value={user.role ?? ""}
          onChange={(e) => patch({ role: e.target.value as Role })}
          disabled={busy}
          className="min-w-[160px]"
        >
          <option value="">— Bez role —</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-3">
        <Select
          value={user.department ?? ""}
          onChange={(e) =>
            patch({
              department: e.target.value
                ? (e.target.value as Department)
                : null,
            })
          }
          disabled={busy || user.role === "admin" || user.role === "pm"}
          className="min-w-[140px]"
        >
          <option value="">—</option>
          {DEPARTMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-3">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={user.isActive !== false}
            onChange={(e) => patch({ isActive: e.target.checked })}
            disabled={busy}
            className="h-4 w-4"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {user.isActive === false ? "Deaktivován" : "Aktivní"}
          </span>
        </label>
      </td>
    </tr>
  );
}
