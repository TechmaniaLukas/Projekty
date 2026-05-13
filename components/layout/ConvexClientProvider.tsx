"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
          <h2 className="font-semibold mb-2">Convex není nakonfigurován</h2>
          <p className="text-sm">
            V <code>.env.local</code> chybí <code>NEXT_PUBLIC_CONVEX_URL</code>. Spusť{" "}
            <code>npx convex dev</code> v rootu projektu - přihlásí tě, vytvoří deployment a
            URL doplní automaticky.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ConvexAuthProvider client={convex}>
      <ToastProvider>{children}</ToastProvider>
    </ConvexAuthProvider>
  );
}
