import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { Providers } from '@/components/providers';
import { requireSession } from '@/lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <Providers session={session}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
