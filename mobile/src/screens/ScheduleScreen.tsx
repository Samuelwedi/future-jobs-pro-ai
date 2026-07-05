import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity, Modal, Linking, ScrollView, TextInput, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, subMonths, addMonths, isSameMonth, isSameDay,
} from 'date-fns';

interface Shift {
  id: string;
  name: string;
  project_name: string;
  project_address?: string;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string;
  attachment_url?: string;
  attachment_type?: string;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
  address?: string;
}

export default function ScheduleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week' | '3days' | 'day'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(user?.id || '');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('My Schedule');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  // ---- New shift creation states ----
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('17:00');
  const [newShiftNotes, setNewShiftNotes] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // ---- SEARCHABLE project states ----
  const [projectSearchText, setProjectSearchText] = useState('');
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // ---- EMPLOYEE selection for shift creation ----
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  // ---- File attachment states ----
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // ---- Listen for selected employees returned from the SelectEmployees screen ----
  useEffect(() => {
    if (route.params?.selectedEmployeeIds) {
      setSelectedEmployeeIds(route.params.selectedEmployeeIds);
      // Clear the param so we don't reapply on re-render
      navigation.setParams({ selectedEmployeeIds: undefined });
    }
  }, [route.params?.selectedEmployeeIds]);

  // Filter projects when search text changes
  useEffect(() => {
    if (projectSearchText.trim().length > 0) {
      const filtered = projects.filter(p =>
        p.name.toLowerCase().includes(projectSearchText.toLowerCase())
      );
      setFilteredProjects(filtered);
      setShowProjectDropdown(true);
    } else {
      setFilteredProjects(projects);
      setShowProjectDropdown(false);
    }
  }, [projectSearchText, projects]);

  useFocusEffect(useCallback(() => {
    console.log('Current user role:', user?.role);
    if (user?.role === 'boss' || user?.role === 'manager') {
      fetchEmployees();
      fetchProjects();
    } else {
      console.log('Not boss/manager – employees not fetched on focus');
    }
  }, []));

  useEffect(() => {
    fetchShifts();
  }, [selectedDate, viewMode, selectedEmployeeId, currentMonth]);

  // ---- FETCH EMPLOYEES (for the view switcher) ----
  const fetchEmployees = async () => {
    try {
      const companyId = user?.companyId;
      if (!companyId) return;
      const response = await api.get<{ members?: any[]; users?: any[] }>(`/team/members/${companyId}`);
      const members = response.members || response.users || [];
      setEmployees(members as Employee[]);
    } catch (e) {
      console.error('Failed to fetch employees', e);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await api.get<{ success: boolean; projects: Project[] }>('/projects');
      setProjects(response.projects || []);
    } catch (e) { console.error(e); }
  };

  const fetchShifts = async () => {
    let start: string, end: string;
    const d = selectedDate;

    switch (viewMode) {
      case 'month':
        start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
        end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
        break;
      case 'week':
        start = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        end = format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        break;
      case '3days':
        start = format(d, 'yyyy-MM-dd');
        end = format(addDays(d, 2), 'yyyy-MM-dd');
        break;
      default: // day
        start = format(d, 'yyyy-MM-dd');
        end = start;
    }

    try {
      const userId = selectedEmployeeId || user?.id;
      const res = await api.get<{ success: boolean; shifts: Shift[] }>(
        `/schedule/my-shifts?userId=${userId}&start=${start}&end=${end}`
      );
      setShifts(res.shifts || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); fetchShifts(); };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    calendarDays.push(d);
    d = addDays(d, 1);
  }

  const shiftDates = new Set(shifts.map(s => s.date));
  const shiftsForSelectedDate = shifts.filter(s => s.date === format(selectedDate, 'yyyy-MM-dd'));

  const handleOpenDirections = (address?: string) => {
    if (!address) return;
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  const navigateMonth = (dir: number) => {
    setCurrentMonth(prev => dir === -1 ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  // ---- Pick file for attachment ----
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/msword', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/octet-stream',
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  // ---- Create Shift ----
  const handleCreateShift = async () => {
    if (!newShiftName.trim()) {
      Alert.alert('Required', 'Please enter a shift name.');
      return;
    }
    if (selectedEmployeeIds.length === 0) {
      Alert.alert('Required', 'Please select at least one employee.');
      return;
    }
    setUploadingFile(true);
    try {
      let attachmentUrl: string | null = null;
      let attachmentType: string | null = null;
      if (selectedFile) {
        try {
          const formData = new FormData();
          formData.append('file', {
            uri: selectedFile.uri,
            name: selectedFile.name,
            type: selectedFile.type,
          } as any);
          formData.append('purpose', 'shift_attachment');
          const uploadRes = await api.uploadFileWithData<{ url: string; type: string }>(
            '/upload',
            selectedFile.uri,
            { purpose: 'shift_attachment' },
            'file'
          );
          attachmentUrl = uploadRes.url;
          attachmentType = uploadRes.type || selectedFile.type;
        } catch (err) {
          console.error('File upload failed:', err);
          Alert.alert('Warning', 'Could not upload file, continuing without attachment.');
        }
      }

      await api.post('/schedule/shifts', {
        name: newShiftName,
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: newShiftStart,
        endTime: newShiftEnd,
        notes: newShiftNotes,
        projectId: selectedProjectId,
        employeeIds: selectedEmployeeIds,
        attachmentUrl,
        attachmentType,
      });
      Alert.alert('✅ Created', 'Shift has been added.');
      setCreateModalVisible(false);
      setNewShiftName('');
      setNewShiftStart('09:00');
      setNewShiftEnd('17:00');
      setNewShiftNotes('');
      setSelectedProjectId('');
      setSelectedEmployeeIds([]);
      setSelectedFile(null);
      setProjectSearchText('');
      setFilteredProjects([]);
      setShowProjectDropdown(false);
      fetchShifts();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not create shift.');
    } finally {
      setUploadingFile(false);
    }
  };

  const openCreateModal = () => {
    setNewShiftName('');
    setNewShiftStart('09:00');
    setNewShiftEnd('17:00');
    setNewShiftNotes('');
    setSelectedProjectId('');
    setSelectedEmployeeIds([]);
    setSelectedFile(null);
    setProjectSearchText('');
    setFilteredProjects([]);
    setShowProjectDropdown(false);
    setCreateModalVisible(true);
  };

  // ---- Navigate to employee selection screen ----
  const openEmployeePicker = () => {
    navigation.navigate('SelectEmployees', { selectedIds: selectedEmployeeIds });
  };

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <TouchableOpacity onPress={() => setShowEmployeePicker(true)}>
            <Text style={styles.headerTitle}>{selectedEmployeeName}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={openCreateModal} style={{ padding: 4 }}>
          <MaterialIcons name="add" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      {/* View Mode Toggles */}
      <View style={styles.viewModes}>
        {(['month', 'week', '3days', 'day'] as Array<typeof viewMode>).map(m => (
          <TouchableOpacity key={m} onPress={() => setViewMode(m)} style={[styles.viewModeBtn, viewMode === m && styles.viewModeBtnActive]}>
            <Text style={[styles.viewModeText, viewMode === m && styles.viewModeTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Month Navigator */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => navigateMonth(-1)}>
          <MaterialIcons name="chevron-left" size={28} color="#00D4FF" />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{format(currentMonth, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={() => navigateMonth(1)}>
          <MaterialIcons name="chevron-right" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      {/* Day Headers */}
      <View style={styles.dayHeaders}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <Text key={day} style={styles.dayHeaderText}>{day}</Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((day, idx) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const hasShift = shiftDates.has(dateStr);

          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.dayCell,
                !isCurrentMonth && styles.dayOtherMonth,
                isSelected && styles.daySelected,
                isToday && styles.dayToday,
              ]}
              onPress={() => setSelectedDate(day)}
            >
              <Text style={[
                styles.dayText,
                !isCurrentMonth && styles.dayTextOtherMonth,
                isSelected && styles.dayTextSelected,
              ]}>
                {format(day, 'd')}
              </Text>
              {hasShift && <View style={styles.dot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Shift List for Selected Date */}
      <FlatList
        data={shiftsForSelectedDate}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.shiftCard} onPress={() => setSelectedShift(item)}>
            <Text style={styles.shiftDate}>{format(parseISO(item.date), 'EEE, MMM d')}</Text>
            <Text style={styles.shiftName}>{item.name}</Text>
            <Text style={styles.shiftProject}>{item.project_name}</Text>
            <Text style={styles.shiftTime}>{item.start_time} → {item.end_time}</Text>
            {item.attachment_url && (
              <View style={styles.attachmentBadge}>
                <MaterialIcons name="attach-file" size={14} color="#00D4FF" />
                <Text style={styles.attachmentBadgeText}>Attachment</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={<Text style={styles.empty}>No shifts on this day</Text>}
      />

      {/* ===== CREATE SHIFT MODAL ===== */}
      <Modal visible={createModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Shift for {format(selectedDate, 'MMM d, yyyy')}</Text>
                <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                  <MaterialIcons name="close" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Shift Name"
                placeholderTextColor="#888"
                value={newShiftName}
                onChangeText={setNewShiftName}
              />
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Start (HH:MM)"
                  placeholderTextColor="#888"
                  value={newShiftStart}
                  onChangeText={setNewShiftStart}
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginLeft: 8 }]}
                  placeholder="End (HH:MM)"
                  placeholderTextColor="#888"
                  value={newShiftEnd}
                  onChangeText={setNewShiftEnd}
                />
              </View>

              {/* ---- SEARCHABLE PROJECT PICKER ---- */}
              <View style={styles.projectSearchContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Search project..."
                  placeholderTextColor="#888"
                  value={projectSearchText}
                  onChangeText={setProjectSearchText}
                  onFocus={() => setShowProjectDropdown(true)}
                />
                {showProjectDropdown && filteredProjects.length > 0 && (
                  <View style={styles.projectDropdown}>
                    {filteredProjects.map(proj => (
                      <TouchableOpacity
                        key={proj.id}
                        style={[
                          styles.projectItem,
                          selectedProjectId === proj.id && styles.projectItemActive
                        ]}
                        onPress={() => {
                          setSelectedProjectId(proj.id);
                          setProjectSearchText(proj.name);
                          setShowProjectDropdown(false);
                        }}
                      >
                        <Text style={[styles.projectItemText, selectedProjectId === proj.id && styles.projectItemTextActive]}>
                          {proj.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {showProjectDropdown && projectSearchText.length > 0 && filteredProjects.length === 0 && (
                  <View style={styles.projectDropdown}>
                    <Text style={styles.noProjectsText}>No projects found</Text>
                  </View>
                )}
              </View>

              {/* Employee Selection Button - Navigates to new screen */}
              <TouchableOpacity
                style={styles.employeeSelectBtn}
                onPress={openEmployeePicker}
              >
                <MaterialIcons name="people" size={20} color="#00D4FF" />
                <Text style={styles.employeeSelectText}>
                  {selectedEmployeeIds.length === 0
                    ? 'Select Employees'
                    : `${selectedEmployeeIds.length} employee${selectedEmployeeIds.length > 1 ? 's' : ''} selected`}
                </Text>
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                placeholder="Notes (optional)"
                placeholderTextColor="#888"
                value={newShiftNotes}
                onChangeText={setNewShiftNotes}
              />

              {/* ---- FILE ATTACHMENT SECTION ---- */}
              <View style={styles.attachmentSection}>
                <TouchableOpacity style={styles.attachBtn} onPress={pickFile}>
                  <MaterialIcons name="attach-file" size={20} color="#00D4FF" />
                  <Text style={styles.attachBtnText}>
                    {selectedFile ? `Attached: ${selectedFile.name}` : 'Attach file (PDF, Word, Excel)'}
                  </Text>
                </TouchableOpacity>
                {selectedFile && (
                  <TouchableOpacity onPress={() => setSelectedFile(null)} style={styles.removeAttach}>
                    <MaterialIcons name="close" size={18} color="#F44336" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => setCreateModalVisible(false)}>
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.createBtn]}
                  onPress={handleCreateShift}
                  disabled={uploadingFile}
                >
                  <Text style={[styles.btnText, { color: '#0A0A0A' }]}>
                    {uploadingFile ? 'Uploading...' : 'Create'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== SHIFT DETAIL MODAL ===== */}
      <Modal visible={!!selectedShift} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Shift Details</Text>
              <TouchableOpacity onPress={() => setSelectedShift(null)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            {selectedShift && (
              <ScrollView>
                <Text style={styles.detailLabel}>Shift</Text>
                <Text style={styles.detailValue}>{selectedShift.name}</Text>
                <Text style={styles.detailLabel}>Project</Text>
                <Text style={styles.detailValue}>{selectedShift.project_name}</Text>
                {selectedShift.project_address && (
                  <>
                    <Text style={styles.detailLabel}>Address</Text>
                    <Text style={styles.detailValue}>{selectedShift.project_address}</Text>
                  </>
                )}
                <Text style={styles.detailLabel}>Time</Text>
                <Text style={styles.detailValue}>{selectedShift.start_time} → {selectedShift.end_time}</Text>
                {selectedShift.notes && (
                  <>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.detailValue}>{selectedShift.notes}</Text>
                  </>
                )}
                {selectedShift.attachment_url && (
                  <>
                    <Text style={styles.detailLabel}>Attachment</Text>
                    <TouchableOpacity
                      style={styles.downloadBtn}
                      onPress={() => Linking.openURL(selectedShift.attachment_url!)}
                    >
                      <MaterialIcons name="download" size={20} color="#00D4FF" />
                      <Text style={styles.downloadBtnText}>Open Attachment</Text>
                    </TouchableOpacity>
                  </>
                )}
                {selectedShift.project_address && (
                  <TouchableOpacity style={styles.directionsBtn} onPress={() => handleOpenDirections(selectedShift.project_address)}>
                    <MaterialIcons name="directions" size={20} color="#0A0A0A" />
                    <Text style={styles.directionsBtnText}>Get Directions</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ===== EMPLOYEE PICKER (view switcher – remains unchanged) ===== */}
      <Modal visible={showEmployeePicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Employee</Text>
              <TouchableOpacity onPress={() => setShowEmployeePicker(false)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.employeeRow, selectedEmployeeId === user?.id && styles.employeeRowActive]}
              onPress={() => {
                setSelectedEmployeeId(user?.id || '');
                setSelectedEmployeeName('My Schedule');
                setShowEmployeePicker(false);
              }}
            >
              <Text style={styles.employeeName}>Me ({(user?.firstName || '') + ' ' + (user?.lastName || '')})</Text>
            </TouchableOpacity>
            {employees.map(emp => (
              <TouchableOpacity
                key={emp.id}
                style={[styles.employeeRow, selectedEmployeeId === emp.id && styles.employeeRowActive]}
                onPress={() => {
                  setSelectedEmployeeId(emp.id);
                  setSelectedEmployeeName(`${emp.first_name} ${emp.last_name}`);
                  setShowEmployeePicker(false);
                }}
              >
                <Text style={styles.employeeName}>{emp.first_name} {emp.last_name}</Text>
                <Text style={styles.employeeRole}>{emp.role}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---- STYLES (unchanged) ----
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  viewModes: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 8 },
  viewModeBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
  viewModeBtnActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  viewModeText: { color: '#888', fontSize: 13 },
  viewModeTextActive: { color: '#0A0A0A', fontWeight: '600' },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  monthTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  dayHeaders: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#333' },
  dayHeaderText: { color: '#888', fontSize: 13, fontWeight: '600', width: 40, textAlign: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', paddingHorizontal: 10 },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  dayOtherMonth: { opacity: 0.3 },
  daySelected: { backgroundColor: '#00D4FF' },
  dayToday: { borderWidth: 1, borderColor: '#FF9800' },
  dayText: { color: '#FFF', fontSize: 14 },
  dayTextOtherMonth: { color: '#666' },
  dayTextSelected: { color: '#0A0A0A', fontWeight: 'bold' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#00D4FF', marginTop: 2 },
  list: { padding: 16, paddingBottom: 40 },
  shiftCard: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  shiftDate: { color: '#00D4FF', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  shiftName: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  shiftProject: { color: '#AAA', fontSize: 14, marginTop: 4 },
  shiftTime: { color: '#888', fontSize: 14, marginTop: 4 },
  attachmentBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  attachmentBadgeText: { color: '#00D4FF', fontSize: 12 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  input: { backgroundColor: '#0A0A0A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, color: '#FFF', fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  row: { flexDirection: 'row' },
  projectSearchContainer: { marginBottom: 12 },
  projectDropdown: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: 150,
    marginTop: -8,
    paddingVertical: 4,
  },
  projectItem: { paddingVertical: 10, paddingHorizontal: 14 },
  projectItemActive: { backgroundColor: '#00D4FF20' },
  projectItemText: { color: '#FFF', fontSize: 14 },
  projectItemTextActive: { color: '#00D4FF', fontWeight: '600' },
  noProjectsText: { color: '#888', padding: 12, textAlign: 'center' },
  employeeSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  employeeSelectText: { color: '#00D4FF', marginLeft: 8, fontSize: 14, flex: 1 },
  attachmentSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  attachBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
    gap: 8,
  },
  attachBtnText: { color: '#AAA', fontSize: 14, flex: 1 },
  removeAttach: { padding: 8 },
  employeeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
  employeeRowActive: { backgroundColor: '#1A3A4A' },
  employeeName: { color: '#FFF', fontSize: 16 },
  employeeRole: { color: '#888', fontSize: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  btn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, marginLeft: 10 },
  cancelBtn: { backgroundColor: '#333' },
  createBtn: { backgroundColor: '#00D4FF' },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  detailLabel: { color: '#888', fontSize: 13, marginTop: 12 },
  detailValue: { color: '#FFF', fontSize: 16, marginTop: 2 },
  directionsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00D4FF', paddingVertical: 12, borderRadius: 10, marginTop: 20, gap: 8 },
  directionsBtnText: { color: '#0A0A0A', fontWeight: '600', fontSize: 15 },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  downloadBtnText: { color: '#00D4FF', fontSize: 15 },
});