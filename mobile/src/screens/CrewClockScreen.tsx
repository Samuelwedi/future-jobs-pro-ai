import { useLang } from '../context/LanguageContext';
import { AdaptiveModal as Modal } from '../components/AdaptiveModal';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  RefreshControl,

  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import * as Location from 'expo-location';
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
  is_clocked_in: boolean | null;
}

interface Project {
  id: string;
  name: string;
}

export default function CrewClockScreen() {
 const { t, lang } = useLang();
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
  const [bulkDataLoading, setBulkDataLoading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const mutationLock = useRef(false);
  const canManage = ['boss', 'manager'].includes(String(user?.role).toLowerCase());
  const currentCoordinates = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') throw new Error(t("Location permission is required for bulk clock actions."));
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  };

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
      Alert.alert(t("Error"), t("Could not load active employees"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ─── Fetch all employees & projects for bulk modal ───
  const fetchBulkData = async () => {
    setBulkDataLoading(true);
    setBulkError('');
    setAllEmployees([]); setProjects([]);
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
            return { ...emp, is_clocked_in: null };
          }
        })
      );
      setAllEmployees(withStatus);
      setProjects(projectsRes.projects || []);
    } catch (error) {
      console.error('Failed to fetch bulk data:', error);
      setBulkError(t("Could not load employees and projects. Close and reopen to retry."));
    } finally {
      setBulkDataLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanyCity();
    fetchActiveEmployees();
  }, []);

  // ─── Open bulk modal ───
  const openBulkModal = () => {
    if (!canManage || mutationLock.current) return;
    setProjectPickerOpen(false);
    fetchBulkData();
    setSelectedEmployeeIds(new Set());
    setSelectedProjectId('');
    setBulkModalVisible(true);
  };

  // ─── Toggle employee selection ───
  const toggleEmployeeSelection = (id: string) => {
    if (mutationLock.current || bulkDataLoading) return;
    const newSet = new Set(selectedEmployeeIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedEmployeeIds(newSet);
  };

  // ─── Bulk clock‑in ───
  const handleBulkClockIn = async () => {
    if (!canManage || mutationLock.current || bulkDataLoading || bulkError) return;
    if (Array.from(selectedEmployeeIds).some(id => allEmployees.find(employee => employee.id === id)?.is_clocked_in == null)) {
      Alert.alert(t("Status unavailable"), t("Reopen the employee list to refresh status before retrying.")); return;
    }
    if (selectedEmployeeIds.size === 0) {
      Alert.alert(t("No employees selected"), t("Please select at least one employee."));
      return;
    }
    if (!selectedProjectId) {
      Alert.alert(t("No project selected"), t("Please select a project."));
      return;
    }
    mutationLock.current = true; setBulkLoading(true);
    try {
      const coordinates = await currentCoordinates();
      const userIds = Array.from(selectedEmployeeIds);
      const response = await api.post('/time-entries/bulk-clock-in', {
        userIds,
        projectId: selectedProjectId,
        ...coordinates,
      });
      const results = (response as any).results || [];
      const successIds = new Set<string>(results.filter((r: any) => r.success === true && userIds.includes(r.userId)).map((r: any) => r.userId));
      const successCount = successIds.size;
      const remaining = userIds.filter(id => !successIds.has(id));
      const details = remaining.map(id => {
        const employee = allEmployees.find(item => item.id === id);
        const result = results.find((item: any) => item.userId === id);
        return `${employee ? `${employee.first_name} ${employee.last_name}` : id}: ${result?.message || t("No confirmed result. Refresh status before retrying.")}`;
      }).join('\n');
      Alert.alert(
        t("Bulk Clock-In Complete"),
        t('{count} of {total} employees clocked in successfully.', {count:String(successCount),total:String(userIds.length)}) + (details ? `\n\n${details}` : '')
      );
      // Refresh both lists
      await Promise.all([fetchActiveEmployees(), fetchBulkData()]);
      setSelectedEmployeeIds(new Set(remaining));
    } catch (error: any) {
      Alert.alert(t("Error"), error.response?.data?.message || (!error.isAxiosError && error.message) || t("Clock-in was not confirmed. Refresh crew status before retrying."));
    } finally {
      mutationLock.current = false; setBulkLoading(false);
    }
  };

  // ─── Bulk clock‑out ───
  const handleBulkClockOut = async () => {
    if (!canManage || mutationLock.current || bulkDataLoading || bulkError) return;
    if (Array.from(selectedEmployeeIds).some(id => allEmployees.find(employee => employee.id === id)?.is_clocked_in == null)) {
      Alert.alert(t("Status unavailable"), t("Reopen the employee list to refresh status before retrying.")); return;
    }
    if (selectedEmployeeIds.size === 0) {
      Alert.alert(t("No employees selected"), t("Please select at least one employee."));
      return;
    }
    mutationLock.current = true; setBulkLoading(true);
    try {
      const coordinates = await currentCoordinates();
      const userIds = Array.from(selectedEmployeeIds);
      const response = await api.post('/time-entries/bulk-clock-out', {
        userIds,
        ...coordinates,
      });
      const results = (response as any).results || [];
      const successIds = new Set<string>(results.filter((r: any) => r.success === true && userIds.includes(r.userId)).map((r: any) => r.userId));
      const successCount = successIds.size;
      const remaining = userIds.filter(id => !successIds.has(id));
      const details = remaining.map(id => {
        const employee = allEmployees.find(item => item.id === id);
        const result = results.find((item: any) => item.userId === id);
        return `${employee ? `${employee.first_name} ${employee.last_name}` : id}: ${result?.message || t("No confirmed result. Refresh status before retrying.")}`;
      }).join('\n');
      Alert.alert(
        t("Bulk Clock-Out Complete"),
        t('{count} of {total} employees clocked out successfully.', {count:String(successCount),total:String(userIds.length)}) + (details ? `\n\n${details}` : '')
      );
      await Promise.all([fetchActiveEmployees(), fetchBulkData()]);
      setSelectedEmployeeIds(new Set(remaining));
    } catch (error: any) {
      Alert.alert(t("Error"), error.response?.data?.message || (!error.isAxiosError && error.message) || t("Clock-out was not confirmed. Refresh crew status before retrying."));
    } finally {
      mutationLock.current = false; setBulkLoading(false);
    }
  };

  // ─── Individual force clock‑out ───
  const handleForceClockOut = async (userId: string, timeEntryId: string) => {
    if (!canManage || mutationLock.current) return;
    Alert.alert(
      t("Force Clock Out"),
      t("Are you sure you want to clock out this employee?"),
      [
        { text: t("Cancel"), style: 'cancel' },
        {
          text: t("Clock Out"),
          style: 'destructive',
          onPress: async () => {
            if (mutationLock.current) return;
            mutationLock.current = true; setBulkLoading(true);
            try {
              await api.post('/crew/clock-out', { userId, timeEntryId });
              Alert.alert(t("✅ Clocked Out"), t("Employee has been clocked out."));
              await fetchActiveEmployees();
            } catch (e: any) {
              Alert.alert(t("Error"), e.message || t("Failed to clock out"));
            } finally { mutationLock.current = false; setBulkLoading(false); }
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
            <Text style={styles.statusText}>{item.isMoving ? t("Moving") : t('Stationary')}</Text>
          </View>
        </View>
        <Text style={styles.project}>{item.projectName}</Text>
        <Text style={styles.clockIn}>{t("Clocked in:")} {formatClockInTime(item.clockIn)}</Text>
        {item.latitude != null && item.longitude != null && (
          <Text style={styles.location}>📍 {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</Text>
        )}
        {canManage && <TouchableOpacity disabled={bulkLoading}
          style={styles.clockOutBtn}
          onPress={() => handleForceClockOut(item.userId, item.timeEntryId)}
        >
          <MaterialIcons name="logout" size={20} color="#FFF" />
          <Text style={styles.clockOutText}>{t("Clock Out")}</Text>
        </TouchableOpacity>}
      </View>
    );
  };

  // ─── Render employee in bulk modal ───
  const renderBulkEmployee = ({ item }: { item: AllEmployee }) => {
    const isSelected = selectedEmployeeIds.has(item.id);
    return (
      <TouchableOpacity
        disabled={bulkLoading || bulkDataLoading || item.is_clocked_in === null}
        style={[styles.bulkEmployeeItem, isSelected && styles.bulkEmployeeSelected]}
        onPress={() => toggleEmployeeSelection(item.id)}
      >
        <View style={styles.bulkEmployeeInfo}>
          <Text style={styles.bulkEmployeeName}>{item.first_name} {item.last_name}</Text>
          <View style={styles.bulkStatusContainer}>
            <View style={[styles.bulkStatusDot, { backgroundColor: item.is_clocked_in ? '#4CAF50' : '#888' }]} />
            <Text style={styles.bulkStatusText}>{item.is_clocked_in === null ? t("Status unavailable — reopen to retry") : item.is_clocked_in ? t("Clocked In") : t("Clocked Out")}</Text>
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
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{t("Crew Clock")}</Text>
          <Text style={styles.headerSubtitle}>
            {officeCity ? `📍 ${officeCity} • ` : ''}{t('{count} employees currently clocked in', {count:String(activeEmployees.length)})}</Text>
        </View>
        <TouchableOpacity disabled={!canManage || bulkLoading} onPress={openBulkModal} style={styles.bulkBtn}>
          <MaterialIcons name="people" size={24} color="#00D4FF" />
          <Text style={styles.bulkBtnText}>{t("Bulk clock")}</Text>
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
            onRefresh={async () => {
              setRefreshing(true);
              await fetchActiveEmployees();
            }}
            tintColor="#00D4FF"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="people-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>{t("No one is currently clocked in")}</Text>
          </View>
        }
      />

      {/* ─── Bulk Actions Modal ─── */}
      <Modal visible={bulkModalVisible} onRequestClose={() => !mutationLock.current && setBulkModalVisible(false)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("Bulk Actions")}</Text>
              <TouchableOpacity disabled={bulkLoading} onPress={() => setBulkModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Project Selector */}
            <TouchableOpacity
              style={styles.modalProjectSelector}
              disabled={bulkLoading || bulkDataLoading || !!bulkError}
              onPress={() => setProjectPickerOpen(value => !value)}
            >
              <Text style={styles.modalProjectText}>
                {selectedProjectId
                  ? projects.find(p => p.id === selectedProjectId)?.name || 'Select Project'
                  : 'Select Project'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={24} color="#00D4FF" />
            </TouchableOpacity>

            {projectPickerOpen && <ScrollView style={{maxHeight:160}} nestedScrollEnabled>
              {projects.map(project => <TouchableOpacity key={project.id} disabled={bulkLoading} accessibilityRole="button" accessibilityState={{selected: selectedProjectId === project.id}} onPress={() => {setSelectedProjectId(project.id);setProjectPickerOpen(false);}} style={{padding:14}}><Text style={styles.modalProjectText}>{project.name}</Text></TouchableOpacity>)}
              {!projects.length && <Text style={styles.emptyText}>{t("No projects available")}</Text>}
            </ScrollView>}
            <Text style={styles.bulkStatusText}>{t("Bulk actions use this device’s current location. Confirm that selected employees are with you at the work site.")}</Text>
            {bulkError ? <Text accessibilityRole="alert" style={{color:'#FDA4AF',padding:12}}>{bulkError}</Text> : null}
            {/* Employee List */}
            <View style={styles.selectionRow}>
              <Text style={styles.selectionCount}>{t('{count} selected', {count:String(selectedEmployeeIds.size)})}</Text>
              <TouchableOpacity disabled={bulkLoading || bulkDataLoading || !!bulkError} onPress={() => setSelectedEmployeeIds(new Set(allEmployees.filter(employee => employee.is_clocked_in !== null).map(employee => employee.id)))}><Text style={styles.selectionLink}>{t("Select all")}</Text></TouchableOpacity>
              <TouchableOpacity disabled={bulkLoading || bulkDataLoading || !!bulkError} onPress={() => setSelectedEmployeeIds(new Set())}><Text style={styles.selectionLink}>{t("Clear")}</Text></TouchableOpacity>
            </View>
            {bulkDataLoading && <ActivityIndicator color="#00D4FF" style={{ marginVertical: 20 }} />}
            <FlatList
              data={allEmployees}
              keyExtractor={(item) => item.id}
              renderItem={renderBulkEmployee}
              contentContainerStyle={styles.bulkList}
              ListEmptyComponent={<Text style={styles.emptyText}>{t("No employees found")}</Text>}
            />

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#4CAF50' }]}
                onPress={handleBulkClockIn}
                disabled={bulkLoading || bulkDataLoading || !!bulkError || !selectedEmployeeIds.size}
              >
                <Text style={styles.modalActionText}>{t("Clock In")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#FF6B6B' }]}
                onPress={handleBulkClockOut}
                disabled={bulkLoading || bulkDataLoading || !!bulkError || !selectedEmployeeIds.size}
              >
                <Text style={styles.modalActionText}>{t("Clock Out")}</Text>
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
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 4 },
  bulkBtn: { paddingVertical: 8, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#15546A', borderRadius: 18 },
  bulkBtnText: { color: '#D9F8FF', fontWeight: '800', fontSize: 12 },
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
  selectionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  selectionCount: { flex: 1, color: '#AABBC6', fontWeight: '700' },
  selectionLink: { color: '#00D4FF', fontWeight: '800' },
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
