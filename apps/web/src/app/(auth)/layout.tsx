import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-semibold tracking-tight">helpdesk</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            one inbox for the whole support team
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
