import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Paper, Slider, IconButton, Button,
  CircularProgress, Alert, Card, CardContent, Grid,
  Chip,
} from '@mui/material';
import {
  PlayArrow, Pause, SkipPrevious, SkipNext, Speed, Close,
} from '@mui/icons-material';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate, useLocation } from 'react-router-dom';

// Fix marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

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

export default function GPSPlayback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { timeEntryId } = location.state || { timeEntryId: '' };
  const token = localStorage.getItem('token') || '';

  const [points, setPoints] = useState<GPSPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.4215, -75.6972]);
  const [mapZoom, setMapZoom] = useState(15);
  const [showDetails, setShowDetails] = useState(false);

  const playbackInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<any>(null);

  const speedOptions = [0.5, 1, 2, 4];

  useEffect(() => {
    if (!timeEntryId) {
      alert('No time entry selected');
      setLoading(false);
      return;
    }
    fetchGPSTrail();
    return () => {
      if (playbackInterval.current) clearInterval(playbackInterval.current);
    };
  }, [timeEntryId]);

  const fetchGPSTrail = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gps/trail/${timeEntryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const trail = data.trail?.points || [];
      setPoints(trail);
      if (trail.length > 0) {
        const first = trail[0];
        setMapCenter([first.latitude, first.longitude]);
      }
    } catch (e) {
      console.error(e);
      alert('Could not load GPS trail');
    } finally {
      setLoading(false);
    }
  };

  const animateToPoint = (index: number) => {
    const point = points[index];
    if (!point) return;
    setMapCenter([point.latitude, point.longitude]);
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
    }
  };

  const stepBackward = () => {
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev);
      animateToPoint(prev);
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
  };

  const handleSliderChange = (_: any, value: number | number[]) => {
    const idx = value as number;
    if (idx !== currentIndex) {
      setCurrentIndex(idx);
      animateToPoint(idx);
      if (isPlaying) pausePlayback();
    }
  };

  const currentPoint = points[currentIndex] || points[0];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  if (points.length === 0) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="info">No GPS data available for this shift.</Alert>
        <Button variant="contained" onClick={() => navigate(-1)} sx={{ mt: 2, bgcolor: '#00D4FF', color: '#0A0A0A' }}>
          Go Back
        </Button>
      </Container>
    );
  }

  const totalDistance = points.length > 1 ? calculateTotalDistance(points) : 0;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}>
          <Close />
        </IconButton>
        <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', ml: 1 }}>
          GPS Playback
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip label={`${points.length} points`} sx={{ bgcolor: '#333', color: '#FFF' }} />
        <Chip label={`${totalDistance.toFixed(2)} km`} sx={{ bgcolor: '#333', color: '#FFF', ml: 1 }} />
      </Box>

      <Paper sx={{ height: 450, bgcolor: '#1A1A1A', border: '1px solid #333', position: 'relative' }}>
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }} ref={mapRef}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.length > 1 && (
            <Polyline
              positions={points.map(p => [p.latitude, p.longitude])}
              color="#00D4FF"
              weight={3}
              dashArray="5,5"
            />
          )}
          {currentPoint && (
            <Marker position={[currentPoint.latitude, currentPoint.longitude]}>
              <Popup>
                <strong>Point {currentIndex + 1}/{points.length}</strong><br />
                {new Date(currentPoint.timestamp).toLocaleString()}
              </Popup>
            </Marker>
          )}
        </MapContainer>
        <Box sx={{ position: 'absolute', top: 10, right: 10, bgcolor: 'rgba(0,0,0,0.7)', px: 2, py: 1, borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: '#FFF' }}>
            {currentIndex + 1} / {points.length}
          </Typography>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={stepBackward} sx={{ color: '#FFF' }}>
            <SkipPrevious />
          </IconButton>
          <IconButton onClick={togglePlay} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', width: 48, height: 48 }}>
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton onClick={stepForward} sx={{ color: '#FFF' }}>
            <SkipNext />
          </IconButton>
          <IconButton onClick={changeSpeed} sx={{ color: '#00D4FF' }}>
            <Speed />
          </IconButton>
          <Typography variant="body2" sx={{ color: '#00D4FF', minWidth: 40 }}>
            {playbackSpeed}x
          </Typography>
          <Box sx={{ flex: 1, mx: 2 }}>
            <Slider
              value={currentIndex}
              min={0}
              max={points.length - 1}
              step={1}
              onChange={handleSliderChange}
              sx={{ color: '#00D4FF' }}
            />
          </Box>
        </Box>

        {currentPoint && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ color: '#888' }}>
              Time: {new Date(currentPoint.timestamp).toLocaleString()}
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>
              Coordinates: {currentPoint.latitude.toFixed(6)}, {currentPoint.longitude.toFixed(6)}
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>
              Accuracy: {currentPoint.accuracy ? `${currentPoint.accuracy}m` : 'N/A'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>
              Speed: {currentPoint.speed ? `${(currentPoint.speed * 3.6).toFixed(1)} km/h` : 'N/A'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>
              Geofence: {currentPoint.geofence_status || 'unknown'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#888' }}>
              Moving: {currentPoint.is_moving ? '🚶 Yes' : '🛑 No'}
            </Typography>
          </Box>
        )}
      </Paper>
    </Container>
  );
}

// Helper function to calculate total distance (in km)
function calculateTotalDistance(points: GPSPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const R = 6371;
    const lat1 = points[i-1].latitude, lon1 = points[i-1].longitude;
    const lat2 = points[i].latitude, lon2 = points[i].longitude;
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
}