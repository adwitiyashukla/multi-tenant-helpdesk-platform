'use client';

import type { Session } from '@helpdesk/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { RealtimeProvider } from './realtime-provider';

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession must be used inside a signed in layout');
  }
  return session;
}

export function Providers({ session, children }: { session: Session | null; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        {session ? <RealtimeProvider>{children}</RealtimeProvider> : children}
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}
