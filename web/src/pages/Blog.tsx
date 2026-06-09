import React from 'react';
import { Box, Container, Typography, Grid, Card, CardContent, CardActionArea, Chip } from '@mui/material';
import { CalendarToday } from '@mui/icons-material';

const posts = [
  {
    title: 'How AI Is Changing Field Service Management',
    date: 'June 1, 2026',
    excerpt: 'Discover how artificial intelligence is transforming the way field service companies operate, from automated photo compliance to predictive scheduling.',
    category: 'Technology',
  },
  {
    title: '5 Ways to Reduce Disputed Invoices',
    date: 'May 15, 2026',
    excerpt: 'Learn the top strategies for eliminating payment disputes with proper documentation, GPS tracking, and real‑time reporting.',
    category: 'Business',
  },
  {
    title: 'Introducing Lucy: Your AI Workforce Assistant',
    date: 'June 5, 2026',
    excerpt: 'Meet Lucy — the voice‑powered assistant that can run payroll, create schedules, and generate reports with a simple spoken command.',
    category: 'Product',
  },
];

export default function Blog() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 8 }}>
      <Container maxWidth="lg">
        <Typography variant="h3" align="center" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
          Blog
        </Typography>
        <Typography variant="h6" align="center" sx={{ color: '#888', mb: 6 }}>
          Insights, tips, and updates from the Future Jobs Pro AI team.
        </Typography>

        <Grid container spacing={4}>
          {posts.map((post, idx) => (
            <Grid item xs={12} md={4} key={idx}>
              <Card sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', height: '100%' }}>
                <CardActionArea>
                  <CardContent sx={{ p: 4 }}>
                    <Chip label={post.category} size="small" sx={{ bgcolor: '#00D4FF20', color: '#00D4FF', mb: 2 }} />
                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>{post.title}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <CalendarToday sx={{ fontSize: 14, color: '#888' }} />
                      <Typography variant="caption" sx={{ color: '#888' }}>{post.date}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#AAA', lineHeight: 1.6 }}>{post.excerpt}</Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}