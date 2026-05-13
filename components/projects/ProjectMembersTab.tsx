"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/constants";

interface Props {
  project: Doc<"projects">;
  canEdit: boolean;
}

export function ProjectMembersTab({ project, canEdit }: Props) {
  const members = useQuery(api.projects.listMembers, { projectId: project._id });
  const allUsers = useQuery(api.users.list, {});
  const addMember = useMutation(api.projects.addMember);
  const removeMember = useMutation(api.projects.removeMember);

  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<"watcher" | "contributor">("contributor");

  if (members === undefined) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Načítám členy…</div>;
  }

  const memberUserIds = new Set(members.map((m) => m.user?._id).filter(Boolean));
  const availableUsers = (allUsers ?? []).filter((u) => !memberUserIds.has(u._id));

  return (
    <div className="space-y-5 max-w-2xl">
      {canEdit && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Přidat člena</h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
              <div>
                <Label>Uživatel</Label>
                <Select
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                >
                  <option value="">— Zvolte —</option>
                  {availableUsers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name ?? u.email}
                      {u.role ? ` (${ROLE_LABELS[u.role]})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Role v projektu</Label>
                <Select
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value as "watcher" | "contributor")
                  }
                >
                  <option value="contributor">Spolupracovník</option>
                  <option value="watcher">Sledující</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  disabled={!newUserId}
                  onClick={async () => {
                    if (!newUserId) return;
                    await addMember({
                      projectId: project._id,
                      userId: newUserId as Doc<"users">["_id"],
                      role: newRole,
                    });
                    setNewUserId("");
                  }}
                >
                  Přidat
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Členové ({members.length})
        </h3>
        {members.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Zatím žádní členové. Přístup mají uživatelé podle role/oddělení a osoby,
            kterým je úkol přiřazen.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {members.map((m) => (
              <div key={m.membershipId} className="flex items-center gap-3 p-3">
                <Avatar
                  name={m.user?.name ?? null}
                  email={m.user?.email ?? null}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate dark:text-slate-100">
                    {m.user?.name ?? m.user?.email ?? "Neznámý"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {m.user?.role ? ROLE_LABELS[m.user.role] : ""}
                    {m.user?.department ? ` · ${DEPARTMENT_LABELS[m.user.department]}` : ""}
                    {" · "}
                    {m.role === "contributor" ? "Spolupracovník" : "Sledující"}
                  </div>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("Odstranit člena z projektu?")) {
                        removeMember({ membershipId: m.membershipId });
                      }
                    }}
                  >
                    Odebrat
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
