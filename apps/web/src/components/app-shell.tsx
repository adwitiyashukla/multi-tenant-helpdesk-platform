'use client';

import { BarChart3, Inbox, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/components/providers';
import { useRealtimeContext } from '@/components/realtime-provider';
import { Avatar } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/format';

const links = [
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { presence, connected } = useRealtimeContext();

  const signOut = async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="px-4 py-5">
          <p className="text-lg font-semibold tracking-tight">helpdesk</p>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {session.organization.name}
          </p>
        </div>

        <nav className="flex-1 space-y-1 px-2">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <Icon size={16} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-800">
          <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span
              className={cn('size-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-400')}
            />
            {connected ? `${presence.length} online` : 'reconnecting'}
          </p>
          <div className="mb-3 flex -space-x-1.5">
            {presence.slice(0, 6).map((user) => (
              <span
                key={user.id}
                title={user.name}
                className="ring-2 ring-white dark:ring-slate-900"
              >
                <Avatar name={user.name} size={24} />
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Avatar name={session.user.name} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{session.user.name}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {session.user.role}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
