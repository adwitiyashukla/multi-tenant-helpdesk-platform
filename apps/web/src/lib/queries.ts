'use client';

import type {
  CannedReply,
  Conversation,
  ConversationPage,
  Member,
  Message,
  Metrics,
  Subscription,
} from '@helpdesk/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export type InboxFilters = {
  status?: string;
  assignee?: string;
  tag?: string;
  priority?: string;
  q?: string;
  breached?: string;
};

export const keys = {
  conversations: (filters: InboxFilters) => ['conversations', filters] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (id: string) => ['messages', id] as const,
  tags: ['tags'] as const,
  canned: ['canned-replies'] as const,
  members: ['members'] as const,
  metrics: ['metrics'] as const,
  billing: ['billing'] as const,
};

function toQueryString(filters: InboxFilters, cursor?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  if (cursor) {
    params.set('cursor', cursor);
  }
  params.set('limit', '25');
  return params.toString();
}

export function useConversations(filters: InboxFilters) {
  return useInfiniteQuery({
    queryKey: keys.conversations(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<ConversationPage>(`/conversations?${toQueryString(filters, pageParam)}`),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: keys.conversation(id),
    queryFn: () => apiFetch<Conversation>(`/conversations/${id}`),
    enabled: Boolean(id),
  });
}

export function useMessages(id: string) {
  return useQuery({
    queryKey: keys.messages(id),
    queryFn: () => apiFetch<Message[]>(`/conversations/${id}/messages`),
    enabled: Boolean(id),
  });
}

export function useSendMessage(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; kind: 'reply' | 'note' }) =>
      apiFetch<Message>(`/conversations/${id}/messages`, { method: 'POST', body: input }),
    onSuccess: (message) => {
      client.setQueryData<Message[]>(keys.messages(id), (current) =>
        current ? [...current.filter((item) => item.id !== message.id), message] : [message],
      );
      void client.invalidateQueries({ queryKey: keys.conversation(id) });
      void client.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useUpdateConversation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<Conversation>(`/conversations/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (conversation) => {
      client.setQueryData(keys.conversation(id), conversation);
      void client.invalidateQueries({ queryKey: ['conversations'] });
      void client.invalidateQueries({ queryKey: keys.metrics });
    },
  });
}

export function useToggleTag(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, attach }: { name: string; attach: boolean }) =>
      attach
        ? apiFetch<Conversation>(`/conversations/${id}/tags`, { method: 'POST', body: { name } })
        : apiFetch<Conversation>(`/conversations/${id}/tags/${encodeURIComponent(name)}`, {
            method: 'DELETE',
          }),
    onSuccess: (conversation) => {
      client.setQueryData(keys.conversation(id), conversation);
      void client.invalidateQueries({ queryKey: ['conversations'] });
      void client.invalidateQueries({ queryKey: keys.tags });
    },
  });
}

export function useCreateConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      subject: string;
      customerEmail: string;
      customerName?: string;
      body: string;
      priority: string;
    }) => apiFetch<Conversation>('/conversations', { method: 'POST', body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['conversations'] });
      void client.invalidateQueries({ queryKey: keys.metrics });
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string; color: string; usage: number }>>('/tags'),
  });
}

export function useCannedReplies() {
  return useQuery({
    queryKey: keys.canned,
    queryFn: () => apiFetch<CannedReply[]>('/canned-replies'),
  });
}

export function useMembers() {
  return useQuery({ queryKey: keys.members, queryFn: () => apiFetch<Member[]>('/members') });
}

export function useMetrics() {
  return useQuery({ queryKey: keys.metrics, queryFn: () => apiFetch<Metrics>('/metrics') });
}

export function useBilling() {
  return useQuery({
    queryKey: keys.billing,
    queryFn: () => apiFetch<Subscription>('/billing'),
  });
}

export function useInviteMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: string }) =>
      apiFetch<{ token: string; email: string }>('/members/invites', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.members });
    },
  });
}
