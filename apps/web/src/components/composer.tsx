'use client';

import { useRef, useState } from 'react';
import { useRealtimeContext } from '@/components/realtime-provider';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/format';
import { useCannedReplies, useSendMessage } from '@/lib/queries';

export function Composer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'reply' | 'note'>('reply');
  const lastTypingRef = useRef(0);
  const send = useSendMessage(conversationId);
  const canned = useCannedReplies();
  const { notifyTyping } = useRealtimeContext();

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    await send.mutateAsync({ body: trimmed, kind });
    setBody('');
  };

  const onChange = (value: string) => {
    setBody(value);
    const now = Date.now();
    if (now - lastTypingRef.current > 1500) {
      lastTypingRef.current = now;
      notifyTyping(conversationId);
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
          {(['reply', 'note'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                kind === option
                  ? option === 'note'
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500',
              )}
            >
              {option === 'note' ? 'Internal note' : 'Reply'}
            </button>
          ))}
        </div>

        <Select
          aria-label="Canned replies"
          value=""
          onChange={(event) => {
            const selected = canned.data?.find((item) => item.id === event.target.value);
            if (selected) {
              setBody((current) => (current ? `${current}\n\n${selected.body}` : selected.body));
            }
          }}
          className="ml-auto w-48"
        >
          <option value="">Canned replies</option>
          {canned.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </Select>
      </div>

      <Textarea
        value={body}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        rows={3}
        placeholder={
          kind === 'note' ? 'Write a note only your team can see' : 'Write a reply to the customer'
        }
        className={cn(kind === 'note' && 'bg-amber-50 dark:bg-amber-950/30')}
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">Ctrl or Cmd plus Enter to send</span>
        <Button onClick={submit} disabled={send.isPending || body.trim().length === 0}>
          {send.isPending ? 'Sending' : kind === 'note' ? 'Save note' : 'Send reply'}
        </Button>
      </div>
    </div>
  );
}
