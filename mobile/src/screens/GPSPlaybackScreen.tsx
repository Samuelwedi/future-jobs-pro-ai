import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, FlatList,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function GPSPlaybackScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { timeEntryId } = route.params || {};
  const [trail, setTrail] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id || '');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const mapRef = useRef<MapView>(null);

  const isBossOrManager = user?.role === 'boss' || user?.role === 'manager';

  // Fetch employees if boss/manager
  useEffect(() => {
    if (isBossOrManager) {
      api.get(`/users/company/${user?.companyId}`)
        .then((res: any) => {
          setEmployees(res.users || []);
        })
        .catch(console.error);
    }
  }, []);

  // Fetch GPS data when selected user changes
  useEffect(() => {
    if (!selectedUserId) return;
    setLoading(true);
    api.get<{ success: boolean; trail: { points: any[] } }>(`/gps/trail/${timeEntryId}?userId=${selectedUserId}`)
      .then(res => {
        const pts = res.trail?.points || [];
        setTrail(pts);
        if (pts.length > 1 && mapRef.current) {
          mapRef.current.fitToCoordinates(
            pts.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
            { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 } }
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedUserId, timeEntryId]);

  const selectedUserName = employees.find(e => e.id === selectedUserId)?.first_name || 'Me';

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GPS Playback</Text>
        {isBossOrManager && (
          <TouchableOpacity onPress={() => setShowUserPicker(true)} style={styles.userPickerBtn}>
            <Text style={styles.userPickerText}>{selectedUserName}</Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#00D4FF" />
          </TouchableOpacity>
        )}
      </View>

      {trail.length > 0 ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: trail[0].latitude,
            longitude: trail[0].longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Polyline
            coordinates={trail.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor="#00D4FF"
            strokeWidth={4}
          />
          <Marker coordinate={{ latitude: trail[0].latitude, longitude: trail[0].longitude }} title="Start" pinColor="#4CAF50" />
          {trail.length > 1 && (
            <Marker
              coordinate={{ latitude: trail[trail.length - 1].latitude, longitude: trail[trail.length - 1].longitude }}
              title="End"
              pinColor="#F44336"
            />
          )}
        </MapView>
      ) : (
        <Text style={styles.emptyText}>No GPS data for this shift</Text>
      )}

      {/* User Picker Modal */}
      <Modal visible={showUserPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Employee</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.employeeRow, selectedUserId === user?.id && styles.employeeRowActive]}
              onPress={() => {
                setSelectedUserId(user?.id || '');
                setShowUserPicker(false);
              }}
            >
              <Text style={styles.employeeName}>Me ({user?.firstName} {user?.lastName})</Text>
              {selectedUserId === user?.id && <MaterialIcons name="check-circle" size={22} color="#00D4FF" />}
            </TouchableOpacity>
            {employees.map(emp => (
              <TouchableOpacity
                key={emp.id}
                style={[styles.employeeRow, selectedUserId === emp.id && styles.employeeRowActive]}
                onPress={() => {
                  setSelectedUserId(emp.id);
                  setShowUserPicker(false);
                }}
              >
                <Text style={styles.employeeName}>{emp.first_name} {emp.last_name}</Text>
                {selectedUserId === emp.id && <MaterialIcons name="check-circle" size={22} color="#00D4FF" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
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
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', flex: 1, marginLeft: 16 },
  userPickerBtn: { flexDirection: 'row', alignItems: 'center' },
  userPickerText: { color: '#00D4FF', fontSize: 16, fontWeight: '600' },
  map: { flex: 1 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  employeeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
  employeeRowActive: { backgroundColor: '#1A3A4A' },
  employeeName: { color: '#FFF', fontSize: 16 },
});