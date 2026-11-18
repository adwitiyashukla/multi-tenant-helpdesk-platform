'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { useBilling, useInviteMember, useMembers, useTags } from '@/lib/queries';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <p className="border-b border-slate-200 px-4 py-3 text-sm font-medium dark:border-slate-800">
        {title}
      </p>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SettingsPanel() {
  const session = useSession();
  const members = useMembers();
  const tags = useTags();
  const billing = useBilling();
  const invite = useInviteMember();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canInvite = session.user.role === 'owner' || session.user.role === 'admin';

  const submitInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInviteLink(null);
    const data = new FormData(event.currentTarget);

    try {
      const result = await invite.mutateAsync({
        email: String(data.get('email')),
        role: String(data.get('role')),
      });
      setInviteLink(`${window.location.origin}/invite?token=${result.token}`);
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'could not create the invite');
    }
  };

  return (
    <div className="max-w-3xl space-y-5 overflow-y-auto p-6">
      <Section title="Workspace">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Name</dt>
            <dd className="mt-0.5 font-medium">{session.organization.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Plan</dt>
            <dd className="mt-0.5 font-medium">
              <span className="capitalize">{session.organization.plan}</span>
              <span className="ml-2 text-xs font-normal text-slate-500">
                {session.organization.seatsUsed} of {session.organization.seatLimit} seats
              </span>
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500 dark:text-slate-400">Inbound address</dt>
            <dd className="mt-0.5 font-mono text-xs">{session.organization.inboundAddress}</dd>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Mail sent here lands in this inbox as a new conversation.
            </p>
          </div>
          {billing.data?.currentPeriodEnd && (
            <div className="col-span-2">
              <dt className="text-xs text-slate-500 dark:text-slate-400">Renews</dt>
              <dd className="mt-0.5 text-sm">
                {new Date(billing.data.currentPeriodEnd).toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>
      </Section>

      <Section title="Team">
        <div className="space-y-2">
          {members.data?.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
            >
              <Avatar name={member.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {member.email}
                </p>
              </div>
              <Badge tone={member.role === 'owner' ? 'info' : 'neutral'}>{member.role}</Badge>
            </div>
          ))}
        </div>

        {canInvite && (
          <form onSubmit={submitInvite} className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="email">Invite by email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="teammate@company.com"
              />
            </div>
            <div className="w-32">
              <Label htmlFor="role">Role</Label>
              <Select id="role" name="role" defaultValue="agent" className="h-10">
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? 'Working' : 'Invite'}
            </Button>
          </form>
        )}

        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

        {inviteLink && (
          <div className="mt-3 rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Send this link to your teammate. It expires in seven days.
            </p>
            <p className="mt-1 font-mono text-xs break-all">{inviteLink}</p>
          </div>
        )}
      </Section>

      <Section title="Tags">
        <div className="flex flex-wrap gap-2">
          {tags.data?.map((tag) => (
            <Badge key={tag.id}>
              {tag.name}
              <span className="ml-1.5 text-slate-400">{tag.usage}</span>
            </Badge>
          ))}
        </div>
      </Section>
    </div>
  );
}
