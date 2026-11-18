'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/api';

export function InviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);

    try {
      await apiFetch('/auth/invites/accept', {
        method: 'POST',
        body: {
          token,
          name: String(data.get('name')),
          password: String(data.get('password')),
        },
      });
      router.push('/inbox');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'something went wrong');
      setPending(false);
    }
  };

  if (!token) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        This invite link is missing its token. Ask your workspace admin to send it again.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required minLength={2} />
      </div>
      <div>
        <Label htmlFor="password">Choose a password</Label>
        <Input id="password" name="password" type="password" required minLength={10} />
      </div>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Working' : 'Join the workspace'}
      </Button>
    </form>
  );
}
