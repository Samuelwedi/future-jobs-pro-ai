import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { formatDistanceToNow, format } from 'date-fns';

interface ActiveEmployee {
  userId: string;
  firstName: string;
  lastName: string;
  timeEntryId: string;
  clockIn: string;
  latitude: number | null;
  longitude: number | null;
  lastGpsTime: string | null;
  isMoving: boolean;
  geofenceStatus: string;
  projectName: string;
}

interface AllEmployee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_clocked_in: boolean;
}

interface Project {
  id: string;
  name: string;
}

export default function CrewClockScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [activeEmployees, setActiveEmployees] = useState<ActiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [officeCity, setOfficeCity] = useState('');

  // ─── Bulk modal state ───
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [allEmployees, setAllEmployees] = useState<AllEmployee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // ─── Fetch company city ───
  const fetchCompanyCity = async () => {
    try {
      const res = await api.get<{ office_city?: string }>(`/companies/${user?.companyId}`);
      setOfficeCity(res.office_city || '');
    } catch (e) {
      console.error('Failed to fetch company city:', e);
    }
  };

  // ─── Fetch active employees ───
  const fetchActiveEmployees = async () => {
    try {
      const res = await api.get<{ success: boolean; count: number; employees: ActiveEmployee[] }>(
        `/gps/active/${user?.companyId}`
      );
      setActiveEmployees(res.employees || []);
    } catch (e) {
      console.error('Failed to fetch active employees:', e);
      Alert.alert('Error', 'Could not load active employees');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ─── Fetch all employees & projects for bulk modal ───
  const fetchBulkData = async () => {
    try {
      const [employeesRes, projectsRes] = await Promise.all([
        api.get<{ users: AllEmployee[] }>(`/users/company/${user?.companyId}`),
        api.get<{ projects: Project[] }>('/projects'),
      ]);
      const users = employeesRes.users || [];
      // Check clock-in status for each user
      const withStatus = await Promise.all(
        users.map(async (emp: AllEmployee) => {
          try {
            const activeRes = await api.get<{ entry?: any }>(`/time-entries/active?userId=${emp.id}`);
            return { ...emp, is_clocked_in: !!activeRes.entry };
          } catch {
            return { ...emp, is_clocked_in: false };
          }
        })
      );
      setAllEmployees(withStatus);
      setProjects(projectsRes.projects || []);
    } catch (error) {
      console.error('Failed to fetch bulk data:', error);
      Alert.alert('Error', 'Could not load employee list');
    }
  };

  useEffect(() => {
    fetchCompanyCity();
    fetchActiveEmployees();
  }, []);

  // ─── Open bulk modal ───
  const openBulkModal = () => {
    fetchBulkData();
    setSelectedEmployeeIds(new Set());
    setSelectedProjectId('');
    setBulkModalVisible(true);
  };

  // ─── Toggle employee selection ───
  const toggleEmployeeSelection = (id: string) => {
    const newSet = new Set(selectedEmployeeIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedEmployeeIds(newSet);
  };

  // ─── Bulk clock‑in ───
  const handleBulkClockIn = async () => {
    if (selectedEmployeeIds.size === 0) {
      Alert.alert('No employees selected', 'Please select at least one employee.');
      return;
    }
    if (!selectedProjectId) {
      Alert.alert('No project selected', 'Please select a project.');
      return;
    }
    setBulkLoading(true);
    try {
      const userIds = Array.from(selectedEmployeeIds);
      const response = await api.post('/time-entries/bulk-clock-in', {
        userIds,
        projectId: selectedProjectId,
        latitude: 0,
        longitude: 0,
      });
      const results = (response as any).results || [];
      const successCount = results.filter((r: any) => r.success).length;
      Alert.alert(
        'Bulk Clock-In Complete',
        `${successCount} of ${userIds.length} employees clocked in successfully.`
      );
      // Refresh both lists
      await Promise.all([fetchActiveEmployees(), fetchBulkData()]);
      setSelectedEmployeeIds(new Set());
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Bulk clock-in failed');
    } finally {
      setBulkLoading(false);
    }
  };

  // ─── Bulk clock‑out ───
  const handleBulkClockOut = async () => {
    if (selectedEmployeeIds.size === 0) {
      Alert.alert('No employees selected', 'Please select at least one employee.');
      return;
    }
    setBulkLoading(true);
    try {
      const userIds = Array.from(selectedEmployeeIds);
      const response = await api.post('/time-entries/bulk-clock-out', {
        userIds,
        latitude: 0,
        longitude: 0,
      });
      const results = (response as any).results || [];
      const successCount = results.filter((r: any) => r.success).length;
      Alert.alert(
        'Bulk Clock-Out Complete',
        `${successCount} of ${userIds.length} employees clocked out successfully.`
      );
      await Promise.all([fetchActiveEmployees(), fetchBulkData()]);
      setSelectedEmployeeIds(new Set());
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Bulk clock-out failed');
    } finally {
      setBulkLoading(false);
    }
  };

  // ─── Individual force clock‑out ───
  const handleForceClockOut = async (userId: string, timeEntryId: string) => {
    Alert.alert(
      'Force Clock Out',
      'Are you sure you want to clock out this employee?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/crew/clock-out', { userId, timeEntryId });
              Alert.alert('✅ Clocked Out', 'Employee has been clocked out.');
              fetchActiveEmployees();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to clock out');
            }
          },
        },
      ]
    );
  };

  // ─── Render active employee card ───
  const renderActiveItem = ({ item }: { item: ActiveEmployee }) => {
    const formatClockInTime = (clockIn: string) => {
      try {
        const date = new Date(clockIn);
        return format(date, 'h:mm a') + ' (' + formatDistanceToNow(date, { addSuffix: true }) + ')';
      } catch {
        return clockIn;
      }
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: item.isMoving ? '#4CAF50' : '#FF9800' }]}>
            <Text style={styles.statusText}>{item.isMoving ? 'Moving' : 'Stationary'}</Text>
          </View>
        </View>
        <Text style={styles.project}>{item.projectName}</Text>
        <Text style={styles.clockIn}>Clocked in: {formatClockInTime(item.clockIn)}</Text>
        {item.latitude && item.longitude && (
          <Text style={styles.location}>📍 {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</Text>
        )}
        <TouchableOpacity
          style={styles.clockOutBtn}
          onPress={() => handleForceClockOut(item.userId, item.timeEntryId)}
        >
          <MaterialIcons name="logout" size={20} color="#FFF" />
          <Text style={styles.clockOutText}>Clock Out</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Render employee in bulk modal ───
  const renderBulkEmployee = ({ item }: { item: AllEmployee }) => {
    const isSelected = selectedEmployeeIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.bulkEmployeeItem, isSelected && styles.bulkEmployeeSelected]}
        onPress={() => toggleEmployeeSelection(item.id)}
      >
        <View style={styles.bulkEmployeeInfo}>
          <Text style={styles.bulkEmployeeName}>{item.first_name} {item.last_name}</Text>
          <View style={styles.bulkStatusContainer}>
            <View style={[styles.bulkStatusDot, { backgroundColor: item.is_clocked_in ? '#4CAF50' : '#888' }]} />
            <Text style={styles.bulkStatusText}>{item.is_clocked_in ? 'Clocked In' : 'Clocked Out'}</Text>
          </View>
        </View>
        {isSelected && <MaterialIcons name="check-circle" size={24} color="#00D4FF" />}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Crew Clock</Text>
          <Text style={styles.headerSubtitle}>
            {officeCity ? `📍 ${officeCity} • ` : ''}{activeEmployees.length} currently clocked in
          </Text>
        </View>
        <TouchableOpacity onPress={openBulkModal} style={styles.bulkBtn}>
          <MaterialIcons name="people" size={24} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeEmployees}
        renderItem={renderActiveItem}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchActiveEmployees();
            }}
            tintColor="#00D4FF"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="people-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>No one is currently clocked in</Text>
          </View>
        }
      />

      {/* ─── Bulk Actions Modal ─── */}
      <Modal visible={bulkModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bulk Actions</Text>
              <TouchableOpacity onPress={() => setBulkModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Project Selector */}
            <TouchableOpacity
              style={styles.modalProjectSelector}
              onPress={() => {
                // Simple toggle: show a dropdown of projects
                // For simplicity, we'll just cycle through projects or open another modal
                // Here we show a simple list; you can enhance with a picker
                Alert.alert(
                  'Select Project',
                  projects.map(p => p.name).join('\n'),
                  [
                    ...projects.map(p => ({
                      text: p.name,
                      onPress: () => setSelectedProjectId(p.id),
                    })),
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
            >
              <Text style={styles.modalProjectText}>
                {selectedProjectId
                  ? projects.find(p => p.id === selectedProjectId)?.name || 'Select Project'
                  : 'Select Project'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={24} color="#00D4FF" />
            </TouchableOpacity>

            {/* Employee List */}
            <FlatList
              data={allEmployees}
              keyExtractor={(item) => item.id}
              renderItem={renderBulkEmployee}
              contentContainerStyle={styles.bulkList}
              ListEmptyComponent={<Text style={styles.emptyText}>No employees found</Text>}
            />

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#4CAF50' }]}
                onPress={handleBulkClockIn}
                disabled={bulkLoading}
              >
                <Text style={styles.modalActionText}>Clock In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#FF6B6B' }]}
                onPress={handleBulkClockOut}
                disabled={bulkLoading}
              >
                <Text style={styles.modalActionText}>Clock Out</Text>
              </TouchableOpacity>
            </View>
            {bulkLoading && <ActivityIndicator color="#00D4FF" style={{ marginTop: 12 }} />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 4 },
  bulkBtn: { padding: 8 },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  project: { color: '#00D4FF', fontSize: 14, marginBottom: 4 },
  clockIn: { color: '#AAA', fontSize: 13, marginBottom: 4 },
  location: { color: '#888', fontSize: 12, marginBottom: 12 },
  clockOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  clockOutText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12 },

  // ─── Modal styles ───
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  modalProjectSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalProjectText: { color: '#FFF', fontSize: 16 },
  bulkList: { paddingBottom: 16 },
  bulkEmployeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    marginBottom: 8,
  },
  bulkEmployeeSelected: { borderWidth: 2, borderColor: '#00D4FF' },
  bulkEmployeeInfo: { flex: 1 },
  bulkEmployeeName: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  bulkStatusContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  bulkStatusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  bulkStatusText: { color: '#AAA', fontSize: 13 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalActionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalActionText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});