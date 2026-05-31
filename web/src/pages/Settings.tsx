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

  const handleSave = () => {
    const updated = { ...user, firstName, lastName, email, fullName: `${firstName} ${lastName}` };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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

          {saved && <Alert severity="success" sx={{ mb: 2 }}>Profile updated successfully.</Alert>}

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
            sx={{ mt: 3, bgcolor: '#00D4FF', color: '#0A0A0A', px: 4, py: 1.5 }}
          >
            Save Changes
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}