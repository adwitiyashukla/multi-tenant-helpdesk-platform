import type { Session } from '@helpdesk/contracts';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, clearToken, saveToken } from './api';
import { registerForPush, unregisterPush } from './push';

type SessionValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setSession(await apiFetch<Session>('/auth/me'));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = async (email: string, password: string) => {
    const result = await apiFetch<Session & { token: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    await saveToken(result.token);
    setSession({ user: result.user, organization: result.organization });
    await registerForPush();
  };

  const signOut = async () => {
    await unregisterPush();
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await clearToken();
    setSession(null);
  };

  return (
    <SessionContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
