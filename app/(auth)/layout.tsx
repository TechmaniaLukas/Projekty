export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
