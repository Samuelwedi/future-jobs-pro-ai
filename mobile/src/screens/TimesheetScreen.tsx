import { es, fr, enUS } from 'date-fns/locale';
import { useLang } from '../context/LanguageContext';
import { AdaptiveModal as Modal } from '../components/AdaptiveModal';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, SectionList, ActivityIndicator, RefreshControl,
  TouchableOpacity,  ScrollView, Alert, TextInput, Linking, Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { API_URL, api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { format as formatDate, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { prepareTimesheetExportDirectory } from '../services/timesheetExportCache';
import { getPendingAttachment, startAttachmentUpload, recoverAttachmentUpload, type AttachmentReceipt } from '../services/attachmentReceiptUpload';
import { timesheetDay, sumTimesheetHours } from '../utils/timesheetTotals';

interface TimeEntry {
  id: string;
  project_name: string;
  project_address: string;
  clock_in: string;
  work_date?: string;
  clock_out: string | null;
  break_minutes: number;
  hours: string;
  regularHours: string;
  overtimeHours: string;
  alerts: string[];
  is_manual: boolean;
  attachments?: any[];
  approval_status?: string;
  correction_reason?: string;
  payroll_locked?: boolean;
}

interface DaySection {
  title: string;
  subtitle: string;
  data: TimeEntry[];
  totalHours: number;
  totalOT: number;
}

export default function TimesheetScreen() {
  const { t, lang } = useLang();
  const format = (date: Date, pattern: string) => formatDate(date, pattern, {locale: lang === 'es' ? es : lang === 'fr' ? fr : enUS});
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  // Token replacement precedes AuthContext's user update. An old user render must
  // not acquire the replacement session, including on unrelated state rerenders.
  const isRenderedSessionCurrent = useMemo(() => api.captureSessionGuard(), [user]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id || '');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editForm,setEditForm]=useState({clockIn:'',clockOut:'',breakMinutes:'0',reason:''});
  const [editing,setEditing]=useState(false);
  const requestSequence = useRef(0);
  const attachmentLock = useRef(false);
  const [attachmentBusy,setAttachmentBusy] = useState(false);
  const [attachmentLoading,setAttachmentLoading] = useState(false);
  const [attachmentLoadError,setAttachmentLoadError] = useState(false);
  const [savedAttachment,setSavedAttachment] = useState<AttachmentReceipt | null>(null);
  const writeLock = useRef(false);
  const writeEpoch = useRef(0);
  const [writing, setWriting] = useState(false);
  const exportLock = useRef<symbol | null>(null);
  const exportEpoch = useRef(0);
  const exportFocused = useRef(false);
  const exportMounted = useRef(true);
  const [exporting, setExporting] = useState(false);

  const [timezone, setTimezone] = useState<string | undefined>();

  const isBossOrManager = user?.role === 'boss' || user?.role === 'manager';

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const weekStart = format(startOfWeek(baseDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(baseDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const exportScope = `${user?.id || ''}:${user?.companyId || ''}:${user?.role || ''}:${selectedUserId}:${weekStart}:${weekEnd}`;
  const currentExportScope = useRef<string | null>(exportScope);
  if (currentExportScope.current !== exportScope) exportEpoch.current += 1;
  currentExportScope.current = exportScope;
  useFocusEffect(useCallback(() => {
    exportFocused.current = true;
    return () => { exportFocused.current = false; exportEpoch.current += 1; };
  }, []));
  useEffect(() => {
    exportMounted.current = true;
    return () => { exportMounted.current = false; exportEpoch.current += 1; };
  }, []);
  const writeScope = `${exportScope}:${selectedEntry?.id || ''}`;
  const currentWriteScope = useRef<string | null>(writeScope);
  currentWriteScope.current = writeScope;
  useEffect(() => {
    writeEpoch.current += 1;
    setEditing(false);
  }, [selectedEntry?.id, exportScope]);
  useEffect(() => () => { currentExportScope.current = null; currentWriteScope.current = null; writeEpoch.current += 1; }, []);

  useEffect(() => {
    if (isBossOrManager) {
      api.get(`/users/company/${user?.companyId}`)
        .then((res: any) => setEmployees(res.users || []))
        .catch(console.error);
    }
  }, []);

  const fetchEntries = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const scope = exportScope;
    try {
      const userId = selectedUserId || user?.id;
      const res = await api.get<{ success: boolean; entries: TimeEntry[]; timezone?: string }>(
        `/time-entries?userId=${userId}&start=${weekStart}&end=${weekEnd}`
      );
      let entriesData = res.entries || [];
      if (!entriesData.length && (res as any).data?.entries) {
        entriesData = (res as any).data.entries;
      }
      if (sequence !== requestSequence.current || currentExportScope.current !== scope) return;
      setEntries(entriesData);
      // Refresh the open detail too, so newly persisted attachments become visible.
      setSelectedEntry(previous => previous ? entriesData.find((entry: TimeEntry) => entry.id === previous.id) || null : null);
      setTimezone(res.timezone);
      setErrorMsg(null);
    } catch (e: any) {
      if (sequence !== requestSequence.current || currentExportScope.current !== scope) return;
      console.error('Timesheet error:', e);
      setErrorMsg(e.message || t("Failed to load entries"));
    } finally {
      if (sequence === requestSequence.current && currentExportScope.current === scope) { setLoading(false); setRefreshing(false); }
    }
  }, [selectedUserId, user?.id, weekStart, weekEnd, exportScope]);

  useEffect(() => {
    setEntries([]); setSelectedEntry(null); setLoading(true);
    void fetchEntries();
    return () => { requestSequence.current += 1; };
  }, [fetchEntries]);

  useEffect(() => {
    let cancelled = false;
    const scope = writeScope, entryId = selectedEntry?.id;
    const current = () => !cancelled && currentWriteScope.current === scope;
    setSavedAttachment(null); setAttachmentLoadError(false); setAttachmentLoading(Boolean(entryId));
    if (entryId && user?.id && user?.companyId) {
      void (async () => {
        try {
          await api.captureAttachmentSession(user.id,user.companyId);
          if (!current()) return;
          const saved = await getPendingAttachment(user.id,user.companyId,entryId);
          if (current()) setSavedAttachment(saved || null);
        } catch { if (current()) setAttachmentLoadError(true); }
        finally { if (current()) setAttachmentLoading(false); }
      })();
    }
    return () => { cancelled = true; };
  }, [writeScope]);

  const onRefresh = () => { setRefreshing(true); fetchEntries(); };

  const handleExport = async (format: 'csv' | 'pdf', isCurrent: () => boolean) => {
    if (!isCurrent()) return;
    let fileUri: string | null = null;
    let handoffAttempted = false;
    try {
      const userId = selectedUserId || user?.id;
      const token = await api.getToken();
      if (!isCurrent()) return;
      if (!userId || !token) throw new Error(t('Not authenticated'));
      if (Platform.OS === 'web') throw new Error(t('Sharing is unavailable on this device'));
      const available = await Sharing.isAvailableAsync();
      if (!isCurrent()) return;
      if (!available) throw new Error(t('Sharing is unavailable on this device'));
      if (!FileSystem.cacheDirectory) throw new Error(t('File storage is unavailable'));
      const directory = await prepareTimesheetExportDirectory(FileSystem.cacheDirectory, isCurrent);
      if (!isCurrent() || !directory) return;
      fileUri = `${directory}timesheet_${weekStart}_${weekEnd}_${Date.now()}_${Math.random().toString(36).slice(2)}.${format}`;
      const url = `${API_URL}/time-entries/export?userId=${encodeURIComponent(userId)}&start=${weekStart}&end=${weekEnd}&format=${format}`;
      const result = await FileSystem.downloadAsync(url, fileUri, {headers: {Authorization: `Bearer ${token}`}});
      if (!isCurrent()) return;
      if (result.status !== 200) throw new Error(t('Could not export timesheet: ') + result.status);
      const mime = Object.entries(result.headers || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || '';
      const expected = format === 'pdf' ? 'application/pdf' : 'text/csv';
      if (!mime.toLowerCase().startsWith(expected)) throw new Error(t('Could not export timesheet: ') + t('Unexpected file type'));
      const currentToken = await api.getToken();
      if (!isCurrent() || currentToken !== token) return;
      // Android resolves at chooser return, before the recipient necessarily reads.
      // A rejected native call can also have an uncertain handoff; retain either way.
      handoffAttempted = true;
      await Sharing.shareAsync(fileUri, { mimeType: expected, UTI: format === 'pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text' });
    } catch (error) {
      if (isCurrent()) Alert.alert(t('Error'), error instanceof Error ? error.message : t('Could not export timesheet: '));
    } finally {
      if (fileUri && !handoffAttempted) await FileSystem.deleteAsync(fileUri, {idempotent:true}).catch(() => {});
    }
  };

  const chooseExport = () => {
    if (exportLock.current) return;
    const scope = exportScope, epoch = exportEpoch.current;
    const isSessionCurrent = api.captureSessionGuard();
    const isCurrent = () => exportMounted.current && exportFocused.current
      && currentExportScope.current === scope && exportEpoch.current === epoch
      && isRenderedSessionCurrent() && isSessionCurrent();
    if (!isCurrent()) return;
    const operation = Symbol('timesheet export');
    exportLock.current = operation;
    setExporting(true);
    let sharing = false;
    const finish = () => {
      if (exportLock.current !== operation) return;
      exportLock.current = null;
      if (exportMounted.current) setExporting(false);
    };
    const cancel = () => { if (!sharing) finish(); };
    const share = async (format: 'csv' | 'pdf') => {
      if (sharing || exportLock.current !== operation) return;
      sharing = true;
      try { await handleExport(format, isCurrent); }
      finally { finish(); }
    };
    Alert.alert(t('Export timesheet'), t('Choose format'), [
      {text:'CSV', onPress:() => {void share('csv');}},
      {text:'PDF', onPress:() => {void share('pdf');}},
      {text:t('Cancel'), style:'cancel', onPress:cancel},
    ], {cancelable:true, onDismiss:cancel});
  };

  // ─── Group entries ───
  const groupByDay = (items: TimeEntry[]): DaySection[] => {
    const map = new Map<string, { entries: TimeEntry[]; totalMs: number; totalOTMs: number }>();
    items.forEach(entry => {
      const dayKey = timesheetDay(entry, timezone);
      const existing = map.get(dayKey) || { entries: [], totalMs: 0, totalOTMs: 0 };
      existing.entries.push(entry);
      const hours = sumTimesheetHours([entry]);
      existing.totalMs += hours.total * 3600000;
      existing.totalOTMs += hours.overtime * 3600000;
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
  const weekly = sumTimesheetHours(entries);
  const weeklyTotal = weekly.regular;
  const weeklyOT = weekly.overtime;

  const openAttachment = async (url: string) => {
    const scope = writeScope;
    if (currentWriteScope.current !== scope) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Unsupported attachment link');
      await Linking.openURL(parsed.toString());
    } catch {
      if (currentWriteScope.current === scope) Alert.alert(t('Error'), t('Could not open attachment. Refresh and try again.'));
    }
  };

  const handleAttachFile = async (timeEntryId: string, recoverOnly = false) => {
    if (attachmentLock.current || attachmentLoading || !user?.id || !user?.companyId) return;
    const scope = writeScope, epoch = writeEpoch.current;
    const current = () => currentWriteScope.current === scope && writeEpoch.current === epoch;
    if (!current() || selectedEntry?.id !== timeEntryId) return;
    attachmentLock.current = true; setAttachmentBusy(true);
    try {
      const session = await api.captureAttachmentSession(user.id,user.companyId);
      if (!current()) return;
      const existing = await getPendingAttachment(user.id,user.companyId,timeEntryId);
      if (!current()) return;
      setAttachmentLoadError(false);
      let outcome;
      if (existing) {
        setSavedAttachment(existing);
        outcome = await recoverAttachmentUpload(session,timeEntryId,current);
      } else {
        setSavedAttachment(null);
        if (recoverOnly) return;
        const result = await DocumentPicker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true});
        if (!current() || result.canceled || !result.assets?.length) return;
        outcome = await startAttachmentUpload(session,timeEntryId,result.assets[0],current);
      }
      if (!current()) return;
      setSavedAttachment(outcome.receipt || null);
      if (outcome.state === 'completed') {
        await fetchEntries();
        if (current()) Alert.alert(t('Success'),t('Attachment uploaded!'));
      } else {
        Alert.alert(t('Attachment saved on this device'),t(outcome.state === 'prepared'
          ? 'Send the saved attachment when you are online.'
          : 'Upload outcome is not confirmed. Check status; do not choose the file again.'));
      }
    } catch (error: any) {
      if (!current()) return;
      try {
        const saved = await getPendingAttachment(user.id,user.companyId,timeEntryId);
        if (current()) setSavedAttachment(saved || null);
      } catch { if (current()) setAttachmentLoadError(true); }
      if (current()) Alert.alert(t('Attachment not confirmed'),t(error?.message || 'Check the saved attachment before choosing another file.'));
    } finally {
      attachmentLock.current = false;
      if (currentWriteScope.current !== null) setAttachmentBusy(false);
    }
  };

  const beginEdit=(entry:TimeEntry)=>{
    if (writeLock.current) return;
    setEditForm({clockIn:new Date(entry.clock_in).toISOString(),clockOut:entry.clock_out?new Date(entry.clock_out).toISOString():'',breakMinutes:String(entry.break_minutes||0),reason:''});setEditing(true);
  };
  const writeEntry = async (action: 'correct' | 'approve') => {
    if (!selectedEntry || !isBossOrManager || selectedEntry.payroll_locked || writeLock.current) return;
    const scope = writeScope, epoch = writeEpoch.current;
    if (currentWriteScope.current !== scope) return;
    writeLock.current = true; setWriting(true);
    const current = () => currentWriteScope.current === scope && writeEpoch.current === epoch;
    try {
      const response = await api.writeTimeEntry<{success:boolean}>(selectedEntry.id, action, action === 'correct' ? {
        clockIn: editForm.clockIn, clockOut: editForm.clockOut || null,
        breakMinutes: Number(editForm.breakMinutes), reason: editForm.reason,
      } : undefined);
      if (!current()) return;
      if (!response.success) throw new Error(t('Time entry change was not confirmed. Refresh before trying again.'));
      Alert.alert(t(action === 'correct' ? 'Saved' : 'Approved'), t(action === 'correct'
        ? 'The correction was recorded in the audit trail and returned for approval.'
        : 'The time entry is approved for payroll.'));
      setEditing(false); setSelectedEntry(null);
      await fetchEntries();
    } catch (cause: any) {
      if (current()) Alert.alert(t('Time entry change not confirmed'), [
        t(cause?.response?.data?.message || cause?.message || ''),
        t('Time entry change was not confirmed. Refresh before trying again.'),
      ].filter(Boolean).join('\n'));
    } finally {
      writeLock.current = false;
      if (currentWriteScope.current !== null) setWriting(false);
    }
  };
  const saveEdit = () => writeEntry('correct');
  const approveEntry = () => writeEntry('approve');

  const renderSectionHeader = ({ section }: { section: DaySection }) => (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionDate}>{section.subtitle}</Text>
      </View>
      <View style={styles.sectionHoursRow}>
        <Text style={styles.sectionHours}>{section.totalHours.toFixed(2)}h</Text>
        {section.totalOT > 0 && (
          <Text style={styles.otBadge}>+{section.totalOT.toFixed(1)}{t("h OT")}</Text>
        )}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: TimeEntry }) => {
    const clockInTime = item.clock_in ? format(parseISO(item.clock_in), 'h:mm a') : '';
    const clockOutTime = item.clock_out ? format(parseISO(item.clock_out), 'h:mm a') : '—';
    const hasAlerts = item.alerts && item.alerts.length > 0;
    const hasAttachments = item.attachments && item.attachments.length > 0;

    return (
      <TouchableOpacity style={styles.entryRow} onPress={() => setSelectedEntry(item)}>
        <View style={styles.entryInfo}>
          <View style={styles.entryHeader}>
            <Text style={styles.projectName}>{item.project_name || t("No project")}</Text>
            {hasAlerts && <MaterialIcons name="warning" size={18} color="#FF9800" />}
            {item.is_manual && <MaterialIcons name="edit" size={16} color="#888" style={{ marginLeft: 4 }} />}
            {hasAttachments && <MaterialIcons name="attach-file" size={16} color="#00D4FF" style={{ marginLeft: 4 }} />}
          </View>
          <Text style={styles.times}>{clockInTime} → {clockOutTime}</Text>
          {item.break_minutes > 0 && <Text style={styles.breakText}>{t("🕐 Break:")} {item.break_minutes}m</Text>}
        </View>
        <View style={styles.hoursCol}>
          <Text style={styles.hours}>{item.hours || '0.00'}h</Text>
          {parseFloat(item.overtimeHours || '0') > 0 && (
            <Text style={styles.otText}>{t("OT")} {item.overtimeHours}h</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const selectedUserName = employees.find(e => e.id === selectedUserId)?.first_name || 'Me';

  if (loading) {
    return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("Timesheet")}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Export timesheet")} disabled={exporting} onPress={chooseExport} style={{ padding: 8, opacity: exporting ? 0.5 : 1 }}>
          <MaterialIcons name="file-download" size={24} color="#00D4FF" />
        </TouchableOpacity>
        {isBossOrManager && (
          <TouchableOpacity onPress={() => setShowUserPicker(true)} style={styles.userPickerBtn}>
            <Text style={styles.userPickerText}>{selectedUserName}</Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#00D4FF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset(prev => prev - 1)}>
          <MaterialIcons name="chevron-left" size={28} color="#00D4FF" />
        </TouchableOpacity>
        <Text style={styles.weekRange}>{weekStart} – {weekEnd}</Text>
        <TouchableOpacity onPress={() => setWeekOffset(prev => prev + 1)}>
          <MaterialIcons name="chevron-right" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      {timezone && <Text style={{ color: '#AAA', textAlign: 'center' }}>{t("Company timezone:")} {timezone}</Text>}
      <View style={styles.weeklySummary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{weeklyTotal.toFixed(1)}h</Text>
          <Text style={styles.summaryLabel}>{t("Regular")}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{weeklyOT.toFixed(1)}h</Text>
          <Text style={styles.summaryLabel}>{t("Overtime")}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{entries.length}</Text>
          <Text style={styles.summaryLabel}>{t("Shifts")}</Text>
        </View>
      </View>

      {errorMsg ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          <TouchableOpacity onPress={fetchEntries} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("Retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
          ListEmptyComponent={<Text style={styles.empty}>{t("No time entries this week")}</Text>}
        />
      )}

      {/* Entry Detail Modal */}
      <Modal visible={!!selectedEntry} onRequestClose={() => setSelectedEntry(null)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("Shift Details")}</Text>
              <TouchableOpacity onPress={() => setSelectedEntry(null)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            {selectedEntry && (
              <ScrollView>
                <Text style={styles.detailLabel}>{t("Project")}</Text>
                <Text style={styles.detailValue}>{selectedEntry.project_name}</Text>
                <Text style={styles.detailLabel}>{t("Address")}</Text>
                <Text style={styles.detailValue}>{selectedEntry.project_address || t("No address")}</Text>
                <Text style={styles.detailLabel}>{t("Clock In")}</Text>
                <Text style={styles.detailValue}>{format(parseISO(selectedEntry.clock_in), 'MMM d, yyyy h:mm a')}</Text>
                <Text style={styles.detailLabel}>{t("Clock Out")}</Text>
                <Text style={styles.detailValue}>{selectedEntry.clock_out ? format(parseISO(selectedEntry.clock_out), 'h:mm a') : t("Active")}</Text>
                <Text style={styles.detailLabel}>{t("Regular")}</Text>
                <Text style={styles.detailValue}>{selectedEntry.regularHours}h</Text>
                <Text style={styles.detailLabel}>{t("Overtime")}</Text>
                <Text style={styles.detailValue}>{selectedEntry.overtimeHours}h</Text>
                {selectedEntry.break_minutes > 0 && (
                  <>
                    <Text style={styles.detailLabel}>{t("Break")}</Text>
                    <Text style={styles.detailValue}>{selectedEntry.break_minutes}m</Text>
                  </>
                )}
                {editing?<View style={{gap:10,marginTop:16}}><TextInput style={styles.editInput} value={editForm.clockIn} onChangeText={value=>setEditForm({...editForm,clockIn:value})} placeholder={t("Clock in ISO date/time")} placeholderTextColor="#778"/><TextInput style={styles.editInput} value={editForm.clockOut} onChangeText={value=>setEditForm({...editForm,clockOut:value})} placeholder={t("Clock out ISO date/time")} placeholderTextColor="#778"/><TextInput keyboardType="number-pad" style={styles.editInput} value={editForm.breakMinutes} onChangeText={value=>setEditForm({...editForm,breakMinutes:value})} placeholder={t("Break minutes")} placeholderTextColor="#778"/><TextInput multiline style={styles.editInput} value={editForm.reason} onChangeText={value=>setEditForm({...editForm,reason:value})} placeholder={t("Required correction reason")} placeholderTextColor="#778"/><TouchableOpacity style={styles.gpsBtn} disabled={writing} onPress={saveEdit}><Text style={styles.gpsBtnText}>{t("Save audited correction")}</Text></TouchableOpacity></View>:null}
                {selectedEntry.alerts.length > 0 && (
                  <>
                    <Text style={styles.detailLabel}>{t("Alerts")}</Text>
                    {selectedEntry.alerts.map((a, i) => (
                      <Text key={i} style={styles.alertText}>⚠️ {a}</Text>
                    ))}
                  </>
                )}
                {(selectedEntry.attachments || []).map((attachment: any) => (
                  <TouchableOpacity key={attachment.id} accessibilityRole="link"
                    accessibilityLabel={`${t('Open Attachment')}: ${attachment.file_name}`}
                    style={styles.gpsBtn} onPress={() => void openAttachment(attachment.file_url)}>
                    <MaterialIcons name="attach-file" size={20} color="#0A0A0A" />
                    <Text style={styles.gpsBtnText}>{attachment.file_name || t('Attachment')}</Text>
                  </TouchableOpacity>
                ))}
                {attachmentLoadError ? <Text style={styles.alertText}>{t('Saved attachment records could not be read. They have not been changed.')}</Text> : null}
                {savedAttachment ? <View>
                  <Text style={styles.detailValue}>{savedAttachment.fileInfo.name}</Text>
                  <Text style={styles.detailLabel}>{t(savedAttachment.phase === 'prepared'
                    ? 'Send the saved attachment when you are online.'
                    : 'Upload outcome is not confirmed. Check status; do not choose the file again.')}</Text>
                  <TouchableOpacity style={styles.gpsBtn} disabled={attachmentBusy || attachmentLoading}
                    onPress={() => void handleAttachFile(selectedEntry.id,true)}>
                    <Text style={styles.gpsBtnText}>{t(savedAttachment.phase === 'prepared' ? 'Send saved attachment' : 'Check attachment status')}</Text>
                  </TouchableOpacity>
                </View> : null}
                <TouchableOpacity style={styles.attachBtn} disabled={attachmentBusy || attachmentLoading || !!savedAttachment} onPress={() => void handleAttachFile(selectedEntry.id)}>
                  <MaterialIcons name="attach-file" size={20} color="#0A0A0A" />
                  <Text style={styles.attachBtnText}>{t("Attach File")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.gpsBtn} onPress={() => {
                  setSelectedEntry(null);
                  navigation.navigate('GPSPlayback', { timeEntryId: selectedEntry.id });
                }}>
                  <MaterialIcons name="play-circle" size={20} color="#0A0A0A" />
                  <Text style={styles.gpsBtnText}>{t("Replay GPS Trail")}</Text>
                </TouchableOpacity>
                {isBossOrManager&&!selectedEntry.payroll_locked?<><TouchableOpacity style={styles.managerBtn} disabled={writing} onPress={()=>beginEdit(selectedEntry)}><MaterialIcons name="edit" size={20} color="#071018"/><Text style={styles.managerBtnText}>{t("Correct time entry")}</Text></TouchableOpacity>{selectedEntry.clock_out&&selectedEntry.approval_status!=='approved'?<TouchableOpacity style={[styles.managerBtn,{backgroundColor:'#55D66B'}]} disabled={writing} onPress={approveEntry}><MaterialIcons name="check-circle" size={20} color="#071018"/><Text style={styles.managerBtnText}>{t("Approve for payroll")}</Text></TouchableOpacity>:null}</>:null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* User Picker Modal */}
      <Modal visible={showUserPicker} onRequestClose={() => setShowUserPicker(false)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("Select Employee")}</Text>
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
              <Text style={styles.employeeName}>{t("Me (")}{user?.firstName} {user?.lastName})</Text>
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
    paddingTop: 16,
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
  errorContainer: { padding: 20, alignItems: 'center' },
  errorText: { color: '#FF6B6B', fontSize: 16, marginBottom: 10 },
  retryBtn: { backgroundColor: '#00D4FF', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: '#0A0A0A', fontWeight: 'bold' },
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
  editInput:{backgroundColor:'#0B1118',borderWidth:1,borderColor:'#334155',borderRadius:10,padding:12,color:'#FFF'},
  managerBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#FFB020',paddingVertical:12,borderRadius:10,marginTop:10},
  managerBtnText:{color:'#071018',fontWeight:'800'},
});
