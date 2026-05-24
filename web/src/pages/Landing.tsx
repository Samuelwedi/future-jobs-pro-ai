import React from 'react';
import {
  Box, Container, Typography, Button, Grid, Card, CardContent,
  AppBar, Toolbar, Chip,
} from '@mui/material';
import {
  CheckCircle, LocationOn, PhotoCamera, Mic, Security, Speed,
} from '@mui/icons-material';

export default function Landing() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      {/* ---- Navbar ---- */}
      <AppBar position="static" sx={{ bgcolor: '#0A0A0A', boxShadow: 'none', borderBottom: '1px solid #222' }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 'bold' }}>
            🚀 Future Jobs Pro AI
          </Typography>
          <Box>
            <Button href="/login" sx={{ color: '#FFF', mr: 2 }}>Sign In</Button>
            <Button href="/pricing" variant="contained" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
              Start Free Trial
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* ---- Hero ---- */}
      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Grid container spacing={6} alignItems="center">
          <Grid item xs={12} md={6}>
            <Chip label="🚀 AI‑Powered Field Service" sx={{ bgcolor: '#00D4FF20', color: '#00D4FF', mb: 3 }} />
            <Typography variant="h2" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
              Field Service Management That
              <Box component="span" sx={{ color: '#00D4FF' }}> Actually Works</Box>
            </Typography>
            <Typography variant="h6" sx={{ color: '#888', mb: 4, lineHeight: 1.6 }}>
              Stop losing money to disputed invoices. Future Jobs Pro AI gives you
              legal‑grade proof of work with AI‑powered photo verification,
              GPS breadcrumbs, and automatic dispute resolution.
            </Typography>
            <Button href="/pricing" variant="contained" size="large" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 6, py: 1.5, fontSize: 18 }}>
              Start Your Free Trial →
            </Button>
            <Typography variant="body2" sx={{ color: '#888', mt: 2 }}>
              No credit card required • 14‑day trial • Cancel anytime
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box sx={{ bgcolor: '#1A1A1A', borderRadius: 4, p: 3, border: '1px solid #333' }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#F44336' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FF9800' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#4CAF50' }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Box sx={{ width: '60%', height: 100, bgcolor: '#0A0A0A', borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" sx={{ color: '#888' }}>Live Profit Pulse</Typography>
                  <Typography variant="h5" sx={{ color: '#4CAF50' }}>34.2%</Typography>
                </Box>
                <Box sx={{ width: '40%', height: 100, bgcolor: '#0A0A0A', borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" sx={{ color: '#888' }}>Active Jobs</Typography>
                  <Typography variant="h5" sx={{ color: '#00D4FF' }}>12</Typography>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* ---- Trusted By ---- */}
      <Box sx={{ borderTop: '1px solid #222', borderBottom: '1px solid #222', py: 3 }}>
        <Container maxWidth="lg">
          <Typography align="center" sx={{ color: '#888', mb: 2 }}>
            Trusted by field service companies across North America
          </Typography>
        </Container>
      </Box>

      {/* ---- Features ---- */}
      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Typography variant="h3" align="center" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
          Why Choose Future Jobs Pro AI?
        </Typography>
        <Typography variant="h6" align="center" sx={{ color: '#888', mb: 6 }}>
          Stop guessing. Start knowing. Every job, every time.
        </Typography>

        <Grid container spacing={4}>
          {[
            { icon: <PhotoCamera sx={{ fontSize: 40, color: '#00D4FF' }} />, title: 'AI Photo Compliance', desc: 'Our AI analyzes photos BEFORE upload. Know immediately if your photo will hold up in a dispute.' },
            { icon: <LocationOn sx={{ fontSize: 40, color: '#4CAF50' }} />, title: 'GPS Breadcrumb Trails', desc: 'Complete location history proves exactly where your team was and for how long.' },
            { icon: <Mic sx={{ fontSize: 40, color: '#FF9800' }} />, title: 'Voice‑to‑Text Notes', desc: 'Hands‑free documentation. Speak your notes and our AI creates professional summaries.' },
            { icon: <Security sx={{ fontSize: 40, color: '#E91E63' }} />, title: 'Auto‑Dispute Evidence', desc: 'One click generates a tamper‑proof PDF with all evidence. Win disputes instantly.' },
            { icon: <Speed sx={{ fontSize: 40, color: '#9C27B0' }} />, title: 'Real‑Time Profit Tracking', desc: 'See your margin change as work happens. Stop losing money before month‑end.' },
            { icon: <CheckCircle sx={{ fontSize: 40, color: '#00BCD4' }} />, title: '14‑Day Free Trial', desc: 'Try everything risk‑free. No credit card required to start.' },
          ].map((feature, index) => (
            <Grid item xs={12} md={4} key={index}>
              <Card sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', height: '100%' }}>
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ mb: 3 }}>{feature.icon}</Box>
                  <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>{feature.title}</Typography>
                  <Typography variant="body2" sx={{ color: '#AAA', lineHeight: 1.6 }}>{feature.desc}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* ---- CTA ---- */}
      <Box sx={{ bgcolor: '#1A1A1A', py: 8, borderTop: '1px solid #333' }}>
        <Container maxWidth="md" sx={{ textAlign: 'center' }}>
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
            Ready to Stop Losing Money to Disputes?
          </Typography>
          <Typography variant="body1" sx={{ color: '#AAA', mb: 4 }}>
            Join field service businesses using Future Jobs Pro AI to protect their revenue.
          </Typography>
          <Button href="/pricing" variant="contained" size="large" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 6, py: 1.5, fontSize: 18, fontWeight: 'bold' }}>
            Start Your Free Trial →
          </Button>
          <Typography variant="body2" sx={{ color: '#888', mt: 2 }}>
            No credit card required • 14‑day trial • Cancel anytime
          </Typography>
        </Container>
      </Box>

      {/* ---- Footer ---- */}
      <Box sx={{ bgcolor: '#0A0A0A', py: 4, borderTop: '1px solid #222' }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            <Grid item xs={12} md={4}>
              <Typography sx={{ color: '#00D4FF', fontWeight: 'bold', mb: 2 }}>🚀 Future Jobs Pro AI</Typography>
              <Typography variant="body2" sx={{ color: '#888' }}>Field Intelligence • Real‑Time Results</Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>Product</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Features</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Pricing</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Demo</Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>Company</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>About</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Blog</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Contact</Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>Legal</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Privacy</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Terms</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Security</Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>Social</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>Twitter</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>LinkedIn</Typography>
              <Typography sx={{ color: '#888', fontSize: 14, mb: 0.5 }}>YouTube</Typography>
            </Grid>
          </Grid>
          <Typography align="center" sx={{ color: '#555', fontSize: 14, mt: 6 }}>
            © 2024 Future Jobs Pro AI – Created by Samuel B. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}