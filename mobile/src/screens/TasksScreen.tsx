import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface Task {
  id: string;
  name: string;
  status: string;
  assigned_name?: string;
  estimated_hours?: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#888',
  in_progress: '#FF9800',
  completed: '#4CAF50',
};

export default function TasksScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  // ---------- SAFE PARAMS ----------
  const projectId: string = route?.params?.projectId || '';
  const projectName: string = route?.params?.projectName || 'Project';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTasks = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ success: boolean; tasks: Task[] }>(`/tasks/project/${projectId}`);
      setTasks(res.tasks || []);
    } catch (e) {
      console.error('Failed to load tasks', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchTasks(); }, [projectId]);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  const renderTask = ({ item }: { item: Task }) => (
    <View style={styles.taskCard}>
      <View style={styles.taskInfo}>
        <Text style={styles.taskName}>{item.name}</Text>
        <Text style={[styles.taskStatus, { color: STATUS_COLORS[item.status] || '#888' }]}>
          {item.status.replace('_', ' ').toUpperCase()}
        </Text>
        {item.assigned_name && <Text style={styles.taskAssigned}>👤 {item.assigned_name}</Text>}
        {item.estimated_hours && <Text style={styles.taskHours}>⏱ {item.estimated_hours}h</Text>}
      </View>
      <TouchableOpacity onPress={() => Alert.alert('Edit', 'Edit task coming soon')}>
        <MaterialIcons name="edit" size={22} color="#888" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;
  }

  // ---------- Fallback when no project ----------
  if (!projectId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tasks</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyState}>
          <MaterialIcons name="assignment" size={64} color="#888" />
          <Text style={styles.emptyText}>No project selected</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{projectName}</Text>
        <Text style={styles.headerSubtitle}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</Text>
      </View>
      <FlatList
        data={tasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTasks(); }} tintColor="#00D4FF" />}
        ListEmptyComponent={<Text style={styles.empty}>No tasks yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333', gap: 12 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', flex: 1 },
  headerSubtitle: { color: '#888', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40 },
  taskCard: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  taskInfo: { flex: 1 },
  taskName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  taskStatus: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  taskAssigned: { color: '#888', fontSize: 13, marginTop: 4 },
  taskHours: { color: '#888', fontSize: 13, marginTop: 2 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 18, marginTop: 16 },
});