import React, { useState, useEffect } from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';
import { TouchApp } from '@mui/icons-material';
import { QRCodeCanvas } from 'qrcode.react';

export default function Kiosk() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  const companyId = user?.companyId || '';
  const kioskUrl = `https://future-jobs-pro-ai.vercel.app/kiosk-clock?companyId=${companyId}`;

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 6, bgcolor: '#1A1A1A', borderRadius: 4, border: '1px solid #333', textAlign: 'center' }}>
          <TouchApp sx={{ fontSize: 80, color: '#00D4FF', mb: 3 }} />
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>Kiosk Mode</Typography>
          <Typography variant="body1" sx={{ color: '#AAA', lineHeight: 1.8, mb: 4 }}>
            Scan the QR code with the mobile app to clock in/out on a shared device.
          </Typography>
          {companyId && (
            <Box sx={{ mb: 3 }}>
              <QRCodeCanvas value={kioskUrl} size={200} bgColor="#FFFFFF" fgColor="#0A0A0A" level="H" includeMargin />
            </Box>
          )}
          <Typography variant="body2" sx={{ color: '#888' }}>
            URL: {kioskUrl}
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}