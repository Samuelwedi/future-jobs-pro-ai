import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

type Status = 'pending' | 'in_progress' | 'completed';
type Task = { id: string; description: string; status: Status; assigned_to?: string; assigned_name?: string; created_at?: string };
type Employee = { id: string; first_name: string; last_name: string };

const statusMeta: Record<Status, { label: string; color: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  pending: { label: 'Ready', color: '#94A3B8', icon: 'radio-button-unchecked' },
  in_progress: { label: 'In progress', color: '#FBBF24', icon: 'timelapse' },
  completed: { label: 'Completed', color: '#34D399', icon: 'check-circle' },
};

export default function TasksScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const role = String((user as any)?.role || '').toLowerCase();
  const isManager = ['boss', 'manager', 'admin'].includes(role);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showComposer, setShowComposer] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ tasks: Task[] }>('/tasks');
      setTasks(response.tasks || []);
      if (isManager) {
        const people = await api.get<{ users: Employee[] }>('/kiosk/users');
        setEmployees(people.users || []);
      }
    } catch (cause: any) {
      Alert.alert('Tasks unavailable', cause?.response?.data?.message || cause?.message || 'Could not load tasks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isManager]);

  useEffect(() => { void load(); }, [load]);

  const visibleTasks = useMemo(() => filter === 'all' ? tasks : tasks.filter(task => task.status === filter), [filter, tasks]);
  const completed = tasks.filter(task => task.status === 'completed').length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  const createTask = async () => {
    if (!description.trim()) return Alert.alert('Task details required', 'Describe the work that needs to be completed.');
    try {
      const response = await api.post<{ task: Task }>('/tasks', { description: description.trim(), assigned_to: assignedTo || null });
      const assignee = employees.find(person => person.id === assignedTo);
      setTasks(current => [{ ...response.task, assigned_name: assignee ? `${assignee.first_name} ${assignee.last_name}` : undefined }, ...current]);
      setDescription('');
      setAssignedTo('');
      setShowComposer(false);
    } catch (cause: any) {
      Alert.alert('Task not created', cause?.response?.data?.message || cause?.message || 'Please try again.');
    }
  };

  const advance = async (task: Task) => {
    const next: Status = task.status === 'pending' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : 'pending';
    try {
      await api.patch(`/tasks/${task.id}`, { status: next });
      setTasks(current => current.map(item => item.id === task.id ? { ...item, status: next } : item));
    } catch (cause: any) {
      Alert.alert('Task not updated', cause?.response?.data?.message || cause?.message || 'You may only update tasks assigned to you.');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#22D3EE" /><Text style={styles.muted}>Loading the work board…</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><MaterialIcons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}><Text style={styles.title}>Work Board</Text><Text style={styles.muted}>{tasks.length} assignments • {progress}% complete</Text></View>
        {isManager ? <TouchableOpacity style={styles.addButton} onPress={() => setShowComposer(value => !value)}><MaterialIcons name={showComposer ? 'close' : 'add'} size={23} color="#06131B" /></TouchableOpacity> : null}
      </View>

      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

      {showComposer && isManager ? (
        <View style={styles.composer}>
          <Text style={styles.sectionLabel}>NEW ASSIGNMENT</Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Describe the expected result…" placeholderTextColor="#64748B" multiline style={styles.input} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <TouchableOpacity style={[styles.personChip, !assignedTo && styles.personSelected]} onPress={() => setAssignedTo('')}><Text style={styles.chipText}>Unassigned</Text></TouchableOpacity>
            {employees.map(person => <TouchableOpacity key={person.id} style={[styles.personChip, assignedTo === person.id && styles.personSelected]} onPress={() => setAssignedTo(person.id)}><Text style={styles.chipText}>{person.first_name} {person.last_name}</Text></TouchableOpacity>)}
          </ScrollView>
          <TouchableOpacity style={styles.createButton} onPress={createTask}><MaterialIcons name="auto-awesome" size={18} color="#06131B" /><Text style={styles.createText}>Create and notify</Text></TouchableOpacity>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
        {(['all', 'pending', 'in_progress', 'completed'] as const).map(value => <TouchableOpacity key={value} style={[styles.filter, filter === value && styles.filterActive]} onPress={() => setFilter(value)}><Text style={styles.filterText}>{value === 'all' ? `All ${tasks.length}` : statusMeta[value].label}</Text></TouchableOpacity>)}
      </ScrollView>

      <FlatList
        data={visibleTasks}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="#22D3EE" />}
        ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="task-alt" size={50} color="#476079" /><Text style={styles.emptyTitle}>Nothing in this lane</Text><Text style={styles.muted}>New work and completed results will appear here.</Text></View>}
        renderItem={({ item }) => {
          const meta = statusMeta[item.status] || statusMeta.pending;
          return (
            <TouchableOpacity style={styles.card} onPress={() => advance(item)} activeOpacity={0.75}>
              <View style={[styles.statusIcon, { backgroundColor: `${meta.color}20` }]}><MaterialIcons name={meta.icon} size={24} color={meta.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.description}>{item.description}</Text>
                <View style={styles.metaRow}><Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text><Text style={styles.dotText}>•</Text><Text style={styles.assignee}>{item.assigned_name || 'Unassigned'}</Text></View>
                <Text style={styles.tapHint}>Tap to {item.status === 'pending' ? 'start work' : item.status === 'in_progress' ? 'mark complete' : 'reopen'}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#64748B" />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111F' }, center: { flex: 1, backgroundColor: '#07111F', alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1E3144' }, title: { color: '#FFF', fontSize: 22, fontWeight: '900' }, muted: { color: '#8FA0B5', fontSize: 11, marginTop: 3 }, addButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22D3EE' },
  progressTrack: { height: 3, backgroundColor: '#172536' }, progressFill: { height: 3, backgroundColor: '#34D399' }, composer: { margin: 14, padding: 15, borderRadius: 16, backgroundColor: '#17112B', borderWidth: 1, borderColor: '#5B21B6' }, sectionLabel: { color: '#A78BFA', fontSize: 10, letterSpacing: 1.3, fontWeight: '900' }, input: { marginTop: 10, minHeight: 70, borderRadius: 12, padding: 12, color: '#FFF', backgroundColor: '#0B1624', borderWidth: 1, borderColor: '#334B61', textAlignVertical: 'top' }, personChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: '#101E2D', borderWidth: 1, borderColor: '#263B50', marginRight: 7 }, personSelected: { backgroundColor: '#164E63', borderColor: '#22D3EE' }, chipText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700' }, createButton: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#22D3EE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, createText: { color: '#06131B', fontWeight: '900' },
  filters: { maxHeight: 55, paddingVertical: 10 }, filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, backgroundColor: '#101E2D', borderWidth: 1, borderColor: '#263B50' }, filterActive: { backgroundColor: '#164E63', borderColor: '#22D3EE' }, filterText: { color: '#D6E4F0', fontSize: 11, fontWeight: '800' },
  list: { padding: 14, paddingBottom: 45 }, card: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 15, borderRadius: 16, marginBottom: 10, backgroundColor: '#101E2D', borderWidth: 1, borderColor: '#263B50' }, statusIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, description: { color: '#F8FAFC', fontSize: 14, fontWeight: '700', lineHeight: 20 }, metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 }, statusText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, dotText: { color: '#52667B', marginHorizontal: 6 }, assignee: { color: '#9FB0C2', fontSize: 11 }, tapHint: { color: '#5F758C', fontSize: 9, marginTop: 5 }, empty: { alignItems: 'center', paddingTop: 70 }, emptyTitle: { color: '#D6E4F0', fontSize: 16, fontWeight: '800', marginTop: 12 },
});
