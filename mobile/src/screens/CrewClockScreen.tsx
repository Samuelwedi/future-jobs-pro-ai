import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface Shift { id: string; name: string; project_name?: string; date: string; start_time: string; end_time: string; assignments?: { user_id: string; user_name: string }[]; }

export default function CrewClockScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTodayShifts = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await api.get<{ success: boolean; shifts: Shift[] }>(`/schedule/shifts?companyId=${user?.companyId}&start=${today}&end=${today}`);
      setShifts(res.shifts || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchTodayShifts(); }, []);

  const handleCrewClockIn = async (shift: Shift) => {
    try { const res = await api.post<{ success: boolean; message: string }>('/crew/clock-in', { shiftId: shift.id }); Alert.alert('✅ Crew Clocked In', res.message); }
    catch (e: any) { Alert.alert('Error', e.message || 'Clock in failed'); }
  };
  const handleCrewClockOut = async (shift: Shift) => {
    try { const res = await api.post<{ success: boolean; message: string }>('/crew/clock-out', { shiftId: shift.id }); Alert.alert('✅ Crew Clocked Out', res.message); }
    catch (e: any) { Alert.alert('Error', e.message || 'Clock out failed'); }
  };

  const renderShift = ({ item }: { item: Shift }) => {
    const assignedCount = item.assignments?.length || 0;
    return (
      <View style={styles.shiftCard}>
        <View style={styles.shiftInfo}>
          <Text style={styles.shiftName}>{item.name}</Text>
          <Text style={styles.shiftProject}>{item.project_name || 'Project'}</Text>
          <Text style={styles.shiftTime}>{item.start_time} – {item.end_time}</Text>
          <Text style={styles.assignedCount}>{assignedCount} worker{assignedCount !== 1 ? 's' : ''} assigned</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.clockInBtn} onPress={() => handleCrewClockIn(item)}>
            <MaterialIcons name="login" size={22} color="#FFF" /><Text style={styles.btnText}>Clock In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clockOutBtn} onPress={() => handleCrewClockOut(item)}>
            <MaterialIcons name="logout" size={22} color="#FFF" /><Text style={styles.btnText}>Clock Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Crew Clock</Text>
          <Text style={styles.headerSubtitle}>Clock in/out your entire crew</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>
      <FlatList data={shifts} renderItem={renderShift} keyExtractor={item => item.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTodayShifts(); }} tintColor="#00D4FF" />} ListEmptyComponent={<Text style={styles.emptyText}>No shifts scheduled for today</Text>} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 4 },
  list: { padding: 16, paddingBottom: 40 },
  shiftCard: { backgroundColor: '#1A1A1A', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#333' },
  shiftInfo: { marginBottom: 14 },
  shiftName: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  shiftProject: { color: '#00D4FF', fontSize: 14, marginTop: 4 },
  shiftTime: { color: '#AAA', fontSize: 14, marginTop: 4 },
  assignedCount: { color: '#888', fontSize: 13, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 12 },
  clockInBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#4CAF50', paddingVertical: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', gap: 6 },
  clockOutBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#F44336', paddingVertical: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', gap: 6 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
});