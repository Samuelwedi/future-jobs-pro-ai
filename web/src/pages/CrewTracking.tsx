import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Paper, CircularProgress, Alert,
  List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip,
  IconButton,
} from '@mui/material';
import { Refresh, LocationOn, MyLocation } from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface ActiveEmployee {
  userId: string;
  firstName: string;
  lastName: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string | null;
  geofenceStatus: 'inside' | 'outside' | 'unknown';
  isMoving: boolean;
  projectName: string;
}

export default function CrewTracking() {
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [employees, setEmployees] = useState<ActiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.4215, -75.6972]); // default Ottawa
  const [mapZoom, setMapZoom] = useState(12);

  useEffect(() => {
    fetchActiveEmployees();
  }, []);

  const fetchActiveEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gps/active/${user?.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const employeesList = data.employees || [];
      setEmployees(employeesList);

      // Center map on first valid location
      const valid = employeesList.filter((e: any) => e.latitude && e.longitude);
      if (valid.length > 0) {
        const avgLat = valid.reduce((s: number, e: any) => s + e.latitude, 0) / valid.length;
        const avgLng = valid.reduce((s: number, e: any) => s + e.longitude, 0) / valid.length;
        setMapCenter([avgLat, avgLng]);
        setMapZoom(12);
      }
    } catch (e) {
      console.error(e);
      alert('Could not load employee locations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const activeCount = employees.filter(e => e.latitude && e.longitude).length;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
          Crew Tracker
        </Typography>
        <IconButton onClick={fetchActiveEmployees} sx={{ color: '#00D4FF' }}>
          <Refresh />
        </IconButton>
      </Box>

      <Paper sx={{ height: 500, bgcolor: '#1A1A1A', border: '1px solid #333', position: 'relative', mb: 3 }}>
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {employees
            .filter(e => e.latitude && e.longitude)
            .map((emp) => (
              <Marker
                key={emp.userId}
                position={[emp.latitude!, emp.longitude!]}
                icon={new L.Icon({
                  iconUrl: emp.isMoving
                    ? 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png'
                    : 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
                  iconSize: [25, 41],
                  iconAnchor: [12, 41],
                  popupAnchor: [1, -34],
                  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
                  shadowSize: [41, 41],
                })}
              >
                <Popup>
                  <strong>{emp.firstName} {emp.lastName}</strong><br />
                  Project: {emp.projectName || '—'}<br />
                  Status: {emp.isMoving ? '🚶 Moving' : '🛑 Stationary'}<br />
                  Geofence: {emp.geofenceStatus || 'unknown'}
                </Popup>
              </Marker>
            ))}
        </MapContainer>
        <Box sx={{ position: 'absolute', bottom: 10, right: 10, bgcolor: 'rgba(0,0,0,0.7)', px: 2, py: 1, borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: '#FFF' }}>{activeCount} active</Typography>
        </Box>
      </Paper>

      {/* Employee list */}
      <Paper sx={{ bgcolor: '#1A1A1A', border: '1px solid #333', p: 2 }}>
        <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>Active Employees</Typography>
        <List>
          {employees.map((emp) => (
            <ListItem key={emp.userId} sx={{ borderBottom: '1px solid #222' }}>
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: '#00D4FF' }}>
                  {emp.firstName[0]}{emp.lastName?.[0] || ''}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={`${emp.firstName} ${emp.lastName}`}
                secondary={
                  <>
                    <Typography variant="caption" sx={{ color: '#888', display: 'block' }}>
                      {emp.projectName || 'No project'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#888' }}>
                      {emp.isMoving ? '🚶 Moving' : '⏱ Last update: ' + (emp.timestamp ? new Date(emp.timestamp).toLocaleTimeString() : '—')}
                    </Typography>
                  </>
                }
              />
              <Chip
                label={emp.isMoving ? 'Moving' : 'Stationary'}
                size="small"
                sx={{ bgcolor: emp.isMoving ? '#4CAF50' : '#FF9800', color: '#FFF' }}
              />
            </ListItem>
          ))}
          {employees.length === 0 && (
            <Typography sx={{ color: '#888', textAlign: 'center', py: 3 }}>No active employees</Typography>
          )}
        </List>
      </Paper>
    </Container>
  );
}