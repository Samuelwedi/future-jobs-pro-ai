import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Grid, TextField, Button,
  Switch, FormControlLabel, CircularProgress, Alert, Divider,
  Avatar, IconButton, Chip, Card, CardContent, MenuItem,
} from '@mui/material';
import { Save, ArrowBack, Upload, Business, Timer, Palette, Analytics, Lightbulb } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import VacationPolicyPanel from '../components/VacationPolicyPanel';
import CompanyPayrollCalendar from '../components/CompanyPayrollCalendar';
import { API_BASE } from '../services/api';

interface CompanySettings {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  overtime_mode: 'daily' | 'weekly' | 'daily_weekly';
  overtime_daily_threshold_hours: number;
  overtime_week_start: number;
  timezone: string;
  overtime_enabled: boolean;
  overtime_threshold_hours: number;
  overtime_multiplier: number;
  default_hourly_rate: number;
}

export default function CompanySettings() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  let user: any = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch {}
  const canManage = ['boss','owner','manager','admin'].includes(String(user.role||'').toLowerCase());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>({
    id: '',
    name: '',
    logo_url: null,
    address: null,
    phone: null,
    email: null,
    overtime_mode: 'weekly',
    overtime_daily_threshold_hours: 8,
    overtime_week_start: 1,
    timezone: 'UTC',
    overtime_enabled: true,
    overtime_threshold_hours: 40,
    overtime_multiplier: 1.5,
    default_hourly_rate: 20,
  });
  const [originalSettings, setOriginalSettings] = useState<CompanySettings>(settings);

  // For decimal inputs
  const [dailyStr, setDailyStr] = useState('8');
  const [thresholdStr, setThresholdStr] = useState('40');
  const [multiplierStr, setMultiplierStr] = useState('1.5');
  const [hourlyRateStr, setHourlyRateStr] = useState('20');

  useEffect(() => {
    if (canManage) fetchSettings(); else setLoading(false);
  }, []);

  const fetchSettings = async () => {
    try {
      const companyRes = await fetch(`${API_BASE}/api/companies/${user?.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const companyData = await companyRes.json();
      if(!companyRes.ok)throw new Error(companyData.message || 'Could not load company');

      const settingsRes = await fetch(`${API_BASE}/api/companies/${user?.companyId}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settingsData = await settingsRes.json();
      if(!settingsRes.ok)throw new Error(settingsData.message || 'Could not load overtime settings');

      const merged: CompanySettings = {
        id: companyData.id,
        name: companyData.name || '',
        logo_url: companyData.logo_url || null,
        address: companyData.address || null,
        phone: companyData.phone || null,
        email: companyData.email || null,
        overtime_mode: settingsData.settings?.overtime_mode ?? 'weekly',
        overtime_daily_threshold_hours: settingsData.settings?.overtime_daily_threshold_hours ?? 8,
        overtime_week_start: settingsData.settings?.overtime_week_start ?? 1,
        timezone: settingsData.settings?.timezone ?? 'UTC',
        overtime_enabled: settingsData.settings?.overtime_enabled ?? true,
        overtime_threshold_hours: settingsData.settings?.overtime_threshold_hours ?? 40,
        overtime_multiplier: settingsData.settings?.overtime_multiplier ?? 1.5,
        default_hourly_rate: settingsData.settings?.default_hourly_rate ?? 20,
      };
      setSettings(merged);
      setOriginalSettings(merged);
      setDailyStr(String(merged.overtime_daily_threshold_hours));
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
    const threshold = thresholdStr.trim() ? Number(thresholdStr) : NaN;
    const daily = dailyStr.trim() ? Number(dailyStr) : NaN;
    const multiplier = multiplierStr.trim() ? Number(multiplierStr) : NaN;
    const hourlyRate = hourlyRateStr.trim() ? Number(hourlyRateStr) : NaN;

    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 168 || !Number.isFinite(daily) || daily <= 0 || daily > 24) {
      alert('Enter daily hours greater than 0 up to 24, and weekly hours greater than 0 up to 168. Decimal hours are accepted.');
      return;
    }
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) {
      alert('Overtime multiplier must be between 1 and 10.');
      return;
    }
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      alert('Hourly rate must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      // Update settings
      const saved=await fetch(`${API_BASE}/api/companies/${user?.companyId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          overtime_mode: settings.overtime_mode,
          overtime_daily_threshold_hours: daily,
          overtime_week_start: settings.overtime_week_start,
          timezone: settings.timezone.trim(),
          overtime_enabled: settings.overtime_enabled,
          overtime_threshold_hours: threshold,
          overtime_multiplier: multiplier,
          default_hourly_rate: hourlyRate,
        }),
      });

      const savedData=await saved.json();
      if(!saved.ok)throw new Error(savedData.message || 'Could not save overtime settings');

      // Update company profile if changed
      if (
        settings.name !== originalSettings.name ||
        settings.address !== originalSettings.address ||
        settings.phone !== originalSettings.phone ||
        settings.email !== originalSettings.email
      ) {
        const profileSaved=await fetch(`${API_BASE}/api/companies/${user?.companyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: settings.name,
            address: settings.address,
            phone: settings.phone,
            email: settings.email,
          }),
        });
        if(!profileSaved.ok)throw new Error('Overtime saved, but the company profile could not be updated');
      }

      alert('Company settings updated.');
      fetchSettings();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (mode: 'daily' | 'weekly', hours: number) => {
    setSettings(current => ({...current, overtime_enabled:true, overtime_mode:mode}));
    if(mode==='daily')setDailyStr(String(hours));else setThresholdStr(String(hours));
  };
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dailyLimit = settings.overtime_enabled && settings.overtime_mode!=='weekly' ? Number(dailyStr) : Infinity;
  const weeklyLimit = settings.overtime_enabled && settings.overtime_mode!=='daily' ? Number(thresholdStr) : Infinity;
  const exampleRegular = Math.max(0,Math.min(45,5*Math.min(9,dailyLimit),weeklyLimit));
  const example = Number.isFinite(exampleRegular) ? `Example: five 9-hour days = ${exampleRegular.toFixed(2)} regular hours + ${(45-exampleRegular).toFixed(2)} overtime hours.` : 'Enter valid thresholds to see an example.';

  if (!canManage) return <Alert severity="info">Company policies are managed by your boss or manager.</Alert>;

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
          {saving ? 'Saving...' : 'Save profile & overtime'}
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
          <Box sx={{mt:2,display:'grid',gap:2}}>
            <TextField select fullWidth label="Overtime basis" value={settings.overtime_mode} onChange={e=>setSettings({...settings,overtime_mode:e.target.value as CompanySettings['overtime_mode']})}>
              <MenuItem value="daily">Daily</MenuItem><MenuItem value="weekly">Weekly</MenuItem><MenuItem value="daily_weekly">Daily + weekly</MenuItem>
            </TextField>
            {settings.overtime_mode!=='weekly' && <TextField fullWidth type="number" label="Daily overtime after (hours)" value={dailyStr} onChange={e=>setDailyStr(e.target.value)} inputProps={{min:0.01,max:24,step:'any'}} helperText="For example 8, 10, or 8.5 hours"/>}
            {settings.overtime_mode!=='daily' && <TextField fullWidth type="number" label="Weekly overtime after (hours)" value={thresholdStr} onChange={e=>setThresholdStr(e.target.value)} inputProps={{min:0.01,max:168,step:'any'}} helperText="44.5 hours means 44 hours 30 minutes"/>}
            <TextField fullWidth type="number" label="Overtime pay multiplier" value={multiplierStr} onChange={e=>setMultiplierStr(e.target.value)} inputProps={{min:1,max:10,step:'any'}} helperText="1.5 pays one and a half times the hourly rate"/>
            <TextField select fullWidth label="Workweek starts on" value={settings.overtime_week_start} onChange={e=>setSettings({...settings,overtime_week_start:Number(e.target.value)})}>{days.map((day,index)=><MenuItem key={day} value={index}>{day}</MenuItem>)}</TextField>
            <Box sx={{display:'flex',gap:1,flexWrap:'wrap'}}>
              {([['daily',8],['daily',10],['weekly',40],['weekly',44.5]] as const).map(([mode,hours])=><Button key={mode+hours} variant="outlined" onClick={()=>applyPreset(mode,hours)}>{mode==='daily'?'Daily':'Weekly'} {hours}h</Button>)}
            </Box>
          </Box>
        )}
        <TextField fullWidth label="Company time zone (IANA)" value={settings.timezone} onChange={e=>setSettings({...settings,timezone:e.target.value})} helperText="For example America/Edmonton. Also used by the payroll calendar." sx={{mt:2}}/>
        <Alert severity="info" sx={{mt:2}}>{example}</Alert>
        <Typography variant="body2" color="text.secondary" sx={{mt:2}}>Combined mode uses the greater of daily or weekly overtime for each week, without counting an hour twice. Unpaid breaks are excluded; overnight breaks are allocated proportionally between days.</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mt:2}}>Changes apply to unlocked time and new payroll drafts. Previously approved entries whose pay changes return for manager review. Existing payroll stays unchanged. Use rules that meet applicable employment requirements.</Typography>
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

      <CompanyPayrollCalendar />
      <Paper sx={{p:3,mb:3,bgcolor:'#1A1A1A',border:'1px solid #333',overflow:'auto'}}>
        <VacationPolicyPanel />
      </Paper>
      <Paper sx={{p:3,mb:3,bgcolor:'#1A1A1A',border:'1px solid #333'}}>
        <Typography variant="h6" mb={1}>More company controls</Typography>
        <Typography color="text.secondary" mb={2}>Open the relevant workspace to configure and save these policies. Each section has its own save action.</Typography>
        <Box sx={{display:'flex',gap:1,flexWrap:'wrap'}}>
          <Button variant="outlined" onClick={()=>navigate('/payroll-rules')}>Country rules & deductions</Button>
          <Button variant="outlined" onClick={()=>navigate('/team')}>Employee rates & roles</Button>
          <Button variant="outlined" onClick={()=>navigate('/pto')}>Leave requests & approvals</Button>
          <Button variant="outlined" onClick={()=>navigate('/operations')}>Operating budgets & limits</Button>
          <Button variant="outlined" onClick={()=>navigate('/subscription')}>Company subscription</Button>
          <Button variant="outlined" onClick={()=>navigate('/integrations')}>Accounting integrations</Button>
        </Box>
      </Paper>
    </Container>
  );
}
