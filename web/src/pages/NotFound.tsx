import React from 'react';
import { Box, Container, Typography, Button, Paper } from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';

export default function NotFound() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 6, bgcolor: '#1A1A1A', borderRadius: 4, border: '1px solid #333', textAlign: 'center' }}>
          <ErrorOutline sx={{ fontSize: 80, color: '#F44336', mb: 3 }} />
          <Typography variant="h2" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>404</Typography>
          <Typography variant="h5" sx={{ color: '#FFF', mb: 2 }}>Page Not Found</Typography>
          <Typography variant="body1" sx={{ color: '#AAA', mb: 4 }}>
            The page you're looking for doesn't exist or has been moved.
          </Typography>
          <Button href="/" variant="contained" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 4, py: 1.5 }}>
            Back to Home
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}