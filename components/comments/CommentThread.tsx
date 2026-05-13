"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MentionableTextarea } from "./MentionableTextarea";
import { NotifyPicker } from "./NotifyPicker";
import { CommentReactions } from "./CommentReactions";
import { relativeTime } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/constants";
import type { Doc } from "@/convex/_generated/dataModel";

function renderWithMentions(text: string, users: Doc<"users">[]): React.ReactNode {
  if (users.length === 0) return text;
  const names = users
    .map((u) => (u.name ?? u.email ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return text;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(^|[\\s])(@(?:${escaped.join("|")}))(?=\\s|$|[.,!?])`, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const idx = match.index + match[1].length;
    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
    parts.push(
      <span
        key={`m-${idx}`}
        className="rounded bg-blue-100 px-1 font-medium text-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
      >
        {match[2]}
      </span>,
    );
    lastIndex = idx + match[2].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

export function CommentThread({ taskId }: { taskId: Id<"tasks"> }) {
  const me = useQuery(api.users.me);
  const comments = useQuery(api.comments.listForTask, { taskId });
  const users = useQuery(api.users.list, {});
  const defaults = useQuery(api.comments.defaultRecipients, { taskId });
  const reactions = useQuery(
    api.reactions.listForComments,
    comments && comments.length > 0
      ? { commentIds: comments.map((c) => c._id) }
      : "skip",
  );
  const add = useMutation(api.comments.add);
  const edit = useMutation(api.comments.edit);
  const remove = useMutation(api.comments.remove);

  const [draft, setDraft] = useState("");
  const [draftMentions, setDraftMentions] = useState<Id<"users">[]>([]);
  const [notifyIds, setNotifyIds] = useState<Set<Id<"users">>>(new Set());
  const [userOverride, setUserOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<Id<"comments"> | null>(null);
  const [editingText, setEditingText] = useState("");

  const defaultIds = useMemo(() => {
    const s = new Set<Id<"users">>();
    for (const r of defaults ?? []) s.add(r.user._id);
    return s;
  }, [defaults]);

  useEffect(() => {
    if (userOverride) return;
    setNotifyIds(new Set(defaultIds));
  }, [defaultIds, userOverride]);

  useEffect(() => {
    setNotifyIds((prev) => {
      const next = new Set(prev);
      for (const id of draftMentions) next.add(id);
      return next;
    });
  }, [draftMentions]);

  const mentionedSet = useMemo(
    () => new Set<Id<"users">>(draftMentions),
    [draftMentions],
  );

  async function send() {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await add({
        taskId,
        text: draft,
        mentions: draftMentions,
        notifyUserIds: Array.from(notifyIds),
      });
      setDraft("");
      setDraftMentions([]);
      setNotifyIds(new Set(defaultIds));
      setUserOverride(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(id: Id<"comments">) {
    if (!editingText.trim()) return;
    await edit({ commentId: id, text: editingText });
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {comments === undefined && (
          <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>
        )}
        {comments?.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Zatím žádné komentáře.
          </div>
        )}
        {comments?.map((c) => {
          const author = c.author;
          const isMine = me && c.authorId === me._id;
          const isEditing = editingId === c._id;
          return (
            <div key={c._id} className="flex gap-3">
              <Avatar
                name={author?.name ?? null}
                email={author?.email ?? null}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {author?.name ?? author?.email ?? "Neznámý"}
                  </span>
                  {author?.role && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {ROLE_LABELS[author.role]}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {relativeTime(c._creationTime)}
                    {c.editedAt && " · upraveno"}
                  </span>
                </div>
                {isEditing ? (
                  <div className="mt-1.5 space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(c._id)}>
                        Uložit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Zrušit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {renderWithMentions(c.text, users ?? [])}
                  </p>
                )}
                {!isEditing && (
                  <CommentReactions
                    commentId={c._id}
                    reactions={reactions?.[c._id] ?? []}
                    meId={me?._id ?? null}
                  />
                )}
                {isMine && !isEditing && (
                  <div className="mt-1 flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(c._id);
                        setEditingText(c.text);
                      }}
                      className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Upravit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Smazat komentář?")) remove({ commentId: c._id });
                      }}
                      className="text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                    >
                      Smazat
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <MentionableTextarea
          value={draft}
          onChange={(t, m) => {
            setDraft(t);
            setDraftMentions(m);
          }}
          users={users ?? []}
          placeholder="Napsat komentář…  (@ pro zmínku uživatele)"
          rows={3}
          disabled={submitting}
          onSubmitShortcut={send}
        />
        <div className="mt-2">
          <NotifyPicker
            selectedIds={notifyIds}
            onChange={(s) => {
              setNotifyIds(s);
              setUserOverride(true);
            }}
            meId={me?._id ?? null}
            defaultRecipients={defaults ?? []}
            mentionedIds={mentionedSet}
            allUsers={users ?? []}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Tip: Ctrl+Enter pro odeslání · @ pro zmínku
          </span>
          <Button onClick={send} disabled={submitting || !draft.trim()}>
            {submitting ? "Odesílám…" : "Odeslat"}
          </Button>
        </div>
      </div>
    </div>
  );
}
