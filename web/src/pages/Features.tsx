import React from 'react';
import { Box, Container, Typography, Grid, Card, CardContent, Button } from '@mui/material';
import {
  PhotoCamera, LocationOn, Mic, Security, Speed, CheckCircle,
  CalendarMonth, Assessment, Chat, Groups, Folder, Timer, Assignment,
  BeachAccess, TouchApp,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';

const allFeatures = [
  { icon: <PhotoCamera sx={{ fontSize: 40, color: '#00D4FF' }} />, title: 'AI Photo Compliance', desc: 'Our AI analyzes photos BEFORE upload. Know immediately if your photo will hold up in a dispute.' },
  { icon: <LocationOn sx={{ fontSize: 40, color: '#4CAF50' }} />, title: 'GPS Breadcrumb Trails', desc: 'Complete location history proves exactly where your team was and for how long.' },
  { icon: <Mic sx={{ fontSize: 40, color: '#FF9800' }} />, title: 'Voice‑to‑Text Notes', desc: 'Hands‑free documentation. Speak your notes and our AI creates professional summaries.' },
  { icon: <Security sx={{ fontSize: 40, color: '#E91E63' }} />, title: 'Auto‑Dispute Evidence', desc: 'One click generates a tamper‑proof PDF with all evidence. Win disputes instantly.' },
  { icon: <Speed sx={{ fontSize: 40, color: '#9C27B0' }} />, title: 'Real‑Time Profit Tracking', desc: 'See your margin change as work happens. Stop losing money before month‑end.' },
  { icon: <CalendarMonth sx={{ fontSize: 40, color: '#00BCD4' }} />, title: 'Drag‑and‑Drop Scheduling', desc: 'Create and adjust shifts on a beautiful calendar.' },
  { icon: <Assessment sx={{ fontSize: 40, color: '#FF5722' }} />, title: 'Evidence Reports', desc: 'Generate tamper‑proof PDFs with GPS, photos, and voice notes.' },
  { icon: <Chat sx={{ fontSize: 40, color: '#00BCD4' }} />, title: 'Real‑Time Team Chat', desc: 'Instantly communicate with your crew.' },
  { icon: <Groups sx={{ fontSize: 40, color: '#4CAF50' }} />, title: 'Team Management', desc: 'Invite employees, set roles, and manage your crew.' },
  { icon: <Folder sx={{ fontSize: 40, color: '#FF9800' }} />, title: 'Project Tracking', desc: 'Keep all projects organised with status and client info.' },
  { icon: <Timer sx={{ fontSize: 40, color: '#E91E63' }} />, title: 'Timesheets', desc: 'Track hours, breaks, and GPS data effortlessly.' },
  { icon: <Assignment sx={{ fontSize: 40, color: '#9C27B0' }} />, title: 'Task Management', desc: 'Assign and track job tasks for your team.' },
  { icon: <BeachAccess sx={{ fontSize: 40, color: '#00BCD4' }} />, title: 'PTO & Leave', desc: 'Request and approve paid time off.' },
  { icon: <TouchApp sx={{ fontSize: 40, color: '#4CAF50' }} />, title: 'Kiosk Mode', desc: 'Shared clock‑in station for jobsites.' },
];

export default function Features() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 8 }}>
      <Container maxWidth="lg">
        <Typography variant="h3" align="center" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
          All Features
        </Typography>
        <Typography variant="h6" align="center" sx={{ color: '#888', mb: 6 }}>
          Everything you need to manage your field workforce in one platform.
        </Typography>
        <Grid container spacing={4}>
          {allFeatures.map((feat, idx) => (
            <Grid item xs={12} sm={6} md={4} key={idx}>
              <Card sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', height: '100%' }}>
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ mb: 3 }}>{feat.icon}</Box>
                  <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>{feat.title}</Typography>
                  <Typography variant="body2" sx={{ color: '#AAA', lineHeight: 1.6 }}>{feat.desc}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Button component={RouterLink} to="/pricing" variant="contained" size="large" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 6, py: 1.5 }}>
            Start Free Trial
          </Button>
        </Box>
      </Container>
    </Box>
  );
}