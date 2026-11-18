'use client';

import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NewConversationDialog } from '@/components/new-conversation-dialog';
import { useSession } from '@/components/providers';
import { useRealtimeContext } from '@/components/realtime-provider';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { cn, countdown, relativeTime } from '@/lib/format';
import { type InboxFilters, useConversations, useTags } from '@/lib/queries';

const views = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'breached', label: 'Breached' },
];

function filtersFromParams(params: URLSearchParams): InboxFilters {
  const view = params.get('view') ?? 'all';
  return {
    status: params.get('status') ?? undefined,
    tag: params.get('tag') ?? undefined,
    q: params.get('q') ?? undefined,
    assignee: view === 'mine' ? 'me' : view === 'unassigned' ? 'none' : undefined,
    breached: view === 'breached' ? 'true' : undefined,
  };
}

export function ConversationList() {
  const params = useSearchParams();
  const router = useRouter();
  const routeParams = useParams<{ id?: string }>();
  const { presence } = useRealtimeContext();
  const session = useSession();

  const [search, setSearch] = useState(params.get('q') ?? '');
  const [dialogOpen, setDialogOpen] = useState(false);

  const filters = filtersFromParams(new URLSearchParams(params.toString()));
  const view = params.get('view') ?? 'all';
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useConversations(filters);
  const tags = useTags();

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search.trim().length >= 2) {
        next.set('q', search.trim());
      } else {
        next.delete('q');
      }
      if (next.toString() !== params.toString()) {
        router.replace(`/inbox?${next.toString()}`);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, params, router]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.replace(`/inbox?${next.toString()}`);
  };

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const query = params.toString();

  return (
    <div className="flex w-[420px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="space-y-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              className="h-9 w-full rounded-lg border border-slate-300 bg-slate-50 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:bg-slate-900"
            />
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)} title="New conversation">
            <Plus size={15} />
          </Button>
        </div>

        <div className="flex gap-1">
          {views.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setParam('view', item.key === 'all' ? '' : item.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === item.key
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Select
            aria-label="Filter by status"
            value={params.get('status') ?? ''}
            onChange={(event) => setParam('status', event.target.value)}
            className="flex-1"
          >
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="snoozed">Snoozed</option>
            <option value="closed">Closed</option>
          </Select>
          <Select
            aria-label="Filter by tag"
            value={params.get('tag') ?? ''}
            onChange={(event) => setParam('tag', event.target.value)}
            className="flex-1"
          >
            <option value="">Any tag</option>
            {tags.data?.map((tag) => (
              <option key={tag.id} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Nothing here yet.
          </p>
        )}

        {items.map((conversation) => {
          const sla = countdown(conversation.slaDueAt, conversation.slaBreachedAt);
          const active = routeParams.id === conversation.id;
          const watchers = presence.filter(
            (user) => user.viewing === conversation.id && user.id !== session.user.id,
          );

          return (
            <Link
              key={conversation.id}
              href={`/inbox/${conversation.id}${query ? `?${query}` : ''}`}
              className={cn(
                'block border-b border-slate-100 px-4 py-3 transition-colors dark:border-slate-800',
                active
                  ? 'bg-slate-100 dark:bg-slate-800'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar name={conversation.customer.name ?? conversation.customer.email} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">
                      {conversation.customer.name ?? conversation.customer.email}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {relativeTime(conversation.lastMessageAt)}
                    </span>
                  </div>
                  <p className="truncate text-sm text-slate-700 dark:text-slate-300">
                    {conversation.subject}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {conversation.snippet}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={sla.tone === 'ok' ? 'neutral' : sla.tone}>{sla.label}</Badge>
                    {conversation.status !== 'open' && (
                      <Badge tone="info">{conversation.status}</Badge>
                    )}
                    {conversation.priority !== 'normal' && (
                      <Badge tone={conversation.priority === 'low' ? 'neutral' : 'warn'}>
                        {conversation.priority}
                      </Badge>
                    )}
                    {conversation.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                    {conversation.assignee && (
                      <span className="ml-auto" title={`assigned to ${conversation.assignee.name}`}>
                        <Avatar name={conversation.assignee.name} size={18} />
                      </span>
                    )}
                    {watchers.length > 0 && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        {watchers.map((user) => user.name.split(' ')[0]).join(', ')} viewing
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        {hasNextPage && (
          <div className="p-3">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading' : 'Load more'}
            </Button>
          </div>
        )}
      </div>

      {dialogOpen && <NewConversationDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
}
