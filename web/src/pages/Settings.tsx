import React from 'react';
import { Box, Container, Typography, Paper, TextField, Button, Avatar, Grid } from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';

export default function Settings() {
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
            <Avatar sx={{ bgcolor: '#00D4FF', width: 64, height: 64, fontSize: 28, mr: 2 }}>JB</Avatar>
            <Box>
              <Typography variant="h6" sx={{ color: '#FFF' }}>John Bossman</Typography>
              <Typography variant="body2" sx={{ color: '#888' }}>john.bossman@example.com</Typography>
            </Box>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="First Name" defaultValue="John"
                sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Last Name" defaultValue="Bossman"
                sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Email" defaultValue="john.bossman@example.com"
                sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
            </Grid>
          </Grid>

          <Button variant="contained" sx={{ mt: 3, bgcolor: '#00D4FF', color: '#0A0A0A', px: 4, py: 1.5 }}>
            Save Changes
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}