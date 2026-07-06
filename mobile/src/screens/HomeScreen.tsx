import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, RefreshControl,
  Dimensions, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AISuggestion {
  id: string;
  title: string;
  description: string;
  priority: string;
}

interface Shift {
  id: string;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  project_name?: string;
  project_id?: string;
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const navigation = useNavigation<any>();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [schedules, setSchedules] = useState<Shift[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Shift | null>(null);
  const [selectionMode, setSelectionMode] = useState<'project' | 'schedule'>('project');
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTimeEntry, setActiveTimeEntry] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [livePulse, setLivePulse] = useState({ activeWorkers: 1, activeProjects: 1, revenueToday: 0 });

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setCurrentLocation(loc);
      }
    })();
  }, []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    if (isClockedIn && activeTimeEntry?.clockIn) {
      const startTime = new Date(activeTimeEntry.clockIn);
      if (isNaN(startTime.getTime())) {
        console.error('Invalid clockIn date:', activeTimeEntry.clockIn);
        return;
      }
      const start = startTime.getTime();
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isClockedIn, activeTimeEntry]);

  const loadData = async () => {
    try {
      const res = await api.get<any>('/projects');
      setProjects(res.projects || []);
      setLivePulse(prev => ({ ...prev, activeProjects: (res.projects || []).length }));
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSchedules = async () => {
    try {
      const today = new Date();
      const start = format(startOfMonth(today), 'yyyy-MM-dd');
      const end = format(endOfMonth(today), 'yyyy-MM-dd');
      const userId = user?.id;
      if (!userId) return;
      const res = await api.get(`/schedule/my-shifts?userId=${userId}&start=${start}&end=${end}`);
      const data = (res as any).data || res;
      const shifts = data.shifts || [];
      // Get UTC date string for today
      const todayUTC = new Date().toISOString().split('T')[0];
      // Filter to today's shifts (UTC date)
      const todayShifts = shifts.filter((s: Shift) => s.date && s.date.startsWith(todayUTC));
      setSchedules(todayShifts);
      if (todayShifts.length > 0) setSelectedSchedule(todayShifts[0]);
    } catch (e) {
      console.error('Failed to load schedules:', e);
    }
  };

  const loadAISuggestions = async () => {
    try {
      const res = await api.getAISuggestions();
      setAiSuggestions(res.suggestions || []);
    } catch (e) {
      console.error('Failed to load AI suggestions:', e);
    }
  };

  useFocusEffect(useCallback(() => {
    loadData();
    loadSchedules();
    loadAISuggestions();
  }, []));

  const handleClockIn = async () => {
  let projectId = null;
  if (selectionMode === 'project') {
    if (!selectedProject) { Alert.alert('Select a project first'); return; }
    projectId = selectedProject.id;
  } else {
    if (!selectedSchedule) { Alert.alert('Select a schedule first'); return; }
    if (!selectedSchedule.project_id) { Alert.alert('This schedule has no project'); return; }
    projectId = selectedSchedule.project_id;
  }
  try {
    const payload: any = {
      userId: user?.id,
      projectId: projectId,
      latitude: currentLocation?.coords.latitude || 0,
      longitude: currentLocation?.coords.longitude || 0
    };
    console.log('🔍 Clock-in payload:', payload);
    const res = await api.post<any>('/time-entries/clock-in', payload);
    if (res.success) {
      Alert.alert('✅ Clocked In', 'You have clocked in successfully.');
      await loadActiveEntry(); // refresh active state
    } else {
      Alert.alert('Clock In Failed', res.message || 'Could not clock in');
    }
  } catch (e: any) {
    console.error('Clock-in error:', e);
    Alert.alert('Error', e.message || 'An error occurred');
  }
};

  const handleClockOut = async () => {
    if (!activeTimeEntry?.timeEntryId) {
      Alert.alert('Error', 'No active time entry');
      return;
    }
    try {
      await api.post('/time-entries/clock-out', {
        userId: user?.id,
        timeEntryId: activeTimeEntry.timeEntryId,
        latitude: currentLocation?.coords.latitude || 0,
        longitude: currentLocation?.coords.longitude || 0
      });
      setIsClockedIn(false);
      setActiveTimeEntry(null);
      await api.recordAIEvent('clock_out', { timeEntryId: activeTimeEntry.timeEntryId });
      Alert.alert('Clocked Out', 'Your time entry has been saved.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const dismissSuggestion = async (id: string) => {
    await api.dismissSuggestion(id);
    setAiSuggestions(prev => prev.filter(s => s.id !== id));
  };

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleScheduleSelect = (schedule: Shift) => {
    setSelectedSchedule(schedule);
    const dateObj = new Date(schedule.date);
    navigation.navigate('Schedule', { selectedDate: dateObj.toISOString() });
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#00D4FF" /></View>;
  }

  const greeting = t('greeting', { firstName: user?.firstName || '' });

  const quickActions = [
    { icon: 'photo-camera', color: '#00D4FF', gradient: ['#00D4FF', '#007AFF'], label: 'Photo', screen: 'Camera', needsProject: true },
    { icon: 'microphone', color: '#4CAF50', gradient: ['#4CAF50', '#2E7D32'], label: 'Voice', screen: 'VoiceNote', needsProject: true, IconSet: FontAwesome5 },
    { icon: 'timer', color: '#FF9800', gradient: ['#FF9800', '#F57C00'], label: 'Timesheet', screen: 'Timesheet' },
    { icon: 'event', color: '#9C27B0', gradient: ['#9C27B0', '#7B1FA2'], label: 'Schedule', screen: 'Schedule' },
    { icon: 'chatbubbles', color: '#00BCD4', gradient: ['#00BCD4', '#0097A7'], label: 'Chat', screen: 'ChatList', IconSet: Ionicons },
    { icon: 'map', color: '#4CAF50', gradient: ['#4CAF50', '#388E3C'], label: 'Crew', screen: 'CrewTracking', IconSet: Ionicons },
    { icon: 'folder', color: '#9C27B0', gradient: ['#9C27B0', '#7B1FA2'], label: 'Folders', screen: 'Folders', needsProject: false, IconSet: MaterialIcons },
  ];

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadData} tintColor="#00D4FF" />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#1A1A2E', '#0A0A0A']} style={styles.pulseBar}>
          <View style={styles.pulseItem}>
            <View style={styles.pulseDot} />
            <Text style={styles.pulseValue}>{livePulse.activeWorkers}</Text>
            <Text style={styles.pulseLabel}>Active</Text>
          </View>
          <View style={styles.pulseDivider} />
          <View style={styles.pulseItem}>
            <Text style={styles.pulseValue}>{livePulse.activeProjects}</Text>
            <Text style={styles.pulseLabel}>Projects</Text>
          </View>
          <View style={styles.pulseDivider} />
          <View style={styles.pulseItem}>
            <Text style={styles.pulseValue}>${livePulse.revenueToday}</Text>
            <Text style={styles.pulseLabel}>Today</Text>
          </View>
        </LinearGradient>

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient colors={['#00D4FF', '#007AFF']} style={styles.avatarGradient}>
              <Text style={styles.avatarText}>
                {user?.firstName?.charAt(0).toUpperCase()}{user?.lastName?.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
            <View>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.role}>{t(`role_${user?.role}`)}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <MaterialIcons name="logout" size={22} color="#888" />
          </TouchableOpacity>
        </View>

        {aiSuggestions.length > 0 && (
          <TouchableOpacity style={styles.aiWhisper} onPress={() => dismissSuggestion(aiSuggestions[0].id)}>
            <MaterialIcons name="psychology" size={18} color="#00D4FF" />
            <Text style={styles.aiWhisperText} numberOfLines={1}>{aiSuggestions[0].description}</Text>
            <MaterialIcons name="close" size={16} color="#666" />
          </TouchableOpacity>
        )}

        <View style={[styles.heroClock, isClockedIn && styles.heroClockActive]}>
          {!isClockedIn ? (
            <>
              <Text style={styles.heroTitle}>Start Your Day</Text>
              <Text style={styles.heroSubtitle}>Select project or schedule</Text>

              {/* Segmented Control */}
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[styles.segment, selectionMode === 'project' && styles.segmentActive]}
                  onPress={() => setSelectionMode('project')}
                >
                  <Text style={[styles.segmentText, selectionMode === 'project' && styles.segmentTextActive]}>Project</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, selectionMode === 'schedule' && styles.segmentActive]}
                  onPress={() => setSelectionMode('schedule')}
                >
                  <Text style={[styles.segmentText, selectionMode === 'schedule' && styles.segmentTextActive]}>Schedule</Text>
                </TouchableOpacity>
              </View>

              {/* Project list */}
              {selectionMode === 'project' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectScroll}>
                  {projects.map((p, idx) => (
                    <TouchableOpacity
                      key={p.id || `proj-${idx}`}
                      style={[styles.projectCard, selectedProject?.id === p.id && styles.projectCardActive]}
                      onPress={() => setSelectedProject(p)}
                    >
                      <Text style={[styles.projectCardName, selectedProject?.id === p.id && styles.projectCardNameActive]}>{p.name}</Text>
                      {p.client_name && <Text style={styles.projectCardClient}>{p.client_name}</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Schedule list (today only) */}
              {selectionMode === 'schedule' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scheduleScroll}>
                  {schedules.length === 0 ? (
                    <Text style={styles.noSchedules}>No schedules for today</Text>
                  ) : (
                    schedules.map((s: Shift) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.scheduleCard, selectedSchedule?.id === s.id && styles.scheduleCardActive]}
                        onPress={() => {
                          setSelectedSchedule(s);
                          // Optionally also set selectedProject to the schedule's project for clock-in
                          if (s.project_id) {
                            const proj = projects.find(p => p.id === s.project_id);
                            if (proj) setSelectedProject(proj);
                          }
                        }}
                      >
                        <Text style={styles.scheduleName}>{s.name || 'Untitled'}</Text>
                        <Text style={styles.scheduleDate}>{format(new Date(s.date), 'MMM d')}</Text>
                        <Text style={styles.scheduleProject}>{s.project_name || 'No project'}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              )}

              <TouchableOpacity style={styles.heroClockBtn} onPress={handleClockIn}>
                <LinearGradient colors={['#4CAF50', '#2E7D32']} style={styles.heroClockBtnGradient}>
                  <MaterialIcons name="login" size={28} color="#FFF" />
                  <Text style={styles.heroClockBtnText}>Clock In</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Animated.View style={[styles.timerRing, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.timerRingInner}>
                  <Text style={styles.timerText}>{formatElapsed(elapsedSeconds)}</Text>
                  <Text style={styles.timerProject}>{selectedProject?.name || 'Working'}</Text>
                </View>
              </Animated.View>
              <TouchableOpacity style={styles.heroClockBtn} onPress={handleClockOut}>
                <LinearGradient colors={['#F44336', '#C62828']} style={styles.heroClockBtnGradient}>
                  <MaterialIcons name="logout" size={28} color="#FFF" />
                  <Text style={styles.heroClockBtnText}>Clock Out</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsScroll}>
          {quickActions.map((action, index) => {
            const IconComponent = action.IconSet || MaterialIcons;
            return (
              <TouchableOpacity
                key={index}
                style={styles.actionCard}
                onPress={() => {
                  if (action.needsProject && !selectedProject) { Alert.alert('Select a project first'); return; }
                  navigation.navigate(action.screen, { projectId: selectedProject?.id });
                }}
              >
                <LinearGradient colors={action.gradient as [string, string]} style={styles.actionCardGradient}>
                  <IconComponent name={action.icon as any} size={32} color="#FFF" />
                </LinearGradient>
                <Text style={styles.actionCardLabel}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.moreActions}>
          {[
            { icon: 'groups', color: '#FF9800', label: 'Crew Clock', screen: 'CrewClock' },
            { icon: 'beach-access', color: '#00D4FF', label: 'PTO', screen: 'PTO' },
            { icon: 'work', color: '#FF9800', label: 'Projects', screen: 'Projects' },
            ...(user?.role === 'boss' || user?.role === 'manager' ? [{ icon: 'people', color: '#00D4FF', label: 'Team', screen: 'Team' }] : []),
            { icon: 'person', color: '#00D4FF', label: 'Settings', screen: 'Profile' },
            { icon: 'mail', color: '#00D4FF', label: 'Contact', screen: 'Contact' },
            { icon: 'lock', color: '#4CAF50', label: 'Privacy', screen: 'Privacy' },
            { icon: 'description', color: '#FF9800', label: 'Terms', screen: 'Terms' },
            { icon: 'info', color: '#9C27B0', label: 'About', screen: 'About' },
            { icon: 'verified-user', color: '#00BCD4', label: 'Security', screen: 'Security' },
            { icon: 'headset-mic', color: '#F44336', label: 'Support', screen: 'Support' },
          ].map((action, index) => (
            <TouchableOpacity key={index} style={styles.moreActionBtn} onPress={() => navigation.navigate(action.screen)}>
              <MaterialIcons name={action.icon as any} size={24} color={action.color} />
              <Text style={styles.moreActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.floatingContainer}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: '#9C27B0', marginBottom: 72 }]}
          onPress={() => navigation.navigate('AIAssistant', { autoRecord: true })}
        >
          <Ionicons name="mic" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: '#00D4FF' }]}
          onPress={() => navigation.navigate('AIAssistant')}
        >
          <Ionicons name="chatbubble-ellipses" size={28} color="#0A0A0A" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#0A0A0A' },
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  pulseBar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, marginTop: 60, borderRadius: 16, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1A1A2E' },
  pulseItem: { alignItems: 'center' },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginBottom: 4 },
  pulseValue: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  pulseLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  pulseDivider: { width: 1, height: 30, backgroundColor: '#333' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarGradient: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  greeting: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  role: { fontSize: 12, color: '#00D4FF', marginTop: 2 },
  logoutBtn: { padding: 8 },
  aiWhisper: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 16, backgroundColor: '#1A1A2E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: '#00D4FF20' },
  aiWhisperText: { color: '#CCC', fontSize: 13, flex: 1 },
  heroClock: { marginHorizontal: 20, marginBottom: 24, backgroundColor: '#1A1A1A', borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  heroClockActive: { borderColor: '#4CAF50', borderWidth: 2, backgroundColor: '#0A1A0A' },
  heroTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginBottom: 6 },
  heroSubtitle: { color: '#888', fontSize: 14, marginBottom: 20 },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#0A0A0A', borderRadius: 20, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: '#333' },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 16, alignItems: 'center' },
  segmentActive: { backgroundColor: '#00D4FF' },
  segmentText: { color: '#888', fontSize: 14, fontWeight: '500' },
  segmentTextActive: { color: '#0A0A0A', fontWeight: '600' },
  projectScroll: { maxHeight: 80, marginBottom: 12 },
  projectCard: { backgroundColor: '#0A0A0A', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, marginRight: 10, borderWidth: 1, borderColor: '#444', minWidth: 120 },
  projectCardActive: { borderColor: '#00D4FF', backgroundColor: '#00D4FF10' },
  projectCardName: { color: '#CCC', fontSize: 14, fontWeight: '500' },
  projectCardNameActive: { color: '#00D4FF', fontWeight: '600' },
  projectCardClient: { color: '#888', fontSize: 11, marginTop: 2 },
  scheduleScroll: { maxHeight: 70, marginBottom: 12 },
  scheduleCard: { backgroundColor: '#0A0A0A', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, borderWidth: 1, borderColor: '#444', minWidth: 100 },
  scheduleCardActive: { borderColor: '#00D4FF', backgroundColor: '#00D4FF10' },
  scheduleName: { color: '#FFF', fontSize: 13, fontWeight: '500' },
  scheduleDate: { color: '#00D4FF', fontSize: 11, marginTop: 2 },
  scheduleProject: { color: '#888', fontSize: 10, marginTop: 2 },
  noSchedules: { color: '#666', fontSize: 13, paddingVertical: 6 },
  heroClockBtn: { width: '100%' },
  heroClockBtnGradient: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, borderRadius: 16, gap: 8 },
  heroClockBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  timerRing: { width: 160, height: 160, borderRadius: 80, borderWidth: 4, borderColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  timerRingInner: { alignItems: 'center' },
  timerText: { color: '#FFF', fontSize: 28, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  timerProject: { color: '#4CAF50', fontSize: 13, marginTop: 4 },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', paddingHorizontal: 20, marginBottom: 14 },
  actionsScroll: { paddingHorizontal: 16, marginBottom: 24 },
  actionCard: { alignItems: 'center', marginRight: 16, width: 80 },
  actionCardGradient: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionCardLabel: { color: '#AAA', fontSize: 11, textAlign: 'center' },
  moreActions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12 },
  moreActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: '#333' },
  moreActionLabel: { color: '#CCC', fontSize: 13 },
  floatingContainer: { position: 'absolute', bottom: 40, right: 20, zIndex: 10 },
  fab: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
});

function loadActiveEntry() {
  throw new Error('Function not implemented.');
}
