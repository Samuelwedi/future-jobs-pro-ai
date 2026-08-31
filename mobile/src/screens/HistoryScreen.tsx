import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

type Kind = 'time' | 'task' | 'pto';
type Filter = 'all' | Kind;
type Item = { id: string; kind: Kind; title: string; subtitle: string; status: string; occurredAt: string; detail?: string };
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const elapsed = (start: string, end?: string | null) => {
  if (!end) return 'Currently clocked in';
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export default function HistoryScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError('');
    const end = new Date(), start = new Date();
    start.setDate(start.getDate() - 90);
    const results = await Promise.allSettled([
      api.get<any>(`/time-entries?userId=${encodeURIComponent(user.id)}&start=${isoDay(start)}&end=${isoDay(end)}`),
      api.get<any>('/tasks'), api.get<any>('/pto'),
    ]);
    const next: Item[] = [];
    if (results[0].status === 'fulfilled') for (const entry of results[0].value.entries || []) next.push({
      id: `time-${entry.id}`, kind: 'time', title: entry.project_name || 'Work shift',
      subtitle: `${elapsed(entry.clock_in, entry.clock_out)} • ${entry.approval_status || 'draft'}`,
      status: entry.clock_out ? (entry.payroll_locked ? 'Payroll locked' : 'Completed') : 'Active', occurredAt: entry.clock_in,
      detail: `${new Date(entry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}${entry.project_address ? `\n${entry.project_address}` : ''}`,
    });
    if (results[1].status === 'fulfilled') for (const task of results[1].value.tasks || []) if (task.assigned_to === user.id) next.push({
      id: `task-${task.id}`, kind: 'task', title: task.description || 'Assigned task',
      subtitle: task.status === 'completed' ? 'Work completed' : 'Assigned to you',
      status: String(task.status || 'pending').replace('_', ' '), occurredAt: task.updated_at || task.created_at,
    });
    if (results[2].status === 'fulfilled') for (const request of results[2].value.requests || []) if (request.user_id === user.id) next.push({
      id: `pto-${request.id}`, kind: 'pto', title: `${String(request.type || 'PTO').replace('_', ' ')} leave`,
      subtitle: `${new Date(request.start_date).toLocaleDateString()} – ${new Date(request.end_date).toLocaleDateString()}`,
      status: request.status || 'pending', occurredAt: request.created_at || request.start_date,
    });
    next.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    setItems(next);
    if (results.every(result => result.status === 'rejected')) setError('History could not be loaded. Pull down to try again.');
    setLoading(false); setRefreshing(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  const visible = useMemo(() => filter === 'all' ? items : items.filter(item => item.kind === filter), [filter, items]);
  const count = (kind: Kind) => items.filter(item => item.kind === kind).length;
  const color = (kind: Kind) => kind === 'time' ? '#00D4FF' : kind === 'task' ? '#4CAF50' : '#AB47BC';
  const icon = (kind: Kind) => kind === 'time' ? 'schedule' : kind === 'task' ? 'assignment-turned-in' : 'beach-access';

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#00D4FF" /><Text style={styles.muted}>Building your activity timeline…</Text></View>;
  return <View style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}><Ionicons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
      <View><Text style={styles.title}>History</Text><Text style={styles.muted}>Your work, tasks and time off</Text></View>
      <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={styles.headerButton}><Ionicons name="refresh" size={23} color="#00D4FF" /></TouchableOpacity>
    </View>
    <View style={styles.summary}>{([['time', 'Shifts'], ['task', 'Tasks'], ['pto', 'PTO']] as [Kind, string][]).map(([kind, label]) => <View key={kind} style={styles.stat}><Text style={styles.statValue}>{count(kind)}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>
    <View style={styles.filters}>{(['all', 'time', 'task', 'pto'] as Filter[]).map(value => <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value === 'all' ? 'All' : value === 'time' ? 'Time' : value === 'task' ? 'Tasks' : 'PTO'}</Text></TouchableOpacity>)}</View>
    <FlatList data={visible} keyExtractor={item => item.id} contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00D4FF" />}
      renderItem={({ item }) => <View style={styles.card}><View style={[styles.icon, { backgroundColor: `${color(item.kind)}20` }]}><MaterialIcons name={icon(item.kind) as any} size={24} color={color(item.kind)} /></View><View style={styles.body}><View style={styles.row}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.date}>{new Date(item.occurredAt).toLocaleDateString()}</Text></View><Text style={styles.subtitle}>{item.subtitle}</Text>{item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}<Text style={[styles.status, { color: color(item.kind) }]}>{item.status.toUpperCase()}</Text></View></View>}
      ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="history" size={48} color="#45505F" /><Text style={styles.emptyTitle}>{error || 'No activity yet'}</Text><Text style={styles.emptyText}>Shifts, assigned tasks and PTO from the last 90 days appear here.</Text></View>} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090B10' }, center: { flex: 1, backgroundColor: '#090B10', justifyContent: 'center', alignItems: 'center' }, muted: { color: '#7E899A', fontSize: 12, marginTop: 3, textAlign: 'center' },
  header: { paddingTop: 58, paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#222936' }, headerButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151A22' }, title: { color: '#FFF', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  summary: { flexDirection: 'row', margin: 16, padding: 14, backgroundColor: '#121720', borderRadius: 18, borderWidth: 1, borderColor: '#252D3B' }, stat: { flex: 1, alignItems: 'center' }, statValue: { color: '#FFF', fontSize: 23, fontWeight: '800' }, statLabel: { color: '#7E899A', fontSize: 12 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }, filter: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: '#151A22' }, filterActive: { backgroundColor: '#00D4FF' }, filterText: { color: '#8A94A6', fontWeight: '700', fontSize: 12 }, filterTextActive: { color: '#071014' }, list: { padding: 16, paddingBottom: 50 },
  card: { flexDirection: 'row', backgroundColor: '#121720', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#252D3B' }, icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, body: { flex: 1 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, cardTitle: { color: '#F5F7FA', fontSize: 15, fontWeight: '700', flex: 1 }, date: { color: '#667085', fontSize: 11 }, subtitle: { color: '#AAB2C0', fontSize: 13, marginTop: 5 }, detail: { color: '#737E8F', fontSize: 12, lineHeight: 17, marginTop: 6 }, status: { fontSize: 10, fontWeight: '800', letterSpacing: .8, marginTop: 8 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 }, emptyTitle: { color: '#D7DCE4', fontSize: 17, fontWeight: '700', marginTop: 12, textAlign: 'center' }, emptyText: { color: '#667085', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 6 },
});
