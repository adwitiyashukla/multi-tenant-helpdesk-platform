'use client';

import type { PresenceUser, ServerEvent } from '@helpdesk/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { wsUrl } from './api';
import { keys } from './queries';

type TypingState = { conversationId: string; name: string; at: number };

export function useRealtime(activeConversationId: string | null) {
  const client = useQueryClient();
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);

    socket.onmessage = (raw) => {
      const event = JSON.parse(raw.data as string) as ServerEvent;

      if (event.type === 'presence') {
        setPresence(event.users);
        return;
      }
      if (event.type === 'typing') {
        setTyping({ conversationId: event.conversationId, name: event.name, at: Date.now() });
        return;
      }
      if (event.type === 'message.created') {
        client.setQueryData(keys.messages(event.conversationId), (current: unknown) =>
          Array.isArray(current)
            ? [...current.filter((item) => item.id !== event.message.id), event.message]
            : current,
        );
        void client.invalidateQueries({ queryKey: ['conversations'] });
        return;
      }
      if (
        event.type === 'conversation.updated' ||
        event.type === 'conversation.created' ||
        event.type === 'sla.breached'
      ) {
        client.setQueryData(keys.conversation(event.conversation.id), event.conversation);
        void client.invalidateQueries({ queryKey: ['conversations'] });
        void client.invalidateQueries({ queryKey: keys.metrics });
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [client]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!connected || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify({ type: 'viewing', conversationId: activeConversationId }));
  }, [activeConversationId, connected]);

  useEffect(() => {
    if (!typing) {
      return;
    }
    const timer = setTimeout(() => setTyping(null), 4000);
    return () => clearTimeout(timer);
  }, [typing]);

  const notifyTyping = (conversationId: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'typing', conversationId }));
    }
  };

  return { presence, typing, connected, notifyTyping };
}
