import React from 'react';
import { Box, Container, Typography, Button, Paper } from '@mui/material';
import { MicOff, ArrowBack } from '@mui/icons-material';

export default function VoiceAssistant() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 6, bgcolor: '#1A1A1A', borderRadius: 4, border: '1px solid #333', textAlign: 'center' }}>
          <MicOff sx={{ fontSize: 80, color: '#00D4FF', mb: 3 }} />
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
            Lucy Voice Assistant
          </Typography>
          <Typography variant="body1" sx={{ color: '#AAA', mb: 4, lineHeight: 1.8 }}>
            Hands‑free AI for the jobsite. Clock in, take photos, or pull up a timesheet just by speaking.
            We're putting the finishing touches on Lucy – check back soon!
          </Typography>
          <Box sx={{ display: 'inline-block', bgcolor: '#00D4FF20', border: '1px solid #00D4FF', borderRadius: 4, px: 3, py: 1, mb: 4 }}>
            <Typography variant="body2" sx={{ color: '#00D4FF', fontWeight: 600 }}>
              🚀 Coming Soon
            </Typography>
          </Box>
          <br />
          <Button href="/" startIcon={<ArrowBack />} sx={{ color: '#00D4FF' }}>
            Back to Home
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}