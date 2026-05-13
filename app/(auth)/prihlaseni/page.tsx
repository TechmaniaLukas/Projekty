import { MagicLinkForm } from "@/components/auth/MagicLinkForm";

export default function LoginPage() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Techmania Projekty
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Přihlaš se do interní aplikace technického oddělení.
        </p>
      </div>
      <MagicLinkForm />
    </div>
  );
}
