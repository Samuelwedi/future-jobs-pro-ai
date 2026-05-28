import React from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';
import { Assignment } from '@mui/icons-material';

export default function Tasks() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 6, bgcolor: '#1A1A1A', borderRadius: 4, border: '1px solid #333', textAlign: 'center' }}>
          <Assignment sx={{ fontSize: 80, color: '#9C27B0', mb: 3 }} />
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>Tasks</Typography>
          <Typography variant="body1" sx={{ color: '#AAA', lineHeight: 1.8 }}>
            Assign and track job tasks – full web task board coming soon.
          </Typography>
          <Box sx={{ mt: 4, bgcolor: '#00D4FF20', border: '1px solid #00D4FF', borderRadius: 2, px: 3, py: 1, display: 'inline-block' }}>
            <Typography sx={{ color: '#00D4FF', fontWeight: 600 }}>🚀 Coming Soon</Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}