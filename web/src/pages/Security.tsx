import React from 'react';
import { Box, Container, Typography, Paper, Grid } from '@mui/material';
import { Lock, Cloud, Shield, VerifiedUser } from '@mui/icons-material';

const items = [
  { icon: <Lock sx={{ fontSize: 40, color: '#00D4FF' }} />, title: 'Encryption', desc: 'All data is encrypted at rest using AES‑256 and in transit using TLS 1.3.' },
  { icon: <Cloud sx={{ fontSize: 40, color: '#4CAF50' }} />, title: 'Secure Cloud', desc: 'Your data is stored in secure, SOC‑2 compliant cloud infrastructure.' },
  { icon: <Shield sx={{ fontSize: 40, color: '#FF9800' }} />, title: 'Access Control', desc: 'Role‑based access ensures that only authorised users can view sensitive data.' },
  { icon: <VerifiedUser sx={{ fontSize: 40, color: '#E91E63' }} />, title: 'Compliance', desc: 'We adhere to industry best practices and comply with GDPR and CCPA regulations.' },
];

export default function Security() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 8 }}>
      <Container maxWidth="md">
        <Typography variant="h3" align="center" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
          Security
        </Typography>
        <Typography variant="h6" align="center" sx={{ color: '#888', mb: 6 }}>
          Your data is protected with bank‑grade security.
        </Typography>

        <Grid container spacing={4}>
          {items.map((item, idx) => (
            <Grid item xs={12} sm={6} key={idx}>
              <Paper sx={{ p: 4, bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', height: '100%' }}>
                <Box sx={{ mb: 2 }}>{item.icon}</Box>
                <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>{item.title}</Typography>
                <Typography variant="body2" sx={{ color: '#AAA', lineHeight: 1.6 }}>{item.desc}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}