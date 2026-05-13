"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/dates";
import { Paperclip, Download, Trash2, FileText } from "lucide-react";

interface Props {
  taskId: Id<"tasks">;
  canUpload: boolean;
}

const MAX_BYTES = 25 * 1024 * 1024;

export function TaskAttachments({ taskId, canUpload }: Props) {
  const me = useQuery(api.users.me);
  const attachments = useQuery(api.attachments.listForTask, { taskId });
  const generateUrl = useMutation(api.attachments.generateUploadUrl);
  const attach = useMutation(api.attachments.attachToTask);
  const remove = useMutation(api.attachments.remove);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          setError(
            `Soubor "${file.name}" je větší než ${MAX_BYTES / 1024 / 1024} MB`,
          );
          continue;
        }
        const uploadUrl = await generateUrl({ taskId });
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!result.ok) {
          throw new Error(`Upload selhal: ${result.status}`);
        }
        const { storageId } = (await result.json()) as { storageId: string };
        await attach({
          taskId,
          storageId: storageId as Id<"_storage">,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        });
      }
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload selhal");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {canUpload && (
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {uploading ? "Nahrávám…" : "Přidat přílohu"}
          </Button>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Max 25 MB / soubor</p>
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {attachments === undefined && (
        <div className="text-sm text-slate-500 dark:text-slate-400">Načítám…</div>
      )}
      {attachments && attachments.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Žádné přílohy.</p>
      )}
      {attachments && attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((a) => {
            const isImage = a.mimeType.startsWith("image/") && a.url;
            const isOwner = me?._id === a.uploadedBy;
            return (
              <li
                key={a._id}
                className="rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-2">
                  {isImage ? (
                    <a
                      href={a.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.url ?? ""}
                        alt={a.fileName}
                        className="h-12 w-12 rounded object-cover border border-slate-200 dark:border-slate-800"
                      />
                    </a>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <FileText className="h-5 w-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={a.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm font-medium text-slate-900 hover:text-slate-700 dark:text-slate-100 dark:hover:text-slate-300"
                    >
                      {a.fileName}
                    </a>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatBytes(a.size)}</span>
                      <span>·</span>
                      <Avatar
                        name={a.uploader?.name ?? null}
                        email={a.uploader?.email ?? null}
                        size="sm"
                      />
                      <span className="truncate">
                        {a.uploader?.name ?? a.uploader?.email ?? "Neznámý"}
                      </span>
                      <span>·</span>
                      <span>{relativeTime(a._creationTime)}</span>
                    </div>
                  </div>
                  <a
                    href={a.url ?? "#"}
                    download={a.fileName}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    title="Stáhnout"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  {(isOwner || canUpload) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Smazat „${a.fileName}"?`))
                          remove({ attachmentId: a._id });
                      }}
                      className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      title="Smazat"
                      aria-label="Smazat přílohu"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
