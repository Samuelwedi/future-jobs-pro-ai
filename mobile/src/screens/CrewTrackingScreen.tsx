import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface CrewMember {
  user_id: string;
  first_name: string;
  last_name: string;
  latitude: number;
  longitude: number;
  last_update: string;
  geofence_status: string;
  current_project: string | null;
}

export default function CrewTrackingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mapRef = useRef<MapView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCrewLocations = async () => {
    try {
      const res = await api.get<{ success: boolean; employees: CrewMember[] }>(`/gps/active/${user?.companyId}`);
      setCrew(res.employees || []);
      setError('');
    } catch (e) { setError('Could not load crew locations.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchCrewLocations();
    intervalRef.current = setInterval(fetchCrewLocations, 15000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const centerOnCrew = () => {
    if (crew.length === 0) return;
    const coords = crew.filter(m => m.latitude && m.longitude).map(m => ({ latitude: m.latitude, longitude: m.longitude }));
    if (coords.length > 0) mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 80, right: 80, bottom: 200, left: 80 }, animated: true });
  };

  const getStatusColor = (status: string) => status === 'inside' ? '#4CAF50' : status === 'outside' ? '#F44336' : '#888';

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Crew Tracker</Text>
          <Text style={styles.headerSubtitle}>{crew.length} worker{crew.length !== 1 ? 's' : ''} active</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchCrewLocations}><Text style={styles.retryBtnText}>Retry</Text></TouchableOpacity>
        </View>
      ) : (
        <MapView ref={mapRef} style={styles.map} initialRegion={{ latitude: 40.7128, longitude: -74.006, latitudeDelta: 0.1, longitudeDelta: 0.1 }} onMapReady={() => setTimeout(centerOnCrew, 500)}>
          {crew.map(member => (
            <Marker key={member.user_id} coordinate={{ latitude: parseFloat(member.latitude as any), longitude: parseFloat(member.longitude as any) }} pinColor={getStatusColor(member.geofence_status)}>
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutName}>{member.first_name} {member.last_name}</Text>
                  <Text style={styles.calloutStatus}>Status: {member.geofence_status === 'inside' ? 'On site' : 'Outside'}</Text>
                  {member.current_project && <Text style={styles.calloutProject}>Project: {member.current_project}</Text>}
                  <Text style={styles.calloutTime}>Updated: {new Date(member.last_update).toLocaleTimeString()}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}
      <TouchableOpacity style={styles.refreshBtn} onPress={fetchCrewLocations}>
        <MaterialIcons name="refresh" size={28} color="#0A0A0A" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 2 },
  map: { flex: 1 },
  callout: { width: 200, padding: 8 },
  calloutName: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  calloutStatus: { color: '#000', fontSize: 13, marginTop: 4 },
  calloutProject: { color: '#000', fontSize: 13, marginTop: 2 },
  calloutTime: { color: '#000', fontSize: 11, marginTop: 4 },
  refreshBtn: { position: 'absolute', bottom: 40, right: 20, backgroundColor: '#00D4FF', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: '#F44336', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  retryBtn: { backgroundColor: '#00D4FF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  retryBtnText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
});