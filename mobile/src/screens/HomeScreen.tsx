import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { formatDuration, intervalToDuration } from 'date-fns';

// ---- Types ----
interface Project {
  id: string;
  name: string;
  client_name?: string;
  address?: string;
  status?: string;
}

interface ActiveTimeEntry {
  id: string;
  project_id: string;
  project_name?: string;
  clock_in: string;
  duration_seconds?: number;
}

// ---- Component ----
export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTimeEntry, setActiveTimeEntry] = useState<ActiveTimeEntry | null>(null);
  const [timer, setTimer] = useState<number>(0);
  const [stats, setStats] = useState({
    activeEmployees: 0,
    projectCount: 0,
    todayEarnings: 0,
  });

  // ---- Fetch projects ----
  const fetchProjects = async () => {
    try {
      const res: any = await api.get('/projects');
      const data = res.data || res;
      const projectList = data.projects || [];
      setProjects(projectList);
      if (projectList.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projectList[0].id);
      }
    } catch (e) {
      console.error('Failed to fetch projects', e);
    }
  };

  // ---- Fetch active clock‑in ----
  const fetchActiveTimeEntry = async () => {
    try {
      const res: any = await api.get(`/time-entries/active?userId=${user?.id}`);
      const data = res.data || res;
      if (data.success && data.entry) {
        setActiveTimeEntry(data.entry);
        const clockInTime = new Date(data.entry.clock_in).getTime();
        const now = Date.now();
        setTimer(Math.floor((now - clockInTime) / 1000));
      } else {
        setActiveTimeEntry(null);
        setTimer(0);
      }
    } catch (e) {
      console.error('Failed to fetch active time entry', e);
    }
  };

  // ---- Fetch stats ----
  const fetchStats = async () => {
    try {
      const res: any = await api.get(`/stats/company/${user?.companyId}`);
      const data = res.data || res;
      if (data.success) {
        setStats({
          activeEmployees: data.stats?.activeEmployees || 0,
          projectCount: data.stats?.projectCount || 0,
          todayEarnings: data.stats?.todayEarnings || 0,
        });
      }
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  };

  // ---- Refresh all data (parallel, non‑blocking) ----
  const refreshData = async () => {
    setRefreshing(true);
    // Use allSettled so one failure doesn't block others
    await Promise.allSettled([
      fetchProjects(),
      fetchActiveTimeEntry(),
      fetchStats(),
    ]);
    setRefreshing(false);
    setLoading(false);
  };

  // ---- Initial load ----
  useEffect(() => {
    refreshData();
  }, []);

  // ---- Timer update ----
  useEffect(() => {
    let interval: number | null = null;
    if (activeTimeEntry) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000) as any;
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimeEntry]);

  // ---- Refresh on focus (fast, background) ----
  useFocusEffect(
    useCallback(() => {
      // These run in the background and don't block UI
      fetchActiveTimeEntry();
      fetchStats();
      return () => {};
    }, [])
  );

  // ---- Clock In ----
  const handleClockIn = async () => {
    if (!selectedProjectId) {
      Alert.alert('Select Project', 'Please select a project before clocking in.');
      return;
    }
    try {
      const res: any = await api.post('/time-entries/clock-in', {
        userId: user?.id,
        projectId: selectedProjectId,
        latitude: 0,
        longitude: 0,
      });
      if (res.success) {
        Alert.alert('✅ Clocked In', 'You have clocked in successfully.');
        await fetchActiveTimeEntry();
        await fetchStats();
      } else {
        Alert.alert('Clock In Failed', res.message || 'Could not clock in');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred');
    }
  };

  // ---- Clock Out ----
  const handleClockOut = async () => {
    if (!activeTimeEntry) return;
    try {
      const res: any = await api.post('/time-entries/clock-out', {
        userId: user?.id,
        timeEntryId: activeTimeEntry.id,
        latitude: 0,
        longitude: 0,
      });
      if (res.success) {
        Alert.alert('✅ Clocked Out', 'You have clocked out successfully.');
        setActiveTimeEntry(null);
        setTimer(0);
        await fetchStats();
      } else {
        Alert.alert('Clock Out Failed', res.message || 'Could not clock out');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred');
    }
  };

  // ---- Format timer ----
  const formatTimer = (seconds: number) => {
    const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
    return formatDuration(duration, { format: ['hours', 'minutes', 'seconds'] }) || '0s';
  };

  // ---- Navigation helpers ----
  const goToSchedule = () => navigation.navigate('Schedule');
  const goToProjects = () => navigation.navigate('Projects');
  const goToTimesheet = () => navigation.navigate('Timesheet');
  const goToPhoto = () => navigation.navigate('Photo');
  const goToVoice = () => navigation.navigate('VoiceNotes');
  const goToCrewClock = () => navigation.navigate('CrewClock');
  const goToPTO = () => navigation.navigate('PTO');
  const goToTeam = () => navigation.navigate('Team');
  const goToSettings = () => navigation.navigate('Settings');
  const goToContact = () => navigation.navigate('Contact');
  const goToPrivacy = () => navigation.navigate('Privacy');
  const goToAbout = () => navigation.navigate('About');
  const goToSecurity = () => navigation.navigate('Security');

  if (loading) {
    return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor="#00D4FF" />}
    >
      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.activeEmployees}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.projectCount}</Text>
          <Text style={styles.statLabel}>Projects</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>${stats.todayEarnings.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
      </View>

      {/* Greeting */}
      <Text style={styles.greeting}>
        Hello, {user?.firstName || 'User'}! 👋 {user?.role === 'boss' ? 'Boss' : ''}
      </Text>

      {/* Start Your Day */}
      <View style={styles.startCard}>
        <Text style={styles.startTitle}>Start Your Day</Text>
        <Text style={styles.startSubtitle}>Select a project and clock in</Text>

        {/* Project Picker */}
        <View style={styles.projectPicker}>
          {projects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={[
                styles.projectOption,
                selectedProjectId === project.id && styles.projectOptionActive,
              ]}
              onPress={() => setSelectedProjectId(project.id)}
            >
              <Text style={[
                styles.projectOptionText,
                selectedProjectId === project.id && styles.projectOptionTextActive,
              ]}>
                {project.name}
              </Text>
              {project.client_name && (
                <Text style={styles.projectClient}>{project.client_name}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Clock In / Out Button */}
        {activeTimeEntry ? (
          <View>
            <TouchableOpacity style={styles.clockOutBtn} onPress={handleClockOut}>
              <MaterialIcons name="logout" size={20} color="#FFF" />
              <Text style={styles.clockBtnText}>Clock Out</Text>
            </TouchableOpacity>
            <View style={styles.timerContainer}>
              <MaterialIcons name="timer" size={20} color="#00D4FF" />
              <Text style={styles.timerText}>{formatTimer(timer)}</Text>
              <Text style={styles.timerProject}>
                {activeTimeEntry.project_name || 'Unknown Project'}
              </Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.clockInBtn} onPress={handleClockIn}>
            <MaterialIcons name="login" size={20} color="#0A0A0A" />
            <Text style={styles.clockBtnText}>Clock In</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Text style={styles.quickTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionItem icon="photo-camera" label="Photo" onPress={goToPhoto} />
          <ActionItem icon="mic" label="Voice" onPress={goToVoice} />
          <ActionItem icon="access-time" label="Timesheet" onPress={goToTimesheet} />
          <ActionItem icon="calendar-today" label="Schedule" onPress={goToSchedule} />
          <ActionItem icon="group" label="Crew Clock" onPress={goToCrewClock} />
          <ActionItem icon="beach-access" label="PTO" onPress={goToPTO} />
          <ActionItem icon="folder" label="Projects" onPress={goToProjects} />
          <ActionItem icon="people" label="Team" onPress={goToTeam} />
        </View>
      </View>

      {/* Bottom Links */}
      <View style={styles.bottomLinks}>
        <LinkItem label="Settings" onPress={goToSettings} />
        <LinkItem label="Contact" onPress={goToContact} />
        <LinkItem label="Privacy" onPress={goToPrivacy} />
        <LinkItem label="About" onPress={goToAbout} />
        <LinkItem label="Security" onPress={goToSecurity} />
      </View>
    </ScrollView>
  );
}

// ---- Reusable components ----
const ActionItem = ({ icon, label, onPress }: any) => (
  <TouchableOpacity style={styles.actionItem} onPress={onPress}>
    <View style={styles.actionIcon}>
      <MaterialIcons name={icon} size={28} color="#00D4FF" />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

const LinkItem = ({ label, onPress }: any) => (
  <TouchableOpacity style={styles.linkItem} onPress={onPress}>
    <Text style={styles.linkText}>{label}</Text>
  </TouchableOpacity>
);

// ---- Styles ----
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statNumber: {
    color: '#00D4FF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  greeting: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  startCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  startTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  startSubtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  projectPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  projectOption: {
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  projectOptionActive: {
    borderColor: '#00D4FF',
    backgroundColor: '#003344',
  },
  projectOptionText: {
    color: '#AAA',
    fontSize: 14,
  },
  projectOptionTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  projectClient: {
    color: '#666',
    fontSize: 12,
  },
  clockInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00D4FF',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  clockOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5722',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  clockBtnText: {
    color: '#0A0A0A',
    fontWeight: 'bold',
    fontSize: 16,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 6,
  },
  timerText: {
    color: '#00D4FF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timerProject: {
    color: '#888',
    fontSize: 14,
    marginLeft: 8,
  },
  quickActions: {
    marginBottom: 24,
  },
  quickTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionItem: {
    width: '23%',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  actionIcon: {
    marginBottom: 4,
  },
  actionLabel: {
    color: '#AAA',
    fontSize: 11,
    textAlign: 'center',
  },
  bottomLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
  },
  linkItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linkText: {
    color: '#888',
    fontSize: 12,
  },
});