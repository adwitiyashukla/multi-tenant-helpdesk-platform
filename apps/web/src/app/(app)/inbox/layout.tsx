import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { ConversationList } from '@/components/conversation-list';

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <Suspense
        fallback={<div className="w-[420px] border-r border-slate-200 dark:border-slate-800" />}
      >
        <ConversationList />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
