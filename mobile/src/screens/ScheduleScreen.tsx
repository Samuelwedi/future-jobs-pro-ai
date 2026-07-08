import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity, Modal, Linking, ScrollView, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, subMonths, addMonths, isSameMonth, isSameDay,
} from 'date-fns';

interface Shift {
  id: string;
  name: string;
  project_name: string;
  project_address?: string;
  project_id: string;
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

interface TeamMembersResponse {
  success: boolean;
  members: Employee[];
}

export default function ScheduleScreen() {
  const navigation = useNavigation<any>();
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

  const fetchEmployees = async () => {
    try {
      const companyId = user?.companyId;
      if (!companyId) return;
      const res = await api.get<TeamMembersResponse>(`/team/members/${companyId}`);
      const members = res.members || [];
      setEmployees(members);
    } catch (e) {
      console.error('Failed to fetch employees', e);
    }
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
      default:
        start = format(d, 'yyyy-MM-dd');
        end = start;
    }

    try {
      const userId = selectedEmployeeId || user?.id;
      const res: any = await api.get(
        `/schedule/my-shifts?userId=${userId}&start=${start}&end=${end}`
      );
      let fetchedShifts: Shift[] = [];
      if (res && typeof res === 'object') {
        const data = res.data || res;
        if (data && typeof data === 'object' && 'shifts' in data) {
          fetchedShifts = data.shifts || [];
        }
      }
      setShifts(fetchedShifts);
      console.log(`📊 Fetched ${fetchedShifts.length} shifts`);
    } catch (e) {
      console.error('Error fetching shifts:', e);
      Alert.alert('Error', 'Could not load shifts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => {
    if (user?.role === 'boss' || user?.role === 'manager') {
      fetchEmployees();
    }
    fetchShifts();
  }, [selectedDate, viewMode, selectedEmployeeId, currentMonth]));

  const onRefresh = () => { setRefreshing(true); fetchShifts(); };

  // Calendar helpers
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

  // UTC helpers
  const getUTCDateString = (date: Date) => {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  };

  const getShiftDateString = (iso: string) => iso.split('T')[0];

  const formatShiftDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[+parts[1] - 1];
    const day = +parts[2];
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2])).getUTCDay()];
    return `${weekday}, ${month} ${day}`;
  };

  const shiftDates = new Set(shifts.map(s => s.date ? getShiftDateString(s.date) : ''));

  const selectedDateStr = getUTCDateString(selectedDate);
  const shiftsForSelectedDate = shifts.filter(s => {
    if (!s.date) return false;
    return getShiftDateString(s.date) === selectedDateStr;
  });

  const handleOpenDirections = (address?: string) => {
    if (!address) return;
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  const navigateMonth = (dir: number) => {
    setCurrentMonth(prev => dir === -1 ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const openCreateShift = () => {
    navigation.navigate('CreateShift', { date: selectedDate.toISOString() });
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
        <View style={{ flex: 1, marginLeft: 16 }}>
          <TouchableOpacity onPress={() => setShowEmployeePicker(true)}>
            <Text style={styles.headerTitle}>{selectedEmployeeName}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={openCreateShift} style={{ padding: 4 }}>
          <MaterialIcons name="add" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      <View style={styles.viewModes}>
        {(['month', 'week', '3days', 'day'] as Array<typeof viewMode>).map(m => (
          <TouchableOpacity
            key={m}
            onPress={() => setViewMode(m)}
            style={[styles.viewModeBtn, viewMode === m && styles.viewModeBtnActive]}
          >
            <Text style={[styles.viewModeText, viewMode === m && styles.viewModeTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => navigateMonth(-1)}>
          <MaterialIcons name="chevron-left" size={28} color="#00D4FF" />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{format(currentMonth, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={() => navigateMonth(1)}>
          <MaterialIcons name="chevron-right" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      <View style={styles.dayHeaders}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <Text key={day} style={styles.dayHeaderText}>{day}</Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarDays.map((day, idx) => {
          const dateStr = getUTCDateString(day);
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

      <FlatList
        data={shiftsForSelectedDate}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.shiftCard} onPress={() => setSelectedShift(item)}>
            <Text style={styles.shiftDate}>{item.date ? formatShiftDate(item.date) : ''}</Text>
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

      {/* Shift Detail Modal */}
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

                {/* ─── CLOCK‑IN BUTTON REPLACED WITH HOME NAVIGATION ─── */}
                <TouchableOpacity
                  style={styles.goHomeBtn}
                  onPress={() => {
                    setSelectedShift(null);
                    navigation.navigate('Home');
                  }}
                >
                  <MaterialIcons name="home" size={20} color="#0A0A0A" />
                  <Text style={styles.goHomeBtnText}>Go to Home to Clock In</Text>
                </TouchableOpacity>

                {selectedShift.project_address && (
                  <TouchableOpacity
                    style={styles.directionsBtn}
                    onPress={() => handleOpenDirections(selectedShift.project_address)}
                  >
                    <MaterialIcons name="directions" size={20} color="#0A0A0A" />
                    <Text style={styles.directionsBtnText}>Get Directions</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Employee Picker Modal */}
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

const styles = StyleSheet.create({
  // ... all existing styles remain exactly the same ...
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
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  viewModes: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  viewModeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  viewModeBtnActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  viewModeText: { color: '#888', fontSize: 13 },
  viewModeTextActive: { color: '#0A0A0A', fontWeight: '600' },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  monthTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  dayHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  dayHeaderText: { color: '#888', fontSize: 13, fontWeight: '600', width: 40, textAlign: 'center' },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  dayOtherMonth: { opacity: 0.3 },
  daySelected: { backgroundColor: '#00D4FF' },
  dayToday: { borderWidth: 1, borderColor: '#FF9800' },
  dayText: { color: '#FFF', fontSize: 14 },
  dayTextOtherMonth: { color: '#666' },
  dayTextSelected: { color: '#0A0A0A', fontWeight: 'bold' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#00D4FF', marginTop: 2 },
  list: { padding: 16, paddingBottom: 40 },
  shiftCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  shiftDate: { color: '#00D4FF', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  shiftName: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  shiftProject: { color: '#AAA', fontSize: 14, marginTop: 4 },
  shiftTime: { color: '#888', fontSize: 14, marginTop: 4 },
  attachmentBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  attachmentBadgeText: { color: '#00D4FF', fontSize: 12 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  employeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  employeeRowActive: { backgroundColor: '#1A3A4A' },
  employeeName: { color: '#FFF', fontSize: 16 },
  employeeRole: { color: '#888', fontSize: 13 },
  detailLabel: { color: '#888', fontSize: 13, marginTop: 12 },
  detailValue: { color: '#FFF', fontSize: 16, marginTop: 2 },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00D4FF',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  directionsBtnText: { color: '#0A0A0A', fontWeight: '600', fontSize: 15 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  downloadBtnText: { color: '#00D4FF', fontSize: 15 },
  // New styles for the "Go to Home" button
  goHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  goHomeBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});