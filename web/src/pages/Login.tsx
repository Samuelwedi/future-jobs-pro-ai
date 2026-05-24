import React from 'react';
import { Box, Typography } from '@mui/material';

export default function Login() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', p: 10 }}>
      <Typography variant="h1" sx={{ color: '#FFF' }}>
        🔐 Login Page Works!
      </Typography>
    </Box>
  );
}