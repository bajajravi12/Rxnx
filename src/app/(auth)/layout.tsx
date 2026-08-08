import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-nova-600 text-lg font-bold text-white">
            N
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">Nova</span>
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-panel dark:shadow-panel-dark">
          {children}
        </div>
      </div>
    </div>
  );
}
