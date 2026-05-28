import React from 'react';
import { Box, Container, Typography, Paper, Button } from '@mui/material';
import { TouchApp, QrCode } from '@mui/icons-material';

export default function Kiosk() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 6, bgcolor: '#1A1A1A', borderRadius: 4, border: '1px solid #333', textAlign: 'center' }}>
          <TouchApp sx={{ fontSize: 80, color: '#00D4FF', mb: 3 }} />
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>Kiosk Mode</Typography>
          <Typography variant="body1" sx={{ color: '#AAA', lineHeight: 1.8, mb: 4 }}>
            Let crew members clock in/out on a shared device. Scan the QR code with the mobile app to activate.
          </Typography>
          <QrCode sx={{ fontSize: 120, color: '#00D4FF', mb: 3 }} />
          <Button variant="contained" size="large" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 6, py: 1.5 }}>
            Activate Kiosk
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}