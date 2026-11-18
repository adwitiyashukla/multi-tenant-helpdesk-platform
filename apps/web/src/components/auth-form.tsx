'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/api';

type Mode = 'login' | 'signup';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const payload =
      mode === 'signup'
        ? {
            organizationName: String(data.get('organizationName')),
            name: String(data.get('name')),
            email: String(data.get('email')),
            password: String(data.get('password')),
          }
        : { email: String(data.get('email')), password: String(data.get('password')) };

    try {
      await apiFetch(`/auth/${mode}`, { method: 'POST', body: payload });
      router.push('/inbox');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'something went wrong');
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {mode === 'signup' && (
        <>
          <div>
            <Label htmlFor="organizationName">Workspace name</Label>
            <Input id="organizationName" name="organizationName" required minLength={2} />
          </div>
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" required minLength={2} />
          </div>
        </>
      )}

      <div>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === 'signup' ? 10 : 1}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
        {mode === 'signup' && <p className="mt-1 text-xs text-slate-500">at least 10 characters</p>}
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Working' : mode === 'signup' ? 'Create workspace' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {mode === 'signup' ? (
          <>
            Already have a workspace?{' '}
            <Link href="/login" className="font-medium text-slate-900 dark:text-slate-100">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Need a workspace?{' '}
            <Link href="/signup" className="font-medium text-slate-900 dark:text-slate-100">
              Create one
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
