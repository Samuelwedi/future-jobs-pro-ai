import { api } from '../services/api';
import { Link as RouterLink } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, TextField, Button, Avatar, Grid, Alert,
} from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';

export default function Settings() {
  const [user, setUser] = useState<any>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState<{verified: boolean; email: string} | null>(null);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setFirstName(parsed.firstName || '');
        setLastName(parsed.lastName || '');
        setEmail(parsed.email || '');
      }
    } catch {}
  }, []);

  useEffect(() => {
    api.get('/api/auth/email-verification').then(setVerification).catch(() => setVerificationMessage('Email verification status could not be loaded.'));
  }, []);

  const sendVerification = async () => {
    setSending(true); setVerificationMessage('');
    try { const result = await api.post('/api/auth/email-verification'); setVerificationMessage(result.message); }
    catch (cause: any) { setVerificationMessage(cause.message || 'Unable to send verification email.'); }
    finally { setSending(false); }
  };

  const handleSave = async () => {
    setError(''); setSaved(false);
    if (!firstName.trim() || !lastName.trim()) { setError('First and last names are required.'); return; }
    setSaving(true);
    try {
    const response = await api.put('/api/users/profile', {firstName: firstName.trim(), lastName: lastName.trim()});
    const updated = { ...user, firstName: response.user.first_name, lastName: response.user.last_name, fullName: response.user.full_name };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
    setSaved(true);
    } catch (cause: any) { setError(cause.message || 'Profile could not be saved.'); }
    finally { setSaving(false); }
  };

  const initials = user
    ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`
    : 'U';

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Settings
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Manage your profile and preferences
        </Typography>

        {['boss','owner','manager','admin'].includes(String(user?.role||'').toLowerCase()) && <Button component={RouterLink} to="/company-settings" variant="contained" sx={{mb:3}}>Company Settings & Payroll Policies</Button>}

        <Paper sx={{ p: 4, bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
            <Avatar sx={{ bgcolor: '#00D4FF', width: 64, height: 64, fontSize: 28, mr: 2 }}>
              {initials}
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ color: '#FFF' }}>
                {firstName} {lastName}
              </Typography>
              <Typography variant="body2" sx={{ color: '#888' }}>
                {email}
              </Typography>
            </Box>
          </Box>

          {error && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}
          {saved && <Alert severity="success" sx={{ mb: 2 }}>Profile updated successfully.</Alert>}

          <Box sx={{mb:3}}>
            <Typography color="white">Email: {verification ? (verification.verified ? 'Verified' : 'Not verified') : 'Status unavailable'}</Typography>
            {verification && !verification.verified && <Button disabled={sending} onClick={sendVerification}>{sending ? 'Sending…' : 'Send verification email'}</Button>}
            {verificationMessage && <Alert severity="info">{verificationMessage}</Alert>}
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                sx={{
                  input: { color: '#FFF' },
                  label: { color: '#888' },
                  '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } },
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                sx={{
                  input: { color: '#FFF' },
                  label: { color: '#888' },
                  '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                value={email}
                disabled
                sx={{
                  input: { color: '#888' },
                  label: { color: '#888' },
                  '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } },
                }}
              />
            </Grid>
          </Grid>

          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ mt: 3, bgcolor: '#00D4FF', color: '#0A0A0A', px: 4, py: 1.5 }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}