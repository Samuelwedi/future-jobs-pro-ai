import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Grid, Card, CardContent,
  AppBar, Toolbar, Chip, Link,
} from '@mui/material';
import {
  ArrowForward, AutoAwesome, CheckCircle, LocationOn, PhotoCamera, Mic,
  PlayCircleOutline, Security, Speed,
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
            <Button component={RouterLink} to="/demo" startIcon={<PlayCircleOutline />} sx={{ color: '#CBEAF0', mr: 1 }}>Live Demo</Button>
            <Button component={RouterLink} to="/login" sx={{ color: '#FFF', mr: 2 }}>Sign In</Button>
            <Button component={RouterLink} to="/pricing" variant="contained" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
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
              Bring scheduling, time tracking, projects, payroll preparation and field evidence into one secure workspace.
              Give your team clearer operations while keeping every important decision under human review.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button component={RouterLink} to="/demo" variant="outlined" size="large" startIcon={<PlayCircleOutline />} sx={{ borderColor: '#00D4FF66', color: '#DDFBFF', px: 3.5, py: 1.5 }}>Explore live demo</Button>
              <Button component={RouterLink} to="/pricing" variant="contained" size="large" endIcon={<ArrowForward />} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 4, py: 1.5, fontSize: 17 }}>Start free trial</Button>
            </Box>
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

      {/* ---- Interactive demo invitation ---- */}
      <Container maxWidth="lg" sx={{ pb: 10 }}>
        <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 5, p: { xs: 3, md: 5 }, bgcolor: '#0E1E32', border: '1px solid #29435F', boxShadow: '0 28px 80px rgba(0,0,0,.3)' }}>
          <Box sx={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', bgcolor: '#00D4FF13', filter: 'blur(8px)', right: -120, top: -170 }} />
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={7}>
              <Chip icon={<AutoAwesome />} label="INTERACTIVE PRODUCT TOUR" sx={{ color: '#8EF5C8', bgcolor: '#42E8A714', border: '1px solid #42E8A733', fontWeight: 900 }} />
              <Typography variant="h3" sx={{ color: '#FFF', fontWeight: 900, letterSpacing: -1, mt: 2 }}>Don’t take our word for it. Run the sample workspace.</Typography>
              <Typography sx={{ color: '#9BAEC2', fontSize: 16, lineHeight: 1.75, mt: 1.5 }}>Switch between field operations, evidence and Lucy AI. It is read-only, requires no account, and never touches production data.</Typography>
            </Grid>
            <Grid item xs={12} md={5} sx={{ textAlign: { md: 'right' } }}>
              <Button component={RouterLink} to="/demo" variant="contained" size="large" startIcon={<PlayCircleOutline />} sx={{ bgcolor: '#6FE7FF', color: '#06101D', px: 4, py: 1.6, fontWeight: 900, '&:hover': { bgcolor: '#A1F1FF' } }}>Open interactive demo</Button>
              <Typography sx={{ color: '#687D93', fontSize: 11, mt: 1.2 }}>No login · No API calls · Sample data only</Typography>
            </Grid>
          </Grid>
        </Box>
      </Container>

      {/* ---- Trusted By ---- */}
      <Box sx={{ borderTop: '1px solid #222', borderBottom: '1px solid #222', py: 3 }}>
        <Container maxWidth="lg">
          <Typography align="center" sx={{ color: '#888', mb: 2 }}>
            Built for growing field-service teams across North America
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
            { icon: <Security sx={{ fontSize: 40, color: '#E91E63' }} />, title: 'Dispute Evidence Reports', desc: 'Organize job records, timestamps, photos and location history into a reviewable evidence package.' },
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
          <Button component={RouterLink} to="/pricing" variant="contained" size="large" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 6, py: 1.5, fontSize: 18, fontWeight: 'bold' }}>
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
              <Link component={RouterLink} to="/features" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Features</Link>
              <Link component={RouterLink} to="/pricing" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Pricing</Link>
              <Link component={RouterLink} to="/demo" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Demo</Link>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>Company</Typography>
              <Link component={RouterLink} to="/about" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>About</Link>
              <Link component={RouterLink} to="/blog" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Blog</Link>
              <Link component={RouterLink} to="/contact" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Contact</Link>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>Legal</Typography>
              <Link component={RouterLink} to="/privacy" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Privacy</Link>
              <Link component={RouterLink} to="/terms" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Terms</Link>
              <Link component={RouterLink} to="/security" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Security</Link>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>Social</Typography>
              <Link href="https://twitter.com" target="_blank" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>Twitter</Link>
              <Link href="https://linkedin.com" target="_blank" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>LinkedIn</Link>
              <Link href="https://youtube.com" target="_blank" sx={{ color: '#888', fontSize: 14, mb: 0.5, display: 'block', textDecoration: 'none' }}>YouTube</Link>
            </Grid>
          </Grid>
          <Typography align="center" sx={{ color: '#555', fontSize: 14, mt: 6 }}>
            © {new Date().getFullYear()} Future Jobs Pro AI – Created by Samuel B. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
