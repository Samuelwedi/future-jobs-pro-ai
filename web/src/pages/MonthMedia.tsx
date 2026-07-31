import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Grid, Card, CardActionArea,
  CircularProgress, Alert, Button, Breadcrumbs, Link,
} from '@mui/material';
import {
  PhotoLibrary, Videocam, Mic, ChevronRight, ArrowBack, ErrorOutline,
} from '@mui/icons-material';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface MediaCounts {
  photos: number;
  videos: number;
  voice_notes: number;
}

export default function MonthMedia() {
  const navigate = useNavigate();
  const { projectId, yearMonth } = useParams<{ projectId: string; yearMonth: string }>();
  const location = useLocation();
  const { projectName } = location.state || { projectName: 'Project' };
  const token = localStorage.getItem('token') || '';

  const [counts, setCounts] = useState<MediaCounts>({ photos: 0, videos: 0, voice_notes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !yearMonth) {
      setError('Missing project or month');
      setLoading(false);
      return;
    }
    fetchCounts();
  }, [projectId, yearMonth]);

  const fetchCounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/media/project/${projectId}/month/${yearMonth}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load media');
      const data = await res.json();
      const media = data.media || [];
      const photos = media.filter((m: any) => m.type === 'photo').length;
      const videos = media.filter((m: any) => m.type === 'video').length;
      const voice_notes = media.filter((m: any) => m.type === 'voice_note').length;
      setCounts({ photos, videos, voice_notes });
    } catch (err: any) {
      setError(err.message || 'Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  const folderTypes = [
    { type: 'photo', label: 'Photos', icon: <PhotoLibrary />, color: '#00D4FF', count: counts.photos },
    { type: 'video', label: 'Videos', icon: <Videocam />, color: '#FF9800', count: counts.videos },
    { type: 'voice_note', label: 'Voice Notes', icon: <Mic />, color: '#4CAF50', count: counts.voice_notes },
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Paper sx={{ p: 4, bgcolor: '#1A1A1A', border: '1px solid #333', textAlign: 'center' }}>
          <ErrorOutline sx={{ fontSize: 48, color: '#F44336', mb: 2 }} />
          <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>{error}</Typography>
          <Button variant="contained" onClick={fetchCounts} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
            Retry
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate(-1)}
          sx={{ color: '#FFF', mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
          {projectName} - {yearMonth}
        </Typography>
      </Box>

      <Breadcrumbs separator={<ChevronRight sx={{ color: '#888' }} />} sx={{ mb: 3, color: '#888' }}>
        <Link underline="hover" color="inherit" href="/dashboard" sx={{ color: '#888' }}>
          Dashboard
        </Link>
        <Link underline="hover" color="inherit" href="/media" sx={{ color: '#888' }}>
          Media Folders
        </Link>
        <Link underline="hover" color="inherit" href={`/media/project/${projectId}`} sx={{ color: '#888' }}>
          {projectName}
        </Link>
        <Typography sx={{ color: '#FFF' }}>{yearMonth}</Typography>
      </Breadcrumbs>

      <Grid container spacing={3}>
        {folderTypes.map((folder) => (
          <Grid item xs={12} sm={6} md={4} key={folder.type}>
            <Card
              sx={{
                bgcolor: '#1A1A1A',
                border: `2px solid ${folder.color}`,
                borderRadius: 2,
                transition: '0.2s',
                '&:hover': {
                  transform: 'scale(1.03)',
                  boxShadow: `0 8px 24px rgba(0,0,0,0.3)`,
                },
              }}
            >
              <CardActionArea
                onClick={() => {
                  navigate(`/media/project/${projectId}/month/${yearMonth}/type/${folder.type}`, {
                    state: { projectName, yearMonth, mediaType: folder.type },
                  });
                }}
                sx={{ p: 3, textAlign: 'center' }}
              >
                <Box sx={{ fontSize: 48, color: folder.color }}>{folder.icon}</Box>
                <Typography variant="h6" sx={{ color: '#FFF', mt: 1 }}>
                  {folder.label}
                </Typography>
                <Typography variant="body2" sx={{ color: '#888' }}>
                  {folder.count} items
                </Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}