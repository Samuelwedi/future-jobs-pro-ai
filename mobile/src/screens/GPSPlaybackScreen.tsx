import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { format, intervalToDuration, formatDuration } from 'date-fns';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface GPSPoint {
  id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
  geofence_status: string;
  is_moving: boolean;
}

interface RouteParams {
  timeEntryId?: string;
}

interface GPSHistoryItem {
  time_entry_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  project_name?: string;
  clock_in: string;
  clock_out?: string;
  point_count: number;
}

export default function GPSPlaybackScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const initialTimeEntryId = (route.params as RouteParams | undefined)?.timeEntryId;

  const [points, setPoints] = useState<GPSPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [mapRegion, setMapRegion] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedTimeEntryId, setSelectedTimeEntryId] = useState<string | undefined>(initialTimeEntryId);
  const [history, setHistory] = useState<GPSHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(!initialTimeEntryId);
  const [employees,setEmployees]=useState<any[]>([]);
  const [selectedUserId,setSelectedUserId]=useState('');

  const playbackInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<MapView>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const speedOptions = [0.5, 1, 2, 4];

  useEffect(() => {
    if (selectedTimeEntryId) fetchGPSTrail(selectedTimeEntryId);
    else fetchHistory();
    return () => {
      if (playbackInterval.current) clearInterval(playbackInterval.current);
    };
  }, [selectedTimeEntryId]);

  const fetchHistory = async (userId=selectedUserId) => {
    setHistoryLoading(true);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86400000);
      const [response,people]=await Promise.all([api.get<{ history: GPSHistoryItem[] }>(
        `/gps/history?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}${userId?`&userId=${encodeURIComponent(userId)}`:''}`
      ),api.get<{employees:any[]}>('/gps/employees')]);
      setHistory(response.history || []);
      setEmployees(people.employees||[]);
    } catch (cause: any) {
      Alert.alert('GPS history unavailable', cause?.response?.data?.message || cause?.message || 'Could not load GPS history.');
    } finally {
      setHistoryLoading(false);
      setLoading(false);
    }
  };

  const fetchGPSTrail = async (timeEntryId: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ trail?: { points: GPSPoint[] } }>(`/gps/trail/${timeEntryId}`);
      const trailPoints = res?.trail?.points || [];
      if (trailPoints.length === 0) {
        Alert.alert('No Data', 'No GPS points found for this shift.');
        setPoints([]);
        setLoading(false);
        return;
      }
      setPoints(trailPoints);
      setCurrentIndex(0);
      const first = trailPoints[0];
      setMapRegion({
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } catch (e) {
      console.error('Error fetching GPS trail:', e);
      Alert.alert('Error', 'Could not load GPS data');
    } finally {
      setLoading(false);
    }
  };

  const animateToPoint = (index: number) => {
    if (!points[index]) return;
    const point = points[index];
    mapRef.current?.animateToRegion({
      latitude: point.latitude,
      longitude: point.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
    if (index % 5 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const togglePlay = () => {
    if (isPlaying) pausePlayback();
    else startPlayback();
  };

  const startPlayback = () => {
    if (currentIndex >= points.length - 1) setCurrentIndex(0);
    setIsPlaying(true);
    playbackInterval.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= points.length) {
          pausePlayback();
          return prev;
        }
        animateToPoint(next);
        return next;
      });
    }, 1000 / playbackSpeed);
  };

  const pausePlayback = () => {
    setIsPlaying(false);
    if (playbackInterval.current) {
      clearInterval(playbackInterval.current);
      playbackInterval.current = null;
    }
  };

  const stepForward = () => {
    if (currentIndex < points.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      animateToPoint(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const stepBackward = () => {
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev);
      animateToPoint(prev);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const changeSpeed = () => {
    const currentIdx = speedOptions.indexOf(playbackSpeed);
    const nextIdx = (currentIdx + 1) % speedOptions.length;
    setPlaybackSpeed(speedOptions[nextIdx]);
    if (isPlaying) {
      pausePlayback();
      startPlayback();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSliderChange = (value: number) => {
    const index = Math.round(value);
    if (index !== currentIndex) {
      setCurrentIndex(index);
      animateToPoint(index);
      if (isPlaying) pausePlayback();
    }
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
    Animated.spring(slideAnim, {
      toValue: showDetails ? 0 : 1,
      useNativeDriver: true,
      speed: 12,
    }).start();
  };

  const formatTimestamp = (ts: string) => {
    try { return format(new Date(ts), 'EEE, MMM d, h:mm:ss a'); } catch { return ts; }
  };

  const getAccuracyColor = (accuracy: number | null) => {
    if (accuracy === null) return '#888';
    if (accuracy <= 33) return '#4CAF50';
    if (accuracy <= 81) return '#FF9800';
    return '#F44336';
  };

  const getAccuracyLabel = (accuracy: number | null) => {
    if (accuracy === null) return 'N/A';
    if (accuracy <= 33) return '✅ High (≤33m)';
    if (accuracy <= 81) return '⚠️ Medium (34–81m)';
    return '❌ Low (>81m)';
  };

  const calculateTotalDistance = (pts: GPSPoint[]) => {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const R = 6371;
      const lat1 = pts[i-1].latitude, lon1 = pts[i-1].longitude;
      const lat2 = pts[i].latitude, lon2 = pts[i].longitude;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      total += R * c;
    }
    return total;
  };

  const totalDistance = points.length > 0 ? calculateTotalDistance(points) : 0;

  if (!selectedTimeEntryId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><MaterialIcons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.headerTitle}>GPS Trail History</Text><Text style={styles.historySubtitle}>Verified routes from the last 30 days</Text></View>
          {historyLoading ? <ActivityIndicator color="#00D4FF" /> : <TouchableOpacity onPress={()=>void fetchHistory()}><MaterialIcons name="refresh" size={23} color="#67E8F9" /></TouchableOpacity>}
        </View>
        <ScrollView contentContainerStyle={styles.historyList}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>{[{id:'',first_name:'All',last_name:'employees'},...employees].map(employee=><TouchableOpacity key={employee.id||'all'} onPress={()=>{setSelectedUserId(employee.id);void fetchHistory(employee.id);}} style={{paddingHorizontal:14,paddingVertical:9,borderRadius:18,marginRight:8,backgroundColor:selectedUserId===employee.id?'#00D4FF':'#172C3E'}}><Text style={{color:selectedUserId===employee.id?'#071018':'#C8D4E2',fontWeight:'800'}}>{employee.first_name} {employee.last_name}</Text></TouchableOpacity>)}</ScrollView>
          {history.length === 0 && !historyLoading ? <View style={styles.historyEmpty}><MaterialIcons name="route" size={52} color="#476079" /><Text style={styles.emptyText}>No recorded GPS trails in the last 30 days.</Text><Text style={styles.historyHint}>Trails appear after an employee clocks in and location points are recorded.</Text></View> : null}
          {history.map(item => (
            <TouchableOpacity key={item.time_entry_id} style={styles.historyCard} onPress={() => { setPoints([]); setCurrentIndex(0); setSelectedTimeEntryId(item.time_entry_id); }}>
              <View style={styles.historyIcon}><MaterialIcons name="route" size={24} color="#67E8F9" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyName}>{item.first_name} {item.last_name}</Text>
                <Text style={styles.historyProject}>{item.project_name || 'Unassigned project'}</Text>
                <Text style={styles.historyTime}>{format(new Date(item.clock_in), 'MMM d, yyyy • h:mm a')} {item.clock_out ? `– ${format(new Date(item.clock_out), 'h:mm a')}` : '• Active'}</Text>
              </View>
              <View style={styles.pointBadge}><Text style={styles.pointBadgeText}>{item.point_count} pts</Text></View>
              <MaterialIcons name="chevron-right" size={22} color="#64748B" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={styles.loadingText}>Loading GPS trail...</Text>
      </View>
    );
  }

  if (points.length === 0) {
    return (
      <View style={styles.centered}>
        <MaterialIcons name="gps-off" size={48} color="#666" />
        <Text style={styles.emptyText}>No GPS data available for this shift</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentPoint = points[currentIndex] || points[0];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => initialTimeEntryId ? navigation.goBack() : setSelectedTimeEntryId(undefined)} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GPS Playback</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalDistance.toFixed(2)} km</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{points.length}</Text>
          <Text style={styles.statLabel}>Points</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {points.length > 1
              ? formatDuration(intervalToDuration({
                  start: new Date(points[0].timestamp),
                  end: new Date(points[points.length-1].timestamp),
                }), { format: ['hours', 'minutes'] }) || '< 1m'
              : '0m'}
          </Text>
          <Text style={styles.statLabel}>Duration</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={mapRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={true}
        >
          {points.length > 1 && (
            <Polyline
              coordinates={points.map(p => ({
                latitude: p.latitude,
                longitude: p.longitude,
              }))}
              strokeColor="#00D4FF"
              strokeWidth={3}
              lineDashPattern={[5, 3]}
            />
          )}
          {points.map((point, index) => {
            const isCurrent = index === currentIndex;
            const accuracyColor = getAccuracyColor(point.accuracy);
            return (
              <React.Fragment key={point.id || index}>
                <Marker
                  coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                  title={`Point ${index + 1}`}
                  description={formatTimestamp(point.timestamp)}
                  pinColor={isCurrent ? '#00D4FF' : '#4A4A4A'}
                />
                {point.accuracy && isCurrent && (
                  <Circle
                    center={{ latitude: point.latitude, longitude: point.longitude }}
                    radius={point.accuracy}
                    strokeColor={`${accuracyColor}80`}
                    fillColor={`${accuracyColor}20`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </MapView>
        <View style={styles.currentPointBadge}>
          <Text style={styles.currentPointText}>{currentIndex + 1} / {points.length}</Text>
        </View>
      </View>

      <View style={styles.sliderContainer}>
        <View style={styles.sliderTimeRow}>
          <Text style={styles.sliderTime}>
            {points[currentIndex] ? formatTimestamp(points[currentIndex].timestamp) : ''}
          </Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={points.length - 1}
          value={currentIndex}
          step={1}
          onValueChange={handleSliderChange}
          minimumTrackTintColor="#00D4FF"
          maximumTrackTintColor="#333"
          thumbTintColor="#00D4FF"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>
            {points[0] ? format(new Date(points[0].timestamp), 'h:mm a') : ''}
          </Text>
          <Text style={styles.sliderLabel}>
            {points[points.length-1] ? format(new Date(points[points.length-1].timestamp), 'h:mm a') : ''}
          </Text>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.controlBtn} onPress={stepBackward}>
          <MaterialIcons name="skip-previous" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={40} color="#0A0A0A" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={stepForward}>
          <MaterialIcons name="skip-next" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.speedBtn} onPress={changeSpeed}>
          <Text style={styles.speedBtnText}>{playbackSpeed}x</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.detailsToggle} onPress={toggleDetails}>
        <MaterialIcons name={showDetails ? 'expand-less' : 'expand-more'} size={24} color="#00D4FF" />
        <Text style={styles.detailsToggleText}>{showDetails ? 'Hide Details' : 'Show Details'}</Text>
      </TouchableOpacity>

      <Animated.View style={[
        styles.detailsPanel,
        {
          transform: [{
            translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [200, 0],
            })
          }],
          opacity: slideAnim,
        }
      ]}>
        {currentPoint && (
          <ScrollView style={styles.detailsScroll}>
            <Text style={styles.detailsTitle}>📍 Location Details</Text>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Time</Text><Text style={styles.detailValue}>{formatTimestamp(currentPoint.timestamp)}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Coordinates</Text><Text style={styles.detailValue}>{currentPoint.latitude.toFixed(6)}, {currentPoint.longitude.toFixed(6)}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Accuracy</Text><Text style={[styles.detailValue, { color: getAccuracyColor(currentPoint.accuracy) }]}>{getAccuracyLabel(currentPoint.accuracy)}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Speed</Text><Text style={styles.detailValue}>{currentPoint.speed ? (currentPoint.speed * 3.6).toFixed(1) : 'N/A'} km/h</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Geofence</Text><Text style={styles.detailValue}>{currentPoint.geofence_status || 'unknown'}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Moving</Text><Text style={styles.detailValue}>{currentPoint.is_moving ? '🚶 Yes' : '🛑 No'}</Text></View>
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A', paddingHorizontal: 20 },
  loadingText: { color: '#888', marginTop: 16, fontSize: 14 },
  emptyText: { color: '#AAA', marginTop: 12, fontSize: 16, textAlign: 'center' },
  backButton: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#00D4FF', borderRadius: 10 },
  backButtonText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  historySubtitle: { color: '#8FA0B5', fontSize: 11, marginTop: 2 },
  historyList: { padding: 14, paddingBottom: 50 },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, marginBottom: 10, borderRadius: 16, backgroundColor: '#101E2D', borderWidth: 1, borderColor: '#263B50' },
  historyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#123243' },
  historyName: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  historyProject: { color: '#67E8F9', fontSize: 11, fontWeight: '700', marginTop: 3 },
  historyTime: { color: '#8FA0B5', fontSize: 10, marginTop: 4 },
  pointBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: '#172C3E' },
  pointBadgeText: { color: '#C8D4E2', fontSize: 9, fontWeight: '900' },
  historyEmpty: { alignItems: 'center', paddingHorizontal: 25, paddingTop: 90 },
  historyHint: { color: '#64748B', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statItem: { alignItems: 'center' },
  statValue: { color: '#00D4FF', fontSize: 18, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#333' },
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  currentPointBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  currentPointText: { color: '#FFF', fontSize: 13, fontWeight: '500' },
  sliderContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  sliderTimeRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 4 },
  sliderTime: { color: '#AAA', fontSize: 12 },
  slider: { width: '100%', height: 40 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 },
  sliderLabel: { color: '#666', fontSize: 11 },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 16,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  controlBtn: { padding: 8 },
  playBtn: {
    backgroundColor: '#00D4FF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00D4FF',
  },
  speedBtnText: { color: '#00D4FF', fontSize: 14, fontWeight: '600' },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 6,
  },
  detailsToggleText: { color: '#00D4FF', fontSize: 14, fontWeight: '500' },
  detailsPanel: {
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
    maxHeight: 200,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailsScroll: { flex: 1 },
  detailsTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  detailLabel: { color: '#888', fontSize: 13 },
  detailValue: { color: '#FFF', fontSize: 13, fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 12 },
});
