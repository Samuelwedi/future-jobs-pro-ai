import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, Alert, ScrollView
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import MapView, { Marker } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';

interface ActiveEmployee {
  userId: string;
  firstName: string;
  lastName: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string | null;        // last GPS update
  geofenceStatus: 'inside' | 'outside' | 'unknown';
  isMoving: boolean;
  projectName: string;
}

// Cache for reverse-geocoded addresses
const addressCache: Record<string, string> = {};

// Reverse geocode using Nominatim (free, no API key)
const fetchAddress = async (lat: number, lng: number): Promise<string | null> => {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (addressCache[key]) return addressCache[key];
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const response = await fetch(url);
    const data = await response.json();
    if (data && data.display_name) {
      // Cache the full address (truncate if too long)
      const address = data.display_name;
      addressCache[key] = address;
      return address;
    }
    return null;
  } catch (e) {
    console.error('Reverse geocoding error:', e);
    return null;
  }
};

export default function CrewTrackingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<ActiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState<any>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const fetchingRef = useRef<Set<string>>(new Set());

  const fetchActiveEmployees = async () => {
    try {
      const res = await api.get(`/gps/active/${user?.companyId}`) as any;
      const data = res.data || res;
      const employeesList = data.employees || [];
      setEmployees(employeesList);

      // Set map region
      if (employeesList.length > 0) {
        const valid = employeesList.filter((e: ActiveEmployee) => e.latitude && e.longitude);
        if (valid.length > 0) {
          const avgLat = valid.reduce((s: number, e: any) => s + e.latitude, 0) / valid.length;
          const avgLng = valid.reduce((s: number, e: any) => s + e.longitude, 0) / valid.length;
          setRegion({
            latitude: avgLat,
            longitude: avgLng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });
        }
      }

      // Reverse geocode each employee's location
      const newAddresses: Record<string, string> = {};
      for (const emp of employeesList) {
        if (emp.latitude && emp.longitude) {
          const key = `${emp.userId}`;
          // If we already have a cached address for this user's current location, use it.
          // But we need to check if the location changed. We'll use the lat/lng as cache key.
          const coordKey = `${emp.latitude.toFixed(5)},${emp.longitude.toFixed(5)}`;
          if (addressCache[coordKey]) {
            newAddresses[key] = addressCache[coordKey];
          } else if (!fetchingRef.current.has(key)) {
            fetchingRef.current.add(key);
            // Fetch asynchronously
            fetchAddress(emp.latitude, emp.longitude).then(addr => {
              if (addr) {
                setAddresses(prev => ({ ...prev, [key]: addr }));
              }
              fetchingRef.current.delete(key);
            }).catch(() => fetchingRef.current.delete(key));
          }
        }
      }
      setAddresses(prev => ({ ...prev, ...newAddresses }));
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

  // ─── Helper: format duration at location ───
  const getDurationAtLocation = (employee: ActiveEmployee): string => {
    if (!employee.timestamp) return 'No GPS data';
    const lastUpdate = new Date(employee.timestamp);
    const now = new Date();
    const diffSeconds = differenceInSeconds(now, lastUpdate);
    if (diffSeconds < 0) return 'Just now';

    if (employee.isMoving) {
      return 'Moving';
    }

    // Use formatDistanceToNow to show "X minutes ago"
    return formatDistanceToNow(lastUpdate, { addSuffix: true });
  };

  const formatLastUpdate = (timestamp: string | null) => {
    if (!timestamp) return 'No GPS data';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Invalid time';
    }
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
            const address = addresses[emp.userId] || (emp.latitude && emp.longitude
              ? `${emp.latitude.toFixed(5)}, ${emp.longitude.toFixed(5)}`
              : 'Unknown location');

            return (
              <View key={emp.userId} style={styles.employeeItem}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{emp.firstName[0]}{emp.lastName?.[0] || ''}</Text>
                </View>
                <View style={styles.employeeInfo}>
                  <Text style={styles.employeeName}>{name}</Text>
                  <Text style={styles.employeeProject}>{emp.projectName || 'No project'}</Text>
                  <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">
                    📍 {address}
                  </Text>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailText}>
                      {emp.isMoving ? '🚶 Moving' : `⏱ ${duration}`}
                    </Text>
                    <Text style={styles.detailText}>• Updated {lastUpdate}</Text>
                  </View>
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
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 8 },
});