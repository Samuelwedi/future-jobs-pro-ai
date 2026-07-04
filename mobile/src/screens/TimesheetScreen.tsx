import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SectionList, ActivityIndicator, RefreshControl,
  TouchableOpacity, Modal, ScrollView, FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';

interface TimeEntry {
  id: string;
  project_name: string;
  project_address: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  hours: string;
  regularHours: string;
  overtimeHours: string;
  alerts: string[];
  is_manual: boolean;
  attachments?: any[];
}

interface DaySection {
  title: string;
  subtitle: string;
  data: TimeEntry[];
  totalHours: number;
  totalOT: number;
}

export default function TimesheetScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id || '');
  const [showUserPicker, setShowUserPicker] = useState(false);

  const isBossOrManager = user?.role === 'boss' || user?.role === 'manager';

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const weekStart = format(startOfWeek(baseDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(baseDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  // Fetch employees if boss/manager
  useEffect(() => {
    if (isBossOrManager) {
      api.get(`/users/company/${user?.companyId}`)
        .then((res: any) => {
          setEmployees(res.users || []);
        })
        .catch(console.error);
    }
  }, []);

  const fetchEntries = async () => {
    try {
      const userId = selectedUserId || user?.id;
      const res = await api.get<{ success: boolean; entries: TimeEntry[] }>(
        `/time-entries?userId=${userId}&start=${weekStart}&end=${weekEnd}`
      );
      setEntries(res.entries || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchEntries(); }, [weekOffset, selectedUserId]);

  const onRefresh = () => { setRefreshing(true); fetchEntries(); };

  const groupByDay = (items: TimeEntry[]): DaySection[] => {
    const map = new Map<string, { entries: TimeEntry[]; totalMs: number; totalOTMs: number }>();
    items.forEach(entry => {
      const dayKey = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
      const existing = map.get(dayKey) || { entries: [], totalMs: 0, totalOTMs: 0 };
      existing.entries.push(entry);
      if (entry.clock_out) {
        const ms = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime();
        existing.totalMs += ms;
        const hours = ms / 3600000;
        if (hours > 8) existing.totalOTMs += (hours - 8) * 3600000;
      }
      map.set(dayKey, existing);
    });

    const sections: DaySection[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(parseISO(weekStart));
      d.setDate(d.getDate() + i);
      const key = format(d, 'yyyy-MM-dd');
      const data = map.get(key) || { entries: [], totalMs: 0, totalOTMs: 0 };
      sections.push({
        title: format(d, 'EEEE'),
        subtitle: format(d, 'MMM d'),
        data: data.entries,
        totalHours: data.totalMs / 3600000,
        totalOT: data.totalOTMs / 3600000,
      });
    }
    return sections;
  };

  const sections = groupByDay(entries);
  const weeklyTotal = entries.reduce((sum, e) => sum + parseFloat(e.hours || '0'), 0);
  const weeklyOT = entries.reduce((sum, e) => sum + parseFloat(e.overtimeHours || '0'), 0);

  const handleAttachFile = async (timeEntryId: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        await api.uploadFileWithData('/attachments/upload', file.uri, {
          companyId: user?.companyId || '',
          uploadedBy: user?.id || '',
          timeEntryId,
        }, 'file');
        fetchEntries();
        alert('Attachment uploaded!');
      }
    } catch (e: any) {
      alert('Upload failed: ' + e.message);
    }
  };

  const renderSectionHeader = ({ section }: { section: DaySection }) => (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionDate}>{section.subtitle}</Text>
      </View>
      <View style={styles.sectionHoursRow}>
        <Text style={styles.sectionHours}>{section.totalHours.toFixed(2)}h</Text>
        {section.totalOT > 0 && (
          <Text style={styles.otBadge}>+{section.totalOT.toFixed(1)}h OT</Text>
        )}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: TimeEntry }) => {
    const clockInTime = format(parseISO(item.clock_in), 'h:mm a');
    const clockOutTime = item.clock_out ? format(parseISO(item.clock_out), 'h:mm a') : '—';
    const hasAlerts = item.alerts.length > 0;
    const hasAttachments = item.attachments && item.attachments.length > 0;

    return (
      <TouchableOpacity style={styles.entryRow} onPress={() => setSelectedEntry(item)}>
        <View style={styles.entryInfo}>
          <View style={styles.entryHeader}>
            <Text style={styles.projectName}>{item.project_name}</Text>
            {hasAlerts && <MaterialIcons name="warning" size={18} color="#FF9800" />}
            {item.is_manual && <MaterialIcons name="edit" size={16} color="#888" style={{ marginLeft: 4 }} />}
            {hasAttachments && <MaterialIcons name="attach-file" size={16} color="#00D4FF" style={{ marginLeft: 4 }} />}
          </View>
          <Text style={styles.times}>{clockInTime} → {clockOutTime}</Text>
          {item.break_minutes > 0 && <Text style={styles.breakText}>🕐 Break: {item.break_minutes}m</Text>}
        </View>
        <View style={styles.hoursCol}>
          <Text style={styles.hours}>{item.hours}h</Text>
          {parseFloat(item.overtimeHours) > 0 && (
            <Text style={styles.otText}>OT {item.overtimeHours}h</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const selectedUserName = employees.find(e => e.id === selectedUserId)?.first_name || 'Me';

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Timesheet</Text>
        {isBossOrManager && (
          <TouchableOpacity onPress={() => setShowUserPicker(true)} style={styles.userPickerBtn}>
            <Text style={styles.userPickerText}>{selectedUserName}</Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#00D4FF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Week Navigator */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset(prev => prev - 1)}>
          <MaterialIcons name="chevron-left" size={28} color="#00D4FF" />
        </TouchableOpacity>
        <Text style={styles.weekRange}>{weekStart} – {weekEnd}</Text>
        <TouchableOpacity onPress={() => setWeekOffset(prev => prev + 1)}>
          <MaterialIcons name="chevron-right" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      {/* Weekly Summary */}
      <View style={styles.weeklySummary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{weeklyTotal.toFixed(1)}h</Text>
          <Text style={styles.summaryLabel}>Regular</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{weeklyOT.toFixed(1)}h</Text>
          <Text style={styles.summaryLabel}>Overtime</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{entries.length}</Text>
          <Text style={styles.summaryLabel}>Shifts</Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={<Text style={styles.empty}>No time entries this week</Text>}
      />

      {/* Entry Detail Modal */}
      <Modal visible={!!selectedEntry} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Shift Details</Text>
              <TouchableOpacity onPress={() => setSelectedEntry(null)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            {selectedEntry && (
              <ScrollView>
                <Text style={styles.detailLabel}>Project</Text>
                <Text style={styles.detailValue}>{selectedEntry.project_name}</Text>
                <Text style={styles.detailLabel}>Address</Text>
                <Text style={styles.detailValue}>{selectedEntry.project_address || 'No address'}</Text>
                <Text style={styles.detailLabel}>Clock In</Text>
                <Text style={styles.detailValue}>{format(parseISO(selectedEntry.clock_in), 'MMM d, yyyy h:mm a')}</Text>
                <Text style={styles.detailLabel}>Clock Out</Text>
                <Text style={styles.detailValue}>{selectedEntry.clock_out ? format(parseISO(selectedEntry.clock_out), 'h:mm a') : 'Active'}</Text>
                <Text style={styles.detailLabel}>Regular</Text>
                <Text style={styles.detailValue}>{selectedEntry.regularHours}h</Text>
                <Text style={styles.detailLabel}>Overtime</Text>
                <Text style={styles.detailValue}>{selectedEntry.overtimeHours}h</Text>
                {selectedEntry.break_minutes > 0 && (
                  <>
                    <Text style={styles.detailLabel}>Break</Text>
                    <Text style={styles.detailValue}>{selectedEntry.break_minutes}m</Text>
                  </>
                )}
                {selectedEntry.alerts.length > 0 && (
                  <>
                    <Text style={styles.detailLabel}>Alerts</Text>
                    {selectedEntry.alerts.map((a, i) => (
                      <Text key={i} style={styles.alertText}>⚠️ {a}</Text>
                    ))}
                  </>
                )}

                {/* Attach File Button */}
                <TouchableOpacity style={styles.attachBtn} onPress={() => handleAttachFile(selectedEntry.id)}>
                  <MaterialIcons name="attach-file" size={20} color="#0A0A0A" />
                  <Text style={styles.attachBtnText}>Attach File (PDF, Excel, Drawing)</Text>
                </TouchableOpacity>

                {/* GPS Playback */}
                <TouchableOpacity style={styles.gpsBtn} onPress={() => {
                  setSelectedEntry(null);
                  navigation.navigate('GPSPlayback', { timeEntryId: selectedEntry.id });
                }}>
                  <MaterialIcons name="play-circle" size={20} color="#0A0A0A" />
                  <Text style={styles.gpsBtnText}>Replay GPS Trail</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* User Picker Modal */}
      <Modal visible={showUserPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Employee</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.employeeRow, selectedUserId === user?.id && styles.employeeRowActive]}
              onPress={() => {
                setSelectedUserId(user?.id || '');
                setShowUserPicker(false);
              }}
            >
              <Text style={styles.employeeName}>Me ({user?.firstName} {user?.lastName})</Text>
              {selectedUserId === user?.id && <MaterialIcons name="check-circle" size={22} color="#00D4FF" />}
            </TouchableOpacity>
            {employees.map(emp => (
              <TouchableOpacity
                key={emp.id}
                style={[styles.employeeRow, selectedUserId === emp.id && styles.employeeRowActive]}
                onPress={() => {
                  setSelectedUserId(emp.id);
                  setShowUserPicker(false);
                }}
              >
                <Text style={styles.employeeName}>{emp.first_name} {emp.last_name}</Text>
                {selectedUserId === emp.id && <MaterialIcons name="check-circle" size={22} color="#00D4FF" />}
              </TouchableOpacity>
            ))}
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
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', flex: 1, marginLeft: 16 },
  userPickerBtn: { flexDirection: 'row', alignItems: 'center' },
  userPickerText: { color: '#00D4FF', fontSize: 16, fontWeight: '600' },
  weekNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  weekRange: { color: '#00D4FF', fontSize: 15, fontWeight: '600' },
  weeklySummary: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#333', marginHorizontal: 20 },
  summaryItem: { alignItems: 'center' },
  summaryValue: { color: '#00D4FF', fontSize: 22, fontWeight: 'bold' },
  summaryLabel: { color: '#888', fontSize: 12, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 30 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#444', marginTop: 4 },
  sectionTitle: { color: '#00D4FF', fontSize: 16, fontWeight: '600' },
  sectionDate: { color: '#888', fontSize: 12, marginTop: 2 },
  sectionHoursRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHours: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  otBadge: { color: '#FF9800', fontSize: 12, fontWeight: '600', backgroundColor: '#FF980020', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  entryInfo: { flex: 1 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  projectName: { color: '#FFF', fontSize: 15, fontWeight: '500' },
  times: { color: '#888', fontSize: 13, marginTop: 4 },
  breakText: { color: '#888', fontSize: 12, marginTop: 2 },
  hoursCol: { alignItems: 'flex-end' },
  hours: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  otText: { color: '#FF9800', fontSize: 12, marginTop: 2 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  detailLabel: { color: '#888', fontSize: 13, marginTop: 12 },
  detailValue: { color: '#FFF', fontSize: 16, marginTop: 2 },
  alertText: { color: '#FF9800', fontSize: 14, marginTop: 4 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF9800', paddingVertical: 12, borderRadius: 10, marginTop: 16, gap: 8 },
  attachBtnText: { color: '#0A0A0A', fontWeight: '600', fontSize: 15 },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00D4FF', paddingVertical: 12, borderRadius: 10, marginTop: 10, gap: 8 },
  gpsBtnText: { color: '#0A0A0A', fontWeight: '600', fontSize: 15 },
  employeeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
  employeeRowActive: { backgroundColor: '#1A3A4A' },
  employeeName: { color: '#FFF', fontSize: 16 },
});