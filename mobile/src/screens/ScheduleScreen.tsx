import { es, fr, enUS } from 'date-fns/locale';
import { useLang } from '../context/LanguageContext';
import { AdaptiveModal as Modal } from '../components/AdaptiveModal';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity, TextInput, Linking, ScrollView, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { searchSchedule, visibleSchedule } from '../utils/scheduleSearch';
import { scheduleCalendar, CALENDAR_TIME_NOTICE } from '../utils/scheduleCalendar';
import { shareCalendarFile } from '../services/calendarShare';
import { calendarDate, parseCalendarDate } from '../utils/calendarDate';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import {
  format as formatDate, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
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

interface LoadedSchedule {
  shifts: Shift[];
  start: string;
  end: string;
  scope: string;
  request: number;
  isSessionCurrent: () => boolean;
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
  const { t, lang } = useLang();
  const format = (date: Date, pattern: string) => formatDate(date, pattern, {locale: lang === 'es' ? es : lang === 'fr' ? fr : enUS});
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week' | '3days' | 'day'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(user?.id || '');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState(t("My Schedule"));
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const scheduleScope = JSON.stringify([user?.id, user?.companyId, user?.role, selectedEmployeeId, viewMode, selectedDate.getTime(), currentMonth.getTime()]);
  const currentScheduleScope = useRef(scheduleScope);
  currentScheduleScope.current = scheduleScope;
  const focusActive = useRef(false);
  const mounted = useRef(true);
  const loadedSchedule = useRef<LoadedSchedule | null>(null);
  const [exportReady, setExportReady] = useState(false);
  const exportLock = useRef<symbol | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const employeeRequestNumber = useRef(0);
  const fetchEmployees = async () => {
    const request = ++employeeRequestNumber.current;
    try {
      const companyId = user?.companyId;
      if (!companyId) return;
      const res = await api.get<TeamMembersResponse>(`/team/members/${companyId}`);
      const members = res.members || [];
      if (request === employeeRequestNumber.current) setEmployees(members);
    } catch (e) {
      console.error('Failed to fetch employees', e);
    }
  };

  const requestNumber = useRef(0);
  const canManage = ['boss','manager','admin'].includes(user?.role || '');
  const fetchShifts = async () => {
    const request = ++requestNumber.current;
    const scope = scheduleScope;
    const isSessionCurrent = api.captureSessionGuard();
    const isCurrent = () => request === requestNumber.current && scope === currentScheduleScope.current && focusActive.current && isSessionCurrent();
    loadedSchedule.current = null;
    setExportReady(false);
    let start: string, end: string;
    const d = selectedDate;
    switch (viewMode) {
      case 'month':
        start = format(startOfWeek(startOfMonth(currentMonth), {weekStartsOn:1}), 'yyyy-MM-dd');
        end = format(endOfWeek(endOfMonth(currentMonth), {weekStartsOn:1}), 'yyyy-MM-dd');
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
      if (!userId || !user?.companyId || !isCurrent()) return;
      const res: any = await api.get(
        `/schedule/my-shifts?userId=${encodeURIComponent(userId)}&start=${start}&end=${end}`
      );
      let fetchedShifts: Shift[] = [];
      if (res && typeof res === 'object') {
        const data = res.data || res;
        if (data && typeof data === 'object' && 'shifts' in data) {
          fetchedShifts = data.shifts || [];
        }
      }
      if (!isCurrent()) return;
      if (!Array.isArray(fetchedShifts)) throw new Error('Invalid schedule response');
      setShifts(fetchedShifts);
      loadedSchedule.current = { shifts: fetchedShifts, start, end, scope, request, isSessionCurrent };
      setExportReady(fetchedShifts.length > 0);
      console.log(`📊 Fetched ${fetchedShifts.length} shifts`);
    } catch (e) {
      console.error('Error fetching shifts:', e);
      if (isCurrent()) Alert.alert(t('Error'), t('Could not load shifts'));
    } finally {
      if (isCurrent()) { setLoading(false); setRefreshing(false); }
    }
  };

  useFocusEffect(useCallback(() => {
    focusActive.current = true;
    setShifts([]);
    setSelectedShift(null);
    setEmployees([]);
    setLoading(true);
    void fetchShifts();
    if (canManage) void fetchEmployees();
    return () => { requestNumber.current += 1; employeeRequestNumber.current += 1; focusActive.current = false; loadedSchedule.current = null; };
  }, [selectedDate, viewMode, selectedEmployeeId, currentMonth, user?.id, user?.companyId, user?.role, canManage]));

  const onRefresh = () => { setRefreshing(true); fetchShifts(); };

  const chooseCalendarExport = () => {
    if (exportLock.current) return;
    const snapshot = loadedSchedule.current;
    if (!snapshot) return;
    const isCurrent = () => mounted.current && focusActive.current && snapshot === loadedSchedule.current
      && snapshot.request === requestNumber.current && snapshot.scope === currentScheduleScope.current && snapshot.isSessionCurrent();
    if (!isCurrent()) return;
    let contents: string;
    try {
      contents = scheduleCalendar(snapshot.shifts, {
        companyId: user?.companyId || '', start: snapshot.start, end: snapshot.end, timeNotice: t(CALENDAR_TIME_NOTICE),
      });
    } catch (error) {
      Alert.alert(t('Could not export calendar'), t(error instanceof Error ? error.message : 'Could not export calendar'));
      return;
    }
    const operation = Symbol('calendar export');
    exportLock.current = operation;
    setExporting(true);
    let sharing = false;
    const finish = () => {
      if (exportLock.current !== operation) return;
      exportLock.current = null;
      if (mounted.current) setExporting(false);
    };
    const cancel = () => { if (!sharing) finish(); };
    const share = async () => {
      if (sharing || exportLock.current !== operation) return;
      sharing = true;
      try {
        await shareCalendarFile(contents, isCurrent);
      } catch (error) {
        if (isCurrent()) Alert.alert(t('Could not export calendar'), t(error instanceof Error ? error.message : 'Could not export calendar'));
      } finally { finish(); }
    };
    Alert.alert(t('Export calendar file'),
      t('Export all {count} loaded shifts for {employee} from {start} to {end}, including shifts hidden by search or the selected day. This is a one-time file, not calendar sync.', {
        count: String(snapshot.shifts.length), employee: !selectedEmployeeId || selectedEmployeeId === user?.id ? t('My Schedule') : selectedEmployeeName, start: snapshot.start, end: snapshot.end,
      }) + '\n\n' + t(CALENDAR_TIME_NOTICE),
      [{ text: t('Cancel'), style: 'cancel', onPress: cancel }, { text: t('Share file'), onPress: () => { void share(); } }],
      { cancelable: true, onDismiss: cancel });
  };

  // Calendar helpers
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = viewMode === 'month' ? startOfWeek(monthStart, {weekStartsOn:1}) : viewMode === 'week' ? startOfWeek(selectedDate,{weekStartsOn:1}) : selectedDate;
  const calEnd = viewMode === 'month' ? endOfWeek(monthEnd,{weekStartsOn:1}) : viewMode === 'week' ? endOfWeek(selectedDate,{weekStartsOn:1}) : viewMode === '3days' ? addDays(selectedDate,2) : selectedDate;

  const calendarDays: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    calendarDays.push(d);
    d = addDays(d, 1);
  }

  const getUTCDateString = calendarDate;

  const getShiftDateString = (iso: string) => iso.split('T')[0];

  const formatShiftDate = (dateStr: string) => {
    if (!dateStr) return '';
    return format(parseCalendarDate(dateStr.split('T')[0]), 'EEE, MMM d');
  };

  const matchingShifts = searchSchedule(shifts, search);
  const shiftDates = new Set(matchingShifts.map(s => s.date ? getShiftDateString(s.date) : ''));
  const selectedDateStr = getUTCDateString(selectedDate);
  const visibleShifts = visibleSchedule(shifts, search, selectedDateStr, viewMode === 'month' || viewMode === 'day');

  const handleOpenDirections = (address?: string) => {
    if (!address) return;
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  const navigateMonth = (dir: number) => {
    setCurrentMonth(prev => dir === -1 ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const openCreateShift = () => {
    navigation.navigate('CreateShift', { date: calendarDate(selectedDate) });
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
        <View style={{ flex: 1, marginLeft: 16 }}>
          <TouchableOpacity onPress={() => setShowEmployeePicker(true)}>
            <Text style={styles.headerTitle}>{selectedEmployeeId ? selectedEmployeeName : t('My Schedule')}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity disabled={!canManage} onPress={openCreateShift} style={{ padding: 4 }}>
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
            <Text style={[styles.viewModeText, viewMode === m && styles.viewModeTextActive]}>{t({month:'Month',week:'Week','3days':'3 days',day:'Day'}[m])}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !exportReady || exporting || refreshing, busy: exporting }}
        disabled={!exportReady || exporting || refreshing} onPress={chooseCalendarExport}
        style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', opacity: !exportReady || exporting || refreshing ? 0.5 : 1 }}>
        <Text style={{ color: '#00D4FF' }}>{t(exporting ? 'Preparing calendar file...' : 'Export loaded range (.ics)')}</Text>
      </TouchableOpacity>

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
          <Text key={day} style={styles.dayHeaderText}>{t(day)}</Text>
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

      <View style={{paddingHorizontal:20, paddingVertical:8}}>
        <TextInput accessibilityLabel={t("Search this date range")} placeholder={t("Search this date range")} placeholderTextColor="#AAA" value={search} onChangeText={setSearch} maxLength={200} returnKeyType="search" style={{color:'#FFF', backgroundColor:'#1A1A1A', borderRadius:8, padding:12}} />
        {search.trim() ? <TouchableOpacity accessibilityRole="button" onPress={() => setSearch('')} style={{paddingVertical:8}}><Text style={{color:'#00D4FF'}}>{t("Clear search")}</Text></TouchableOpacity> : null}
      </View>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={visibleShifts}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.shiftCard} onPress={() => setSelectedShift(item)}>
            <Text style={styles.shiftDate}>{item.date ? formatShiftDate(item.date) : ''}</Text>
            <Text style={styles.shiftName}>{item.name}</Text>
            <Text style={styles.shiftProject}>{item.project_name}</Text>
            <Text style={styles.shiftTime}>{item.start_time} → {item.end_time}</Text>
            {item.attachment_url && (
              <View style={styles.attachmentBadge}>
                <MaterialIcons name="attach-file" size={14} color="#00D4FF" />
                <Text style={styles.attachmentBadgeText}>{t("Attachment")}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={<Text style={styles.empty}>{search.trim() ? t("No matching shifts in this date range") : t("No shifts on this day")}</Text>}
      />

      {/* Shift Detail Modal */}
      <Modal visible={!!selectedShift} onRequestClose={() => setSelectedShift(null)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("Shift Details")}</Text>
              <TouchableOpacity onPress={() => setSelectedShift(null)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            {selectedShift && (
              <ScrollView>
                {canManage && <View style={{flexDirection:'row', gap:20, paddingBottom:16}}>
                  <TouchableOpacity onPress={() => { navigation.navigate('CreateShift', {shift:selectedShift, date:selectedShift.date}); setSelectedShift(null); }}><Text style={{color:'#00D4FF'}}>{t("Edit shift")}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => Alert.alert(t('Delete shift'),t('Remove this scheduled shift?'), [{text:t('Cancel')},{text:t('Delete'),style:'destructive',onPress:async()=>{try { await api.delete(`/schedule/shifts/${selectedShift.id}`); setSelectedShift(null); await fetchShifts(); } catch(e:any) {Alert.alert(t('Delete failed'),e.response?.data?.message || e.message);} }}])}><Text style={{color:'#F44336'}}>{t("Delete shift")}</Text></TouchableOpacity>
                </View>}
                <Text style={styles.detailLabel}>{t("Shift")}</Text>
                <Text style={styles.detailValue}>{selectedShift.name}</Text>
                <Text style={styles.detailLabel}>{t("Project")}</Text>
                <Text style={styles.detailValue}>{selectedShift.project_name}</Text>
                {selectedShift.project_address && (
                  <>
                    <Text style={styles.detailLabel}>{t("Address")}</Text>
                    <Text style={styles.detailValue}>{selectedShift.project_address}</Text>
                  </>
                )}
                <Text style={styles.detailLabel}>{t("Time")}</Text>
                <Text style={styles.detailValue}>{selectedShift.start_time} → {selectedShift.end_time}</Text>
                {selectedShift.notes && (
                  <>
                    <Text style={styles.detailLabel}>{t("Notes")}</Text>
                    <Text style={styles.detailValue}>{selectedShift.notes}</Text>
                  </>
                )}
                {selectedShift.attachment_url && (
                  <>
                    <Text style={styles.detailLabel}>{t("Attachment")}</Text>
                    <TouchableOpacity
                      style={styles.downloadBtn}
                      onPress={() => Linking.openURL(selectedShift.attachment_url!)}
                    >
                      <MaterialIcons name="download" size={20} color="#00D4FF" />
                      <Text style={styles.downloadBtnText}>{t("Open Attachment")}</Text>
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
                  <Text style={styles.goHomeBtnText}>{t("Go to Home to Clock In")}</Text>
                </TouchableOpacity>

                {selectedShift.project_address && (
                  <TouchableOpacity
                    style={styles.directionsBtn}
                    onPress={() => handleOpenDirections(selectedShift.project_address)}
                  >
                    <MaterialIcons name="directions" size={20} color="#0A0A0A" />
                    <Text style={styles.directionsBtnText}>{t("Get Directions")}</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Employee Picker Modal */}
      <Modal visible={showEmployeePicker} onRequestClose={() => setShowEmployeePicker(false)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("Select Employee")}</Text>
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
              <Text style={styles.employeeName}>{t("Me (")}{(user?.firstName || '') + ' ' + (user?.lastName || '')})</Text>
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
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold' },
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