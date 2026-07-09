import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, Alert, ScrollView, Linking
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { format, formatDistanceToNow, differenceInSeconds } from 'date-fns';

interface ActiveEmployee {
  userId: string;
  firstName: string;
  lastName: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;        // last GPS update
  geofenceStatus: 'inside' | 'outside' | 'unknown';
  isMoving: boolean;
  projectName: string;
}

export default function CrewTrackingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<ActiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState<any>(null);

  const fetchActiveEmployees = async () => {
    try {
      const res = await api.get(`/gps/active/${user?.companyId}`);
      const data = ((res as any)?.data ?? res) as { employees?: ActiveEmployee[] };
      const employeesList = data.employees || [];
      setEmployees(employeesList);

      if (employeesList.length > 0) {
        const valid = employeesList.filter(e => e.latitude && e.longitude);
        if (valid.length > 0) {
          const avgLat = valid.reduce((s: number, e: any) => s + e.latitude!, 0) / valid.length;
          const avgLng = valid.reduce((s: number, e: any) => s + e.longitude!, 0) / valid.length;
          setRegion({
            latitude: avgLat,
            longitude: avgLng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });
        }
      }
    } catch (e) {
      console.error('Failed to fetch active employees:', e);
      Alert.alert('Error', 'Could not load employee locations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchActiveEmployees();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchActiveEmployees();
  };

  // ─── Helpers ───
  const getDurationAtLocation = (employee: ActiveEmployee): string => {
    if (!employee.timestamp) return 'No GPS data';
    const lastUpdate = new Date(employee.timestamp);
    if (isNaN(lastUpdate.getTime())) return 'Invalid date';
    const now = new Date();
    const diffSeconds = differenceInSeconds(now, lastUpdate);
    if (diffSeconds < 0) return 'Just now';

    if (employee.isMoving) {
      return 'Moving';
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 1) return 'Just arrived';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return `${hours}h ${mins}m ago`;
  };

  const formatLastUpdate = (timestamp: string) => {
    if (!timestamp) return 'No GPS data';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'Invalid date';
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Invalid date';
    }
  };

  const openMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url);
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;
  }

  const activeCount = employees.filter(e => e.latitude && e.longitude).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Crew Tracker</Text>
          <Text style={styles.headerSubtitle}>{activeCount} worker{activeCount !== 1 ? 's' : ''} active</Text>
        </View>
        <TouchableOpacity onPress={onRefresh}>
          <MaterialIcons name="refresh" size={24} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      {region ? (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          region={region}
          showsUserLocation
          showsMyLocationButton
        >
          {employees
            .filter(e => e.latitude && e.longitude)
            .map((employee) => (
              <Marker
                key={employee.userId}
                coordinate={{
                  latitude: employee.latitude!,
                  longitude: employee.longitude!,
                }}
                title={`${employee.firstName} ${employee.lastName}`}
                description={employee.projectName || 'Working'}
                pinColor={employee.geofenceStatus === 'inside' ? '#4CAF50' : '#FF9800'}
              />
            ))}
        </MapView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No active employees to track</Text>
        </View>
      )}

      {/* Employee list overlay */}
      <View style={styles.employeeList}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {employees.map((emp) => {
            const name = `${emp.firstName} ${emp.lastName}`;
            const duration = getDurationAtLocation(emp);
            const lastUpdate = formatLastUpdate(emp.timestamp);
            const hasLocation = emp.latitude && emp.longitude;
            const locationStr = hasLocation
              ? `${emp.latitude!.toFixed(5)}, ${emp.longitude!.toFixed(5)}`
              : 'No location';

            return (
              <View key={emp.userId} style={styles.employeeItem}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{emp.firstName[0]}{emp.lastName?.[0] || ''}</Text>
                </View>
                <View style={styles.employeeInfo}>
                  <Text style={styles.employeeName}>{name}</Text>
                  <Text style={styles.employeeProject}>{emp.projectName || 'No project'}</Text>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailText}>
                      {emp.isMoving ? '🚶 Moving' : `📍 ${duration}`}
                    </Text>
                  </View>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailText}>Updated: {lastUpdate}</Text>
                  </View>
                  {hasLocation && (
                    <TouchableOpacity onPress={() => openMaps(emp.latitude!, emp.longitude!)}>
                      <Text style={styles.addressLink}>📍 {locationStr}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={[styles.statusDot, { backgroundColor: emp.isMoving ? '#4CAF50' : '#FF9800' }]} />
              </View>
            );
          })}
        </ScrollView>
      </View>
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
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 4 },
  map: { flex: 1 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 16 },
  employeeList: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    maxHeight: 200,
    backgroundColor: 'rgba(26,26,26,0.95)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  employeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00D4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  badgeText: { color: '#0A0A0A', fontSize: 14, fontWeight: 'bold' },
  employeeInfo: { flex: 1 },
  employeeName: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  employeeProject: { color: '#00D4FF', fontSize: 12 },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  detailText: { color: '#AAA', fontSize: 11, marginRight: 8 },
  addressLink: { color: '#00D4FF', fontSize: 11, marginTop: 2, textDecorationLine: 'underline' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 8 },
});