import type { Session } from '@helpdesk/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch } from './api';

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const cookie = store.toString();
  if (!cookie) {
    return null;
  }
  try {
    return await apiFetch<Session>('/auth/me', { cookie });
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}
