import type { ConversationPage } from '@helpdesk/contracts';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { apiFetch } from '@/api';
import { useSession } from '@/session';
import { statusTone, theme } from '@/theme';

const filters = [
  { key: '', label: 'All' },
  { key: 'assignee=me', label: 'Mine' },
  { key: 'assignee=none', label: 'Unassigned' },
  { key: 'breached=true', label: 'Breached' },
];

export default function Inbox() {
  const { session, signOut } = useSession();
  const [page, setPage] = useState<ConversationPage | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const query = filter ? `?${filter}&limit=25` : '?limit=25';
    try {
      setPage(await apiFetch<ConversationPage>(`/conversations${query}`));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (!session) {
    return null;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.workspace}>{session.organization.name}</Text>
          <Text style={styles.user}>{session.user.name}</Text>
        </View>
        <Pressable
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        {filters.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => setFilter(item.key)}
            style={[styles.chip, filter === item.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === item.key && styles.chipTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={page?.items ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
          renderItem={({ item }) => (
            <Link href={`/inbox/${item.id}`} asChild>
              <Pressable style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.customer} numberOfLines={1}>
                    {item.customer.name ?? item.customer.email}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: statusTone[item.status] }]} />
                </View>
                <Text style={styles.subject} numberOfLines={1}>
                  {item.subject}
                </Text>
                <Text style={styles.snippet} numberOfLines={2}>
                  {item.snippet}
                </Text>
                <View style={styles.rowMeta}>
                  {item.slaBreachedAt ? (
                    <Text style={[styles.meta, { color: theme.danger }]}>sla breached</Text>
                  ) : null}
                  {item.assignee ? (
                    <Text style={styles.meta}>assigned to {item.assignee.name}</Text>
                  ) : (
                    <Text style={styles.meta}>unassigned</Text>
                  )}
                </View>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  workspace: { fontSize: 15, fontWeight: '700', color: theme.text },
  user: { fontSize: 12, color: theme.muted },
  signOut: { fontSize: 13, color: theme.danger, fontWeight: '600' },
  filters: { flexDirection: 'row', gap: 8, padding: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { fontSize: 12, color: theme.muted, fontWeight: '600' },
  chipTextActive: { color: '#ffffff' },
  row: {
    backgroundColor: theme.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  customer: { fontSize: 14, fontWeight: '600', color: theme.text, flex: 1 },
  subject: { fontSize: 14, color: theme.text, marginTop: 2 },
  snippet: { fontSize: 12, color: theme.muted, marginTop: 2 },
  rowMeta: { flexDirection: 'row', gap: 10, marginTop: 6 },
  meta: { fontSize: 11, color: theme.muted },
  empty: { textAlign: 'center', marginTop: 40, color: theme.muted },
});
