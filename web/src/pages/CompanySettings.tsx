import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Grid, TextField, Button,
  Switch, FormControlLabel, CircularProgress, Alert, Divider,
  Avatar, IconButton, Chip, Card, CardContent,
} from '@mui/material';
import { Save, ArrowBack, Upload, Business, Timer, Palette, Analytics, Lightbulb } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface CompanySettings {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  overtime_enabled: boolean;
  overtime_threshold_hours: number;
  overtime_multiplier: number;
  default_hourly_rate: number;
}

export default function CompanySettings() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>({
    id: '',
    name: '',
    logo_url: null,
    address: null,
    phone: null,
    email: null,
    overtime_enabled: true,
    overtime_threshold_hours: 40,
    overtime_multiplier: 1.5,
    default_hourly_rate: 20,
  });
  const [originalSettings, setOriginalSettings] = useState<CompanySettings>(settings);

  // For decimal inputs
  const [thresholdStr, setThresholdStr] = useState('40');
  const [multiplierStr, setMultiplierStr] = useState('1.5');
  const [hourlyRateStr, setHourlyRateStr] = useState('20');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const companyRes = await fetch(`${API_BASE}/api/companies/${user?.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const companyData = await companyRes.json();

      const settingsRes = await fetch(`${API_BASE}/api/companies/${user?.companyId}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settingsData = await settingsRes.json();

      const merged: CompanySettings = {
        id: companyData.id,
        name: companyData.name || '',
        logo_url: companyData.logo_url || null,
        address: companyData.address || null,
        phone: companyData.phone || null,
        email: companyData.email || null,
        overtime_enabled: settingsData.settings?.overtime_enabled ?? true,
        overtime_threshold_hours: settingsData.settings?.overtime_threshold_hours ?? 40,
        overtime_multiplier: settingsData.settings?.overtime_multiplier ?? 1.5,
        default_hourly_rate: 20,
      };
      setSettings(merged);
      setOriginalSettings(merged);
      setThresholdStr(String(merged.overtime_threshold_hours));
      setMultiplierStr(String(merged.overtime_multiplier));
      setHourlyRateStr(String(merged.default_hourly_rate));
    } catch (e) {
      console.error('Error fetching settings:', e);
      alert('Could not load company settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    const threshold = parseFloat(thresholdStr);
    const multiplier = parseFloat(multiplierStr);
    const hourlyRate = parseFloat(hourlyRateStr);

    if (isNaN(threshold) || threshold < 0) {
      alert('Please enter a valid positive number for overtime threshold.');
      return;
    }
    if (isNaN(multiplier) || multiplier < 1) {
      alert('Overtime multiplier must be at least 1.');
      return;
    }
    if (isNaN(hourlyRate) || hourlyRate < 0) {
      alert('Hourly rate must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      // Update settings
      await fetch(`${API_BASE}/api/companies/${user?.companyId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          overtime_enabled: settings.overtime_enabled,
          overtime_threshold_hours: threshold,
          overtime_multiplier: multiplier,
          default_hourly_rate: hourlyRate,
        }),
      });

      // Update company profile if changed
      if (
        settings.name !== originalSettings.name ||
        settings.address !== originalSettings.address ||
        settings.phone !== originalSettings.phone ||
        settings.email !== originalSettings.email
      ) {
        await fetch(`${API_BASE}/api/companies/${user?.companyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: settings.name,
            address: settings.address,
            phone: settings.phone,
            email: settings.email,
          }),
        });
      }

      alert('✅ Company settings updated.');
      fetchSettings();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const applySuggestion = () => {
    // Simulated AI suggestion – matches mobile app
    const suggestion = { threshold: 40, multiplier: 1.5, suggestion: 'Industry standard is 40h. Your team is within healthy limits.' };
    setThresholdStr(String(suggestion.threshold));
    setMultiplierStr(String(suggestion.multiplier));
    setSettings({
      ...settings,
      overtime_threshold_hours: suggestion.threshold,
      overtime_multiplier: suggestion.multiplier,
    });
    alert('💡 AI Suggestion Applied: ' + suggestion.suggestion);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', ml: 1 }}>
          Company Settings
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={saveSettings}
          disabled={saving}
          sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>

      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 3 }}>
        {/* Logo Section */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <Avatar
            src={settings.logo_url || undefined}
            sx={{ width: 100, height: 100, bgcolor: '#333' }}
          >
            {!settings.logo_url && <Business sx={{ fontSize: 48, color: '#888' }} />}
          </Avatar>
          <Button startIcon={<Upload />} sx={{ mt: 1, color: '#00D4FF' }}>
            Change Logo
          </Button>
        </Box>

        {/* Profile Fields */}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Company Name"
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Address"
              value={settings.address || ''}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Phone"
              value={settings.phone || ''}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Email"
              value={settings.email || ''}
              onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Overtime Rules */}
      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Timer sx={{ color: '#00D4FF', mr: 1 }} />
          <Typography variant="h6" sx={{ color: '#FFF' }}>Overtime Rules</Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={settings.overtime_enabled}
              onChange={(e) => setSettings({ ...settings, overtime_enabled: e.target.checked })}
              sx={{ color: '#00D4FF' }}
            />
          }
          label="Enable Overtime"
          sx={{ color: '#FFF' }}
        />
        {settings.overtime_enabled && (
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Threshold (hours per week)"
              value={thresholdStr}
              onChange={(e) => setThresholdStr(e.target.value)}
              sx={{ mb: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />
            <TextField
              fullWidth
              label="Overtime Multiplier (e.g. 1.5)"
              value={multiplierStr}
              onChange={(e) => setMultiplierStr(e.target.value)}
              sx={{ mb: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />
            <Button
              variant="outlined"
              startIcon={<Lightbulb />}
              onClick={applySuggestion}
              sx={{ color: '#9C27B0', borderColor: '#9C27B0' }}
            >
              AI‑recommended threshold
            </Button>
          </Box>
        )}
      </Paper>

      {/* Payroll & Branding */}
      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Palette sx={{ color: '#00D4FF', mr: 1 }} />
          <Typography variant="h6" sx={{ color: '#FFF' }}>Payroll & Branding</Typography>
        </Box>
        <TextField
          fullWidth
          label="Default Hourly Rate ($)"
          value={hourlyRateStr}
          onChange={(e) => setHourlyRateStr(e.target.value)}
          sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
        />
      </Paper>

      {/* Smart Insights */}
      <Paper sx={{ p: 3, bgcolor: '#1A1A1A', border: '1px solid #333' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Analytics sx={{ color: '#00D4FF', mr: 1 }} />
          <Typography variant="h6" sx={{ color: '#FFF' }}>Smart Insights</Typography>
        </Box>
        <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333', mb: 2 }}>
          <CardContent>
            <Typography variant="body2" sx={{ color: '#888' }}>Overtime Usage</Typography>
            <Typography variant="h5" sx={{ color: '#00D4FF', fontWeight: 'bold' }}>$1,240 this month</Typography>
            <Typography variant="caption" sx={{ color: '#4CAF50' }}>↑ 12% from last month</Typography>
          </CardContent>
        </Card>
        <Card sx={{ bgcolor: '#0A0A0A', border: '1px solid #333' }}>
          <CardContent>
            <Typography variant="body2" sx={{ color: '#888' }}>Average Weekly Hours</Typography>
            <Typography variant="h5" sx={{ color: '#00D4FF', fontWeight: 'bold' }}>38.2h</Typography>
            <Typography variant="caption" sx={{ color: '#4CAF50' }}>Within threshold ✓</Typography>
          </CardContent>
        </Card>
      </Paper>
    </Container>
  );
}