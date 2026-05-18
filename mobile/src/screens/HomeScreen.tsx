import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';

interface AISuggestion {
  id: string;
  title: string;
  description: string;
  priority: string;
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation<any>();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTimeEntry, setActiveTimeEntry] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setCurrentLocation(loc);
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
      loadAISuggestions();
    }, [])
  );

  const loadData = async () => {
    try {
      const res = await api.get<any>('/projects/active');
      setProjects(res.projects || []);
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setIsLoading(false);
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

  const handleClockIn = async () => {
    if (!selectedProject) {
      Alert.alert('Select Project', 'Please select a project first');
      return;
    }
    try {
      const payload: any = {
        userId: user?.id,
        projectId: selectedProject.id,
        latitude: currentLocation?.coords.latitude || 0,
        longitude: currentLocation?.coords.longitude || 0,
      };
      const res = await api.post('/time-entries/clock-in', payload);
      setIsClockedIn(true);
      setActiveTimeEntry(res);
      await api.recordAIEvent('clock_in', { projectId: selectedProject.id });
      Alert.alert('✅ Clocked In', `You're now on the clock at ${selectedProject.name}`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Clock in failed');
    }
  };

  const handleClockOut = async () => {
    try {
      await api.post('/time-entries/clock-out', {
        userId: user?.id,
        timeEntryId: activeTimeEntry.timeEntryId,
        latitude: currentLocation?.coords.latitude || 0,
        longitude: currentLocation?.coords.longitude || 0,
      });
      setIsClockedIn(false);
      setActiveTimeEntry(null);
      await api.recordAIEvent('clock_out', { timeEntryId: activeTimeEntry.timeEntryId });
      Alert.alert('✅ Clocked Out', 'Great work today!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Clock out failed');
    }
  };

  const dismissSuggestion = async (id: string) => {
    await api.dismissSuggestion(id);
    setAiSuggestions((prev) => prev.filter((s) => s.id !== id));
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={loadData} tintColor="#00D4FF" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.firstName}!</Text>
          <Text style={styles.role}>
            {user?.role === 'employee' ? '👷 Field Technician' : user?.role === 'manager' ? '📋 Manager' : '👑 Boss'}
          </Text>
        </View>
        <TouchableOpacity onPress={logout}>
          <MaterialIcons name="logout" size={24} color="#888" />
        </TouchableOpacity>
      </View>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.sectionTitle}>🤖 AI Suggestions</Text>
          {aiSuggestions.map((s) => (
            <View key={s.id} style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionTitle}>{s.title}</Text>
                <TouchableOpacity onPress={() => dismissSuggestion(s.id)}>
                  <MaterialIcons name="close" size={20} color="#888" />
                </TouchableOpacity>
              </View>
              <Text style={styles.suggestionDesc}>{s.description}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Clock Card */}
      <View style={[styles.clockCard, isClockedIn && styles.clockCardActive]}>
        <Text style={styles.clockCardTitle}>
          {isClockedIn ? '🟢 Currently Working' : '⏰ Ready to Work?'}
        </Text>

        {!isClockedIn && (
          <>
            <Text style={styles.selectLabel}>Select Project</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectList}>
              {projects.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.projectChip, selectedProject?.id === p.id && styles.projectChipSelected]}
                  onPress={() => setSelectedProject(p)}
                >
                  <Text style={[styles.projectChipText, selectedProject?.id === p.id && styles.projectChipTextSelected]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {isClockedIn && activeTimeEntry && (
          <View style={styles.activeInfo}>
            <Text style={styles.activeProjectName}>{selectedProject?.name}</Text>
            <Text style={styles.activeTime}>
              Started: {new Date(activeTimeEntry.clockIn).toLocaleTimeString()}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.clockButton, isClockedIn && styles.clockOutButton]}
          onPress={isClockedIn ? handleClockOut : handleClockIn}
        >
          <Text style={styles.clockButtonText}>
            {isClockedIn ? '🔴 Clock Out' : '🟢 Clock In'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              if (!selectedProject) {
                Alert.alert('Select Project', 'Please select a project first.');
                return;
              }
              navigation.navigate('Camera', { projectId: selectedProject.id });
            }}
          >
            <View style={styles.actionIcon}><MaterialIcons name="photo-camera" size={28} color="#00D4FF" /></View>
            <Text style={styles.actionText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              if (!selectedProject) {
                Alert.alert('Select Project', 'Please select a project first.');
                return;
              }
              navigation.navigate('VoiceNote', { projectId: selectedProject.id });
            }}
          >
            <View style={styles.actionIcon}><FontAwesome5 name="microphone" size={24} color="#4CAF50" /></View>
            <Text style={styles.actionText}>Voice Note</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Projects')}>
            <View style={styles.actionIcon}><MaterialIcons name="work" size={28} color="#FF9800" /></View>
            <Text style={styles.actionText}>Projects</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('History')}>
            <View style={styles.actionIcon}><MaterialIcons name="history" size={28} color="#9C27B0" /></View>
            <Text style={styles.actionText}>History</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  role: { fontSize: 14, color: '#00D4FF', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginBottom: 12 },
  suggestionsContainer: { paddingHorizontal: 20, marginBottom: 20 },
  suggestionCard: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#333' },
  suggestionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  suggestionTitle: { fontSize: 16, fontWeight: '600', color: '#00D4FF' },
  suggestionDesc: { fontSize: 14, color: '#888', lineHeight: 20 },
  clockCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, marginHorizontal: 20, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  clockCardActive: { borderColor: '#4CAF50', borderWidth: 2 },
  clockCardTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginBottom: 16 },
  selectLabel: { fontSize: 14, color: '#888', marginBottom: 8 },
  projectList: { marginBottom: 16 },
  projectChip: { backgroundColor: '#0A0A0A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#444' },
  projectChipSelected: { backgroundColor: '#00D4FF20', borderColor: '#00D4FF' },
  projectChipText: { color: '#888', fontSize: 14 },
  projectChipTextSelected: { color: '#00D4FF', fontWeight: '600' },
  activeInfo: { marginBottom: 16 },
  activeProjectName: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  activeTime: { fontSize: 14, color: '#4CAF50', marginTop: 4 },
  clockButton: { backgroundColor: '#4CAF50', borderRadius: 12, padding: 16, alignItems: 'center' },
  clockOutButton: { backgroundColor: '#F44336' },
  clockButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  quickActions: { paddingHorizontal: 20, marginBottom: 30 },
  actionGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  actionButton: { alignItems: 'center' },
  actionIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#333' },
  actionText: { fontSize: 12, color: '#888' },
});