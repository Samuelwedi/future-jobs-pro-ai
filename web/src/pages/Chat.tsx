import React from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';
import { ChatBubble } from '@mui/icons-material';

export default function Chat() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <ChatBubble sx={{ mr: 1, verticalAlign: 'middle' }} />
          Team Chat
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Real‑time messaging – coming soon in full
        </Typography>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: '#AAA' }}>Chat functionality is under development.</Typography>
        </Paper>
      </Container>
    </Box>
  );
}