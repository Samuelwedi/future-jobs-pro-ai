import React from 'react';
import { Box, Container, Typography, Paper, Grid, Avatar } from '@mui/material';
import { RocketLaunch } from '@mui/icons-material';

export default function About() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 8 }}>
      <Container maxWidth="md">
        <Paper sx={{ p: 6, bgcolor: '#1A1A1A', borderRadius: 4, border: '1px solid #333' }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Avatar sx={{ bgcolor: '#00D4FF', width: 80, height: 80, mx: 'auto', mb: 2 }}>
              <RocketLaunch sx={{ fontSize: 40, color: '#0A0A0A' }} />
            </Avatar>
            <Typography variant="h3" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>About Future Jobs Pro AI</Typography>
          </Box>

          <Typography variant="body1" sx={{ color: '#AAA', lineHeight: 1.8, mb: 4 }}>
            Future Jobs Pro AI was created by <strong style={{ color: '#00D4FF' }}>Samuel B.</strong> to solve a critical problem in field service: disputed invoices.
            Every year, billions of dollars are lost because field workers can't prove where they were, when they arrived, or what work they completed.
            We built Future Jobs Pro AI to give businesses legal‑grade proof of work — automatically.
          </Typography>

          <Typography variant="body1" sx={{ color: '#AAA', lineHeight: 1.8, mb: 4 }}>
            Our AI‑powered photo compliance, GPS breadcrumb trails, and one‑click dispute evidence reports make it impossible for clients to question your invoices.
            Add in drag‑and‑drop scheduling, real‑time team chat, and voice‑to‑text notes, and you have the most complete workforce management platform on the market.
          </Typography>

          <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>Our Mission</Typography>
          <Typography variant="body1" sx={{ color: '#AAA', lineHeight: 1.8, mb: 4 }}>
            To empower every field service business — from solo contractors to large crews — with the tools they need to protect their revenue,
            streamline operations, and grow with confidence.
          </Typography>

          <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>Built by Samuel B.</Typography>
          <Typography variant="body1" sx={{ color: '#AAA', lineHeight: 1.8 }}>
            Samuel is a full‑stack developer and entrepreneur with a passion for AI and automation. Future Jobs Pro AI is the result of over a year of
            research, development, and real‑world testing in the field service industry.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}