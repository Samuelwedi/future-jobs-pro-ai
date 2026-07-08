import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { formatDistanceToNow, format } from 'date-fns';

interface ActiveEmployee {
  userId: string;
  firstName: string;
  lastName: string;
  timeEntryId: string;
  clockIn: string;
  latitude: number | null;
  longitude: number | null;
  lastGpsTime: string | null;
  isMoving: boolean;
  geofenceStatus: string;
  projectName: string;
}

export default function CrewClockScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [activeEmployees, setActiveEmployees] = useState<ActiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [officeCity, setOfficeCity] = useState('');

  const fetchCompanyCity = async () => {
    try {
      const res = await api.get<{ office_city: string }>(`/companies/${user?.companyId}`);
      setOfficeCity(res.office_city || '');
    } catch (e) {
      console.error('Failed to fetch company city:', e);
    }
  };

  const fetchActiveEmployees = async () => {
    try {
      const res = await api.get<{ success: boolean; count: number; employees: ActiveEmployee[] }>(
        `/gps/active/${user?.companyId}`
      );
      setActiveEmployees(res.employees || []);
    } catch (e) {
      console.error('Failed to fetch active employees:', e);
      Alert.alert('Error', 'Could not load active employees');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCompanyCity();
    fetchActiveEmployees();
  }, []);

  const formatClockInTime = (clockIn: string) => {
    try {
      const date = new Date(clockIn);
      return format(date, 'h:mm a') + ' (' + formatDistanceToNow(date, { addSuffix: true }) + ')';
    } catch {
      return clockIn;
    }
  };

  const handleForceClockOut = async (userId: string, timeEntryId: string) => {
    Alert.alert(
      'Force Clock Out',
      'Are you sure you want to clock out this employee?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/crew/clock-out', { userId, timeEntryId });
              Alert.alert('✅ Clocked Out', 'Employee has been clocked out.');
              fetchActiveEmployees();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to clock out');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: ActiveEmployee }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.isMoving ? '#4CAF50' : '#FF9800' }]}>
          <Text style={styles.statusText}>{item.isMoving ? 'Moving' : 'Stationary'}</Text>
        </View>
      </View>
      <Text style={styles.project}>{item.projectName}</Text>
      <Text style={styles.clockIn}>Clocked in: {formatClockInTime(item.clockIn)}</Text>
      {item.latitude && item.longitude && (
        <Text style={styles.location}>📍 {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</Text>
      )}
      <TouchableOpacity
        style={styles.clockOutBtn}
        onPress={() => handleForceClockOut(item.userId, item.timeEntryId)}
      >
        <MaterialIcons name="logout" size={20} color="#FFF" />
        <Text style={styles.clockOutText}>Clock Out</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Crew Clock</Text>
          <Text style={styles.headerSubtitle}>
            {officeCity ? `📍 ${officeCity} • ` : ''}{activeEmployees.length} currently clocked in
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={activeEmployees}
        renderItem={renderItem}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchActiveEmployees(); }} tintColor="#00D4FF" />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="people-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>No one is currently clocked in</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 4 },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  project: { color: '#00D4FF', fontSize: 14, marginBottom: 4 },
  clockIn: { color: '#AAA', fontSize: 13, marginBottom: 4 },
  location: { color: '#888', fontSize: 12, marginBottom: 12 },
  clockOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  clockOutText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12 },
});