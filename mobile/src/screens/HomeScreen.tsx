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
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [livePulse, setLivePulse] = useState({ activeWorkers: 0, activeProjects: 0, revenueToday: 0 });

  // ─── Derived clocked‑in status ───
  const isClockedIn = activeTimeEntry !== null;

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

  // ─── Timer update ───
  useEffect(() => {
    if (isClockedIn && activeTimeEntry?.clock_in) {
      const startTime = new Date(activeTimeEntry.clock_in);
      if (isNaN(startTime.getTime())) {
        console.error('Invalid clock_in date:', activeTimeEntry.clock_in);
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

  // ─── GPS tracking ───
  useEffect(() => {
    if (isClockedIn && activeTimeEntry) {
      gpsIntervalRef.current = setInterval(async () => {
        try {
          const location = await Location.getCurrentPositionAsync({});
          await api.post('/gps/update', {
            userId: user?.id,
            timeEntryId: activeTimeEntry.id,
            projectId: activeTimeEntry.project_id,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            altitude: location.coords.altitude,
            speed: location.coords.speed,
            heading: location.coords.heading,
          });
        } catch (e) {
          console.error('GPS update error:', e);
        }
      }, 10000);
    } else {
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
    }
    return () => {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
    };
  }, [isClockedIn, activeTimeEntry]);

  // ─── Load functions ───
  const loadData = async () => {
    try {
      const res = await api.get<any>('/projects');
      const loadedProjects = res.projects || [];
      setProjects(loadedProjects);
      setSelectedProject((current: any) => current || loadedProjects[0] || null);
      setLivePulse(prev => ({ ...prev, activeProjects: loadedProjects.length }));
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
      const todayUTC = new Date().toISOString().split('T')[0];
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

  const loadActiveEntry = async () => {
    try {
      const res: any = await api.get(`/time-entries/active?userId=${user?.id}`);
      const data = res.data || res;
      if (data.success && data.entry) {
        setActiveTimeEntry(data.entry);
        const clockInTime = new Date(data.entry.clock_in).getTime();
        const now = Date.now();
        setElapsedSeconds(Math.floor((now - clockInTime) / 1000));
      } else {
        setActiveTimeEntry(null);
        setElapsedSeconds(0);
      }
    } catch (e) {
      console.error('Failed to fetch active time entry', e);
    }
  };

  useFocusEffect(useCallback(() => {
    loadData();
    loadSchedules();
    loadAISuggestions();
    loadActiveEntry();
  }, []));

  // ─── Clock In/Out ───
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
        projectId,
        latitude: currentLocation?.coords.latitude || 0,
        longitude: currentLocation?.coords.longitude || 0
      };
      const res = await api.post<any>('/time-entries/clock-in', payload);
      setActiveTimeEntry({ ...res, clock_in: res.clockIn });
      await loadActiveEntry();
      Alert.alert('✅ Clocked In', 'You have clocked in successfully.');
    } catch (e: any) {
      if (e.response?.status === 400 && e.response?.data?.message?.includes('Already clocked in')) {
        Alert.alert('Already Clocked In', 'You are already clocked in. Refreshing status...');
        await loadActiveEntry();
      } else {
        Alert.alert('Error', e.message || 'Clock-in failed');
      }
    }
  };

  const handleClockOut = async () => {
    if (!activeTimeEntry) {
      Alert.alert('Error', 'No active time entry');
      return;
    }
    try {
      await api.post('/time-entries/clock-out', {
        timeEntryId: activeTimeEntry.id,
        latitude: currentLocation?.coords.latitude || 0,
        longitude: currentLocation?.coords.longitude || 0
      });
      setActiveTimeEntry(null);
      setElapsedSeconds(0);
      await api.recordAIEvent('clock_out', { timeEntryId: activeTimeEntry.id });
      Alert.alert('Clocked Out', 'Your time entry has been saved.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
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

  // ─── Quick Action handler (smart project selection) ───
  const handleQuickAction = (action: any) => {
    let projectId = null;
    let timeEntryId = null;

    if (action.needsProject) {
      // If clocked in, use the active project/time entry
      if (isClockedIn && activeTimeEntry) {
        projectId = activeTimeEntry.project_id;
        timeEntryId = activeTimeEntry.id;
      } else if (selectedProject) {
        projectId = selectedProject.id;
      } else {
        Alert.alert('Select a project first');
        return;
      }
    }

    navigation.navigate(action.screen, {
      projectId,
      timeEntryId,
      // Pass any extra params if needed
    });
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

  const todayLabel = format(new Date(), 'EEEE, MMMM d');
  const firstProject = selectedProject || projects[0];
  const primaryShift = selectedSchedule || schedules[0];
  const readinessItems = [
    { icon: 'location-on', label: currentLocation ? 'Location ready' : 'Locating…', color: currentLocation ? '#34D399' : '#FBBF24' },
    { icon: 'event-available', label: `${schedules.length} shift${schedules.length === 1 ? '' : 's'} today`, color: '#67E8F9' },
    { icon: 'folder-open', label: `${projects.length} active project${projects.length === 1 ? '' : 's'}`, color: '#C4B5FD' },
  ];

  return (
    <View style={investorStyles.screen}>
      <LinearGradient colors={['#071827', '#050A12', '#03070C']} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={investorStyles.scrollContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { loadData(); loadSchedules(); loadAISuggestions(); loadActiveEntry(); }} tintColor="#67E8F9" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={investorStyles.topBar}>
          <View style={investorStyles.identity}>
            <LinearGradient colors={['#67E8F9', '#2563EB']} style={investorStyles.avatar}>
              <Text style={investorStyles.avatarText}>{user?.firstName?.charAt(0).toUpperCase()}{user?.lastName?.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
            <View>
              <Text style={investorStyles.date}>{todayLabel.toUpperCase()}</Text>
              <Text style={investorStyles.greeting}>{greeting}</Text>
            </View>
          </View>
          <TouchableOpacity accessibilityLabel="Open profile" style={investorStyles.profileButton} onPress={() => navigation.navigate('Profile')}>
            <MaterialIcons name="tune" size={20} color="#C7D3DE" />
          </TouchableOpacity>
        </View>

        <LinearGradient colors={isClockedIn ? ['#123B34', '#0A2726', '#08131F'] : ['#123B55', '#0A2235', '#08131F']} style={investorStyles.heroCard}>
          <View style={investorStyles.heroTopRow}>
            <View style={[investorStyles.statusPill, isClockedIn && investorStyles.statusPillActive]}>
              <View style={[investorStyles.statusDot, isClockedIn && investorStyles.statusDotActive]} />
              <Text style={[investorStyles.statusText, isClockedIn && investorStyles.statusTextActive]}>{isClockedIn ? 'SHIFT IN PROGRESS' : 'READY FOR THE DAY'}</Text>
            </View>
            <MaterialIcons name={isClockedIn ? 'verified' : 'shield'} size={20} color={isClockedIn ? '#A7F3D0' : '#67E8F9'} />
          </View>

          {isClockedIn ? (
            <>
              <Text style={investorStyles.heroEyebrow}>CURRENT SESSION</Text>
              <Text style={investorStyles.liveTimer}>{formatElapsed(elapsedSeconds)}</Text>
              <Text style={investorStyles.heroTitle}>{activeTimeEntry.project_name || firstProject?.name || 'Work in progress'}</Text>
              <Text style={investorStyles.heroCopy}>Time and location evidence are being recorded for this session.</Text>
              <View style={investorStyles.sessionSignals}>
                <View style={investorStyles.signal}><MaterialIcons name="my-location" size={16} color="#A7F3D0" /><Text style={investorStyles.signalText}>GPS connected</Text></View>
                <View style={investorStyles.signal}><MaterialIcons name="lock-clock" size={16} color="#A7F3D0" /><Text style={investorStyles.signalText}>Evidence live</Text></View>
              </View>
              <TouchableOpacity style={investorStyles.clockOutButton} onPress={handleClockOut}><MaterialIcons name="stop-circle" size={21} color="#FFF" /><Text style={investorStyles.clockOutText}>Finish shift</Text></TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={investorStyles.heroEyebrow}>YOUR WORKDAY</Text>
              <Text style={investorStyles.heroTitle}>Everything ready.{`\n`}Start with confidence.</Text>
              <Text style={investorStyles.heroCopy}>Choose today’s project or scheduled shift. Future Jobs will connect time, GPS, media, and job context automatically.</Text>
              <View style={investorStyles.modeSwitch}>
                <TouchableOpacity style={[investorStyles.modeButton, selectionMode === 'project' && investorStyles.modeButtonActive]} onPress={() => setSelectionMode('project')}><Text style={[investorStyles.modeText, selectionMode === 'project' && investorStyles.modeTextActive]}>Projects</Text></TouchableOpacity>
                <TouchableOpacity style={[investorStyles.modeButton, selectionMode === 'schedule' && investorStyles.modeButtonActive]} onPress={() => setSelectionMode('schedule')}><Text style={[investorStyles.modeText, selectionMode === 'schedule' && investorStyles.modeTextActive]}>Today’s schedule</Text></TouchableOpacity>
              </View>

              {selectionMode === 'project' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={investorStyles.selectorScroll}>
                  {projects.length === 0 ? <Text style={investorStyles.emptySelector}>No active projects</Text> : projects.map((project, index) => {
                    const selected = selectedProject?.id === project.id || (!selectedProject && index === 0);
                    return <TouchableOpacity key={project.id || index} onPress={() => setSelectedProject(project)} style={[investorStyles.selectorCard, selected && investorStyles.selectorCardActive]}><View style={[investorStyles.selectorIcon, selected && investorStyles.selectorIconActive]}><MaterialIcons name="business-center" size={18} color={selected ? '#06121D' : '#67E8F9'} /></View><Text numberOfLines={1} style={[investorStyles.selectorTitle, selected && investorStyles.selectorTitleActive]}>{project.name}</Text><Text numberOfLines={1} style={investorStyles.selectorMeta}>{project.client_name || 'Active project'}</Text></TouchableOpacity>;
                  })}
                </ScrollView>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={investorStyles.selectorScroll}>
                  {schedules.length === 0 ? <Text style={investorStyles.emptySelector}>No scheduled shifts today</Text> : schedules.map((shift) => {
                    const selected = selectedSchedule?.id === shift.id;
                    return <TouchableOpacity key={shift.id} onPress={() => { setSelectedSchedule(shift); if (shift.project_id) setSelectedProject(projects.find(p => p.id === shift.project_id)); }} style={[investorStyles.selectorCard, selected && investorStyles.selectorCardActive]}><View style={[investorStyles.selectorIcon, selected && investorStyles.selectorIconActive]}><MaterialIcons name="event" size={18} color={selected ? '#06121D' : '#67E8F9'} /></View><Text numberOfLines={1} style={[investorStyles.selectorTitle, selected && investorStyles.selectorTitleActive]}>{shift.name || 'Scheduled shift'}</Text><Text numberOfLines={1} style={investorStyles.selectorMeta}>{shift.start_time} · {shift.project_name || 'Project'}</Text></TouchableOpacity>;
                  })}
                </ScrollView>
              )}
              <TouchableOpacity style={investorStyles.clockInButton} onPress={handleClockIn}>
                <LinearGradient colors={['#67E8F9', '#22D3EE']} style={investorStyles.clockInGradient}><View style={investorStyles.clockIcon}><MaterialIcons name="play-arrow" size={21} color="#06121D" /></View><Text style={investorStyles.clockInText}>Start verified shift</Text><MaterialIcons name="arrow-forward" size={20} color="#06121D" /></LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </LinearGradient>

        <View style={investorStyles.readinessRow}>
          {readinessItems.map((item) => <View key={item.label} style={investorStyles.readinessItem}><MaterialIcons name={item.icon as any} size={17} color={item.color} /><Text style={investorStyles.readinessText} numberOfLines={1}>{item.label}</Text></View>)}
        </View>

        <View style={investorStyles.sectionHeader}><View><Text style={investorStyles.sectionEyebrow}>LUCY · WORKSPACE INTELLIGENCE</Text><Text style={investorStyles.sectionTitle}>Your next best move</Text></View><TouchableOpacity onPress={() => navigation.navigate('AIAssistant')}><Text style={investorStyles.viewAll}>Open Lucy</Text></TouchableOpacity></View>
        <LinearGradient colors={['#2A2050', '#151225']} style={investorStyles.lucyCard}>
          <View style={investorStyles.lucyTop}>
            <LinearGradient colors={['#C4B5FD', '#8B5CF6']} style={investorStyles.lucyOrb}><MaterialIcons name="graphic-eq" size={26} color="#181027" /></LinearGradient>
            <View style={investorStyles.lucyHeading}><View style={investorStyles.lucyNameRow}><Text style={investorStyles.lucyName}>Lucy</Text><View style={investorStyles.memoryPill}><View style={investorStyles.memoryDot} /><Text style={investorStyles.memoryText}>CONTEXT ON</Text></View></View><Text style={investorStyles.lucyMeta}>Connected across your workspace</Text></View>
          </View>
          <Text style={investorStyles.lucyBrief}>{aiSuggestions[0]?.description || (primaryShift ? `You have ${schedules.length} scheduled shift${schedules.length === 1 ? '' : 's'} today. I can brief you on priorities and conflicts.` : 'I can summarize active work, find exceptions, and prepare your next actions for approval.')}</Text>
          <View style={investorStyles.lucyActions}>
            <TouchableOpacity style={investorStyles.lucyPrimary} onPress={() => navigation.navigate('AIAssistant')}><MaterialIcons name="auto-awesome" size={17} color="#181027" /><Text style={investorStyles.lucyPrimaryText}>Brief my day</Text></TouchableOpacity>
            <TouchableOpacity style={investorStyles.lucyVoice} onPress={() => navigation.navigate('AIAssistant', { autoRecord: true })}><MaterialIcons name="mic" size={20} color="#DDD6FE" /></TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={investorStyles.sectionHeader}><View><Text style={investorStyles.sectionEyebrow}>CAPTURE THE WORK</Text><Text style={investorStyles.sectionTitle}>Create trusted evidence</Text></View></View>
        <View style={investorStyles.captureGrid}>
          {[
            { icon: 'photo-camera', label: 'Site photo', meta: 'AI review', color: '#67E8F9', screen: 'Camera' },
            { icon: 'mic', label: 'Voice note', meta: 'Audio + text', color: '#A7F3D0', screen: 'VoiceNote' },
            { icon: 'route', label: 'GPS trail', meta: 'Verified path', color: '#FDE68A', screen: 'GPSPlayback' },
            { icon: 'folder-copy', label: 'Job files', meta: 'Media + docs', color: '#C4B5FD', screen: 'Folders' },
          ].map((action) => (
            <TouchableOpacity key={action.label} style={investorStyles.captureCard} onPress={() => action.screen === 'Camera' || action.screen === 'VoiceNote' ? handleQuickAction({ ...action, needsProject: true }) : navigation.navigate(action.screen)}>
              <View style={[investorStyles.captureIcon, { backgroundColor: `${action.color}18` }]}><MaterialIcons name={action.icon as any} size={23} color={action.color} /></View>
              <Text style={investorStyles.captureTitle}>{action.label}</Text><Text style={investorStyles.captureMeta}>{action.meta}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={investorStyles.sectionHeader}><View><Text style={investorStyles.sectionEyebrow}>YOUR WORKSPACE</Text><Text style={investorStyles.sectionTitle}>Run the operation</Text></View></View>
        <View style={investorStyles.workspaceCard}>
          {[
            ['Projects', 'work', 'Projects', `${projects.length} active`], ['Schedule', 'calendar-month', 'Schedule', `${schedules.length} today`],
            ['Timesheet', 'schedule', 'Timesheet', 'Review time'], ['Team', 'groups', 'Team', 'People & pay'],
            ['Messages', 'forum', 'ChatList', 'Crew chat'], ['Support', 'support-agent', 'Support', 'Customer care'],
          ].filter(([label]) => label !== 'Team' || user?.role === 'boss' || user?.role === 'manager').map(([label, icon, screen, meta], index, list) => (
            <TouchableOpacity key={label} style={[investorStyles.workspaceRow, index === list.length - 1 && investorStyles.workspaceRowLast]} onPress={() => navigation.navigate(screen)}>
              <View style={investorStyles.workspaceIcon}><MaterialIcons name={icon as any} size={20} color="#8FDFF0" /></View><View style={investorStyles.workspaceCopy}><Text style={investorStyles.workspaceTitle}>{label}</Text><Text style={investorStyles.workspaceMeta}>{meta}</Text></View><MaterialIcons name="chevron-right" size={23} color="#52677A" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={investorStyles.footerRow}>{(user?.role === 'boss' || user?.role === 'manager') && <><TouchableOpacity onPress={() => navigation.navigate('CompanySettings')}><Text style={investorStyles.footerLink}>Company settings</Text></TouchableOpacity><View style={investorStyles.footerDot} /></>}<TouchableOpacity onPress={logout}><Text style={investorStyles.footerLink}>Sign out</Text></TouchableOpacity></View>
      </ScrollView>
    </View>
  );

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

        <LinearGradient colors={['#0E7490', '#155E75', '#101827']} style={styles.commandDeck}>
          <View style={styles.commandDeckTop}>
            <View>
              <Text style={styles.commandEyebrow}>TODAY'S COMMAND DECK</Text>
              <Text style={styles.commandTitle}>Stay ahead of the field</Text>
            </View>
            <View style={styles.commandLive}><View style={styles.commandLiveDot} /><Text style={styles.commandLiveText}>LIVE</Text></View>
          </View>
          <Text style={styles.commandText}>Lucy can summarize active work, surface exceptions, and prepare the next action for your approval.</Text>
          <View style={styles.commandButtons}>
            <TouchableOpacity style={styles.commandPrimary} onPress={() => navigation.navigate('AIAssistant')}>
              <MaterialIcons name="auto-awesome" size={18} color="#07111F" /><Text style={styles.commandPrimaryText}>Brief me</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.commandSecondary} onPress={() => navigation.navigate('Support')}>
              <MaterialIcons name="support-agent" size={18} color="#CFFAFE" /><Text style={styles.commandSecondaryText}>Customer care</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

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

              <TouchableOpacity style={styles.clockInBtn} onPress={handleClockIn}>
                <MaterialIcons name="login" size={20} color="#0A0A0A" />
                <Text style={styles.clockBtnText}>Clock In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Animated.View style={[styles.timerRing, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.timerRingInner}>
                  <Text style={styles.timerText}>{formatElapsed(elapsedSeconds)}</Text>
                  <Text style={styles.timerProject}>{selectedProject?.name || activeTimeEntry.project_name || 'Working'}</Text>
                </View>
              </Animated.View>
              <TouchableOpacity style={styles.clockOutBtn} onPress={handleClockOut}>
                <MaterialIcons name="logout" size={20} color="#FFF" />
                <Text style={styles.clockBtnText}>Clock Out</Text>
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
                onPress={() => handleQuickAction(action)}
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
            // 👇 Added Company Settings – only for boss/manager
            ...(user?.role === 'boss' || user?.role === 'manager' ? [{ icon: 'settings', color: '#00D4FF', label: 'Company Settings', screen: 'CompanySettings' }] : []),
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
  commandDeck: { marginHorizontal: 20, marginBottom: 16, borderRadius: 22, padding: 19, borderWidth: 1, borderColor: '#67E8F933' },
  commandDeckTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  commandEyebrow: { color: '#A5F3FC', fontSize: 9, letterSpacing: 1.4, fontWeight: '900' },
  commandTitle: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 5 },
  commandLive: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#052E2B', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  commandLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34D399' },
  commandLiveText: { color: '#6EE7B7', fontSize: 9, letterSpacing: 1, fontWeight: '900' },
  commandText: { color: '#C8E7EF', fontSize: 13, lineHeight: 19, marginTop: 11 },
  commandButtons: { flexDirection: 'row', gap: 9, marginTop: 16 },
  commandPrimary: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#67E8F9', paddingVertical: 11, borderRadius: 12 },
  commandPrimaryText: { color: '#07111F', fontWeight: '900', fontSize: 13 },
  commandSecondary: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#083344', paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: '#0E7490' },
  commandSecondaryText: { color: '#CFFAFE', fontWeight: '800', fontSize: 12 },
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
  clockInBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00D4FF', paddingVertical: 12, borderRadius: 10, gap: 8, width: '100%' },
  clockOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5722', paddingVertical: 12, borderRadius: 10, gap: 8, width: '100%' },
  clockBtnText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 },
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

const investorStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#03070C' },
  scrollContent: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 54 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  avatarText: { color: '#06121D', fontSize: 16, fontWeight: '900' },
  date: { color: '#6E8398', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  greeting: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', marginTop: 3 },
  profileButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#0D1824', borderWidth: 1, borderColor: '#1B3044', alignItems: 'center', justifyContent: 'center' },
  heroCard: { borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#2C4E63', overflow: 'hidden' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: '#082B3C' },
  statusPillActive: { backgroundColor: '#113A32' },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22D3EE' },
  statusDotActive: { backgroundColor: '#34D399' },
  statusText: { color: '#A5F3FC', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  statusTextActive: { color: '#A7F3D0' },
  heroEyebrow: { color: '#67E8F9', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 22 },
  heroTitle: { color: '#F8FAFC', fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7, marginTop: 7 },
  heroCopy: { color: '#ABC0CF', fontSize: 12, lineHeight: 19, marginTop: 9 },
  liveTimer: { color: '#F8FAFC', fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1.5, marginTop: 7 },
  sessionSignals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#071B19', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#1D5548' },
  signalText: { color: '#B7E4D6', fontSize: 10, fontWeight: '700' },
  modeSwitch: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: '#07131E', borderWidth: 1, borderColor: '#1B3447', marginTop: 19 },
  modeButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11 },
  modeButtonActive: { backgroundColor: '#E6FBFF' },
  modeText: { color: '#7E93A6', fontSize: 11, fontWeight: '800' },
  modeTextActive: { color: '#06121D' },
  selectorScroll: { marginTop: 13, marginBottom: 2 },
  selectorCard: { width: 152, padding: 12, marginRight: 9, borderRadius: 16, backgroundColor: '#07131EAA', borderWidth: 1, borderColor: '#1E3A4C' },
  selectorCardActive: { backgroundColor: '#E6FBFF', borderColor: '#B9F4FC' },
  selectorIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D2A3A', marginBottom: 10 },
  selectorIconActive: { backgroundColor: '#67E8F9' },
  selectorTitle: { color: '#E4EDF4', fontSize: 12, fontWeight: '900' },
  selectorTitleActive: { color: '#06121D' },
  selectorMeta: { color: '#71889C', fontSize: 9, marginTop: 4 },
  emptySelector: { color: '#8194A7', fontSize: 11, paddingVertical: 18 },
  clockInButton: { marginTop: 17, borderRadius: 15, overflow: 'hidden' },
  clockInGradient: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 15 },
  clockIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF66' },
  clockInText: { color: '#06121D', fontSize: 13, fontWeight: '900', flex: 1, marginLeft: 10 },
  clockOutButton: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: '#E14B48' },
  clockOutText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  readinessRow: { flexDirection: 'row', gap: 7, marginTop: 11 },
  readinessItem: { flex: 1, minHeight: 55, justifyContent: 'center', backgroundColor: '#09131D', borderRadius: 14, padding: 9, borderWidth: 1, borderColor: '#172A3C' },
  readinessText: { color: '#9AACBC', fontSize: 8, fontWeight: '700', marginTop: 5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 27, marginBottom: 12 },
  sectionEyebrow: { color: '#688096', fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  sectionTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '900', letterSpacing: -0.3, marginTop: 4 },
  viewAll: { color: '#67E8F9', fontSize: 10, fontWeight: '800' },
  lucyCard: { padding: 18, borderRadius: 23, borderWidth: 1, borderColor: '#493B77' },
  lucyTop: { flexDirection: 'row', alignItems: 'center' },
  lucyOrb: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  lucyHeading: { flex: 1, marginLeft: 12 },
  lucyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  lucyName: { color: '#F5F3FF', fontSize: 17, fontWeight: '900' },
  lucyMeta: { color: '#958BAE', fontSize: 9, marginTop: 3 },
  memoryPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#211A36', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  memoryDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#A78BFA' },
  memoryText: { color: '#C4B5FD', fontSize: 7, fontWeight: '900' },
  lucyBrief: { color: '#D7D1E5', fontSize: 12, lineHeight: 19, marginTop: 14 },
  lucyActions: { flexDirection: 'row', gap: 9, marginTop: 15 },
  lucyPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#C4B5FD', borderRadius: 13, paddingVertical: 12 },
  lucyPrimaryText: { color: '#181027', fontSize: 11, fontWeight: '900' },
  lucyVoice: { width: 45, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2243', borderWidth: 1, borderColor: '#514371' },
  captureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  captureCard: { width: (SCREEN_WIDTH - 45) / 2, backgroundColor: '#09131D', borderRadius: 19, padding: 15, borderWidth: 1, borderColor: '#172A3C' },
  captureIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  captureTitle: { color: '#EAF1F6', fontSize: 12, fontWeight: '900', marginTop: 12 },
  captureMeta: { color: '#72879A', fontSize: 9, marginTop: 3 },
  workspaceCard: { backgroundColor: '#09131D', borderRadius: 22, paddingHorizontal: 15, borderWidth: 1, borderColor: '#172A3C' },
  workspaceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#152637' },
  workspaceRowLast: { borderBottomWidth: 0 },
  workspaceIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D2433' },
  workspaceCopy: { flex: 1, marginLeft: 11 },
  workspaceTitle: { color: '#E7EEF4', fontSize: 12, fontWeight: '800' },
  workspaceMeta: { color: '#6F8498', fontSize: 9, marginTop: 2 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 26 },
  footerLink: { color: '#6E8397', fontSize: 10, fontWeight: '700' },
  footerDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#3C5266', marginHorizontal: 10 },
});
