"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MagicLinkForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      await signIn("magic-link", { email: email.trim() });
      setStatus("sent");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Něco se pokazilo. Zkus to znovu.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
        <h3 className="font-semibold mb-1">Zkontroluj svůj e-mail</h3>
        <p className="text-sm">
          Na <strong>{email}</strong> jsme poslali přihlašovací odkaz. Klikni na něj a budeš
          přihlášený.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-3 text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-200"
        >
          Zadat jiný e-mail
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="jmeno@techmania.cz"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "sending"}
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={status === "sending"}>
        {status === "sending" ? "Odesílám…" : "Poslat přihlašovací odkaz"}
      </Button>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Žádná hesla. Pošleme ti jednorázový odkaz na e-mail.
      </p>
    </form>
  );
}
