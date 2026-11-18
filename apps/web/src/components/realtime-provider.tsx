'use client';

import type { PresenceUser } from '@helpdesk/contracts';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { useRealtime } from '@/lib/socket';

type RealtimeValue = {
  presence: PresenceUser[];
  typing: { conversationId: string; name: string; at: number } | null;
  connected: boolean;
  notifyTyping: (conversationId: string) => void;
  setActiveConversationId: (id: string | null) => void;
};

const RealtimeContext = createContext<RealtimeValue | null>(null);

export function useRealtimeContext(): RealtimeValue {
  const value = useContext(RealtimeContext);
  if (!value) {
    throw new Error('useRealtimeContext must be used inside RealtimeProvider');
  }
  return value;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const realtime = useRealtime(activeConversationId);

  return (
    <RealtimeContext.Provider value={{ ...realtime, setActiveConversationId }}>
      {children}
    </RealtimeContext.Provider>
  );
}
