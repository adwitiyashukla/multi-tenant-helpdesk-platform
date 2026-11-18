import type { Conversation, Message } from '@helpdesk/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { apiFetch } from '@/api';
import { theme } from '@/theme';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [detail, thread] = await Promise.all([
      apiFetch<Conversation>(`/conversations/${id}`),
      apiFetch<Message[]>(`/conversations/${id}/messages`),
    ]);
    setConversation(detail);
    setMessages(thread);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    setSending(true);
    try {
      await apiFetch<Message>(`/conversations/${id}/messages`, {
        method: 'POST',
        body: { body: trimmed, kind: 'reply' },
      });
      setBody('');
      await load();
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: string) => {
    const updated = await apiFetch<Conversation>(`/conversations/${id}`, {
      method: 'PATCH',
      body: { status },
    });
    setConversation(updated);
  };

  if (loading || !conversation) {
    return <ActivityIndicator style={{ marginTop: 32 }} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <Text style={styles.subject}>{conversation.subject}</Text>
        <Text style={styles.customer}>
          {conversation.customer.name ?? conversation.customer.email}
        </Text>
        <View style={styles.actions}>
          {['open', 'pending', 'closed'].map((status) => (
            <Pressable
              key={status}
              onPress={() => setStatus(status)}
              style={[styles.chip, conversation.status === status && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, conversation.status === status && styles.chipTextActive]}
              >
                {status}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 14, gap: 10 }}
        renderItem={({ item }) => {
          const outbound = item.kind === 'reply';
          const note = item.kind === 'note';
          return (
            <View style={[styles.bubbleRow, outbound && styles.bubbleRowEnd]}>
              <View
                style={[styles.bubble, outbound && styles.bubbleOut, note && styles.bubbleNote]}
              >
                <Text style={styles.author}>
                  {item.author?.name ?? conversation.customer.email}
                  {note ? ' (internal note)' : ''}
                </Text>
                <Text style={[styles.bubbleText, outbound && styles.bubbleTextOut]}>
                  {item.body}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.composer}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write a reply"
          placeholderTextColor={theme.muted}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={send}
          disabled={sending || body.trim().length === 0}
          style={[styles.send, (sending || !body.trim()) && styles.sendDisabled]}
        >
          <Text style={styles.sendText}>{sending ? '...' : 'Send'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  header: {
    backgroundColor: theme.surface,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  subject: { fontSize: 16, fontWeight: '700', color: theme.text },
  customer: { fontSize: 12, color: theme.muted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { fontSize: 12, color: theme.muted, fontWeight: '600' },
  chipTextActive: { color: '#ffffff' },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowEnd: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  bubbleOut: { backgroundColor: theme.accent, borderColor: theme.accent },
  bubbleNote: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  author: { fontSize: 11, color: theme.muted, marginBottom: 4 },
  bubbleText: { fontSize: 14, color: theme.text },
  bubbleTextOut: { color: '#ffffff' },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 110,
    color: theme.text,
  },
  send: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#ffffff', fontWeight: '600' },
});
