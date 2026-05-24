import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

export default function GPSPlaybackScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { timeEntryId } = route.params;
  const [trail, setTrail] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    api.get<{ success: boolean; trail: { points: any[] } }>(`/gps/trail/${timeEntryId}`)
      .then(res => {
        const pts = res.trail?.points || [];
        setTrail(pts);
        if (pts.length > 1 && mapRef.current) {
          mapRef.current.fitToCoordinates(pts.map(p => ({ latitude: p.latitude, longitude: p.longitude })), { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 } });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GPS Playback</Text>
        <View style={{ width: 24 }} />
      </View>
      {trail.length > 0 ? (
        <MapView ref={mapRef} style={styles.map} initialRegion={{ latitude: trail[0].latitude, longitude: trail[0].longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
          <Polyline coordinates={trail.map(p => ({ latitude: p.latitude, longitude: p.longitude }))} strokeColor="#00D4FF" strokeWidth={4} />
          <Marker coordinate={{ latitude: trail[0].latitude, longitude: trail[0].longitude }} title="Start" pinColor="#4CAF50" />
          {trail.length > 1 && <Marker coordinate={{ latitude: trail[trail.length-1].latitude, longitude: trail[trail.length-1].longitude }} title="End" pinColor="#F44336" />}
        </MapView>
      ) : <Text style={styles.emptyText}>No GPS data for this shift</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
  map: { flex: 1 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
});