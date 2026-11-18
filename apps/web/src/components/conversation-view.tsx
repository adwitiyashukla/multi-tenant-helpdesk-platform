'use client';

import { Hash, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Composer } from '@/components/composer';
import { useRealtimeContext } from '@/components/realtime-provider';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { clockTime, cn, countdown } from '@/lib/format';
import {
  useConversation,
  useMembers,
  useMessages,
  useTags,
  useToggleTag,
  useUpdateConversation,
} from '@/lib/queries';

export function ConversationView({ conversationId }: { conversationId: string }) {
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const members = useMembers();
  const tags = useTags();
  const update = useUpdateConversation(conversationId);
  const toggleTag = useToggleTag(conversationId);
  const { setActiveConversationId, typing } = useRealtimeContext();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  useEffect(() => {
    setActiveConversationId(conversationId);
    return () => setActiveConversationId(null);
  }, [conversationId, setActiveConversationId]);

  const messageCount = messages.data?.length ?? 0;

  useEffect(() => {
    if (messageCount > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messageCount]);

  if (conversation.isLoading || !conversation.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const data = conversation.data;
  const sla = countdown(data.slaDueAt, data.slaBreachedAt);
  const unusedTags = tags.data?.filter((tag) => !data.tags.includes(tag.name)) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex items-center text-xs text-slate-400">
                <Hash size={12} />
                {data.reference}
              </span>
              <Badge tone={sla.tone === 'ok' ? 'neutral' : sla.tone}>{sla.label}</Badge>
            </div>
            <h1 className="mt-0.5 truncate text-base font-semibold">{data.subject}</h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {data.customer.name ? `${data.customer.name} ` : ''}
              {data.customer.email}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <Select
              aria-label="Conversation status"
              value={data.status}
              onChange={(event) => update.mutate({ status: event.target.value })}
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </Select>
            <Select
              aria-label="Conversation priority"
              value={data.priority}
              onChange={(event) => update.mutate({ priority: event.target.value })}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
            <Select
              aria-label="Assignee"
              value={data.assignee?.id ?? ''}
              onChange={(event) =>
                update.mutate({ assigneeId: event.target.value ? event.target.value : null })
              }
            >
              <option value="">Unassigned</option>
              {members.data?.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {data.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag.mutate({ name: tag, attach: false })}
              title="Remove tag"
            >
              <Badge tone="info">{tag}</Badge>
            </button>
          ))}

          {tagPickerOpen ? (
            <Select
              autoFocus
              aria-label="Add a tag"
              value=""
              onBlur={() => setTagPickerOpen(false)}
              onChange={(event) => {
                if (event.target.value) {
                  toggleTag.mutate({ name: event.target.value, attach: true });
                }
                setTagPickerOpen(false);
              }}
              className="w-40"
            >
              <option value="">Pick a tag</option>
              {unusedTags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </Select>
          ) : (
            <button
              type="button"
              onClick={() => setTagPickerOpen(true)}
              className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-400 dark:border-slate-700"
            >
              <Plus size={11} /> tag
            </button>
          )}
        </div>
      </header>

      <div
        role="log"
        aria-label="Conversation messages"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
      >
        {messages.data?.map((message) => {
          const outbound = message.kind === 'reply';
          const note = message.kind === 'note';
          const author = message.author?.name ?? data.customer.name ?? data.customer.email;

          return (
            <div key={message.id} className={cn('flex gap-3', outbound && 'flex-row-reverse')}>
              <Avatar name={author} />
              <div className={cn('max-w-[70%] min-w-0', outbound && 'items-end text-right')}>
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                  {author}
                  <span className="mx-1.5">-</span>
                  {clockTime(message.createdAt)}
                  {note && <span className="ml-1.5 text-amber-600">internal note</span>}
                </p>
                <div
                  className={cn(
                    'rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap',
                    note
                      ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900'
                      : outbound
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700',
                  )}
                >
                  {message.body}
                </div>
                {message.attachments.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {message.attachments.map((attachment) => (
                      <Badge key={attachment.id}>{attachment.filename}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {typing && typing.conversationId === conversationId && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{typing.name} is typing</p>
        )}

        <div ref={bottomRef} />
      </div>

      <Composer conversationId={conversationId} />
    </div>
  );
}
