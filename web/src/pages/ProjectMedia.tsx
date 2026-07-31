import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Grid, Card, CardActionArea,
  CircularProgress, Alert, Button, Breadcrumbs, Link,
} from '@mui/material';
import { FolderOpen, ChevronRight, ArrowBack, ErrorOutline } from '@mui/icons-material';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function ProjectMedia() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const { projectName } = location.state || { projectName: 'Project' };
  const token = localStorage.getItem('token') || '';

  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setError('No project selected');
      setLoading(false);
      return;
    }
    fetchMonths();
  }, [projectId]);

  const fetchMonths = async () => {
    setLoading(true);
    setError(null);
    try {
      // ✅ Exactly like the app: GET /media/project/:projectId/months
      const res = await fetch(`${API_BASE}/api/media/project/${projectId}/months`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load months');
      const data = await res.json();
      setMonths(data.months || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load months');
    } finally {
      setLoading(false);
    }
  };

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
          <Button variant="contained" onClick={fetchMonths} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
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
          {projectName}
        </Typography>
      </Box>

      <Breadcrumbs separator={<ChevronRight sx={{ color: '#888' }} />} sx={{ mb: 3, color: '#888' }}>
        <Link underline="hover" color="inherit" href="/dashboard" sx={{ color: '#888' }}>
          Dashboard
        </Link>
        <Link underline="hover" color="inherit" href="/media" sx={{ color: '#888' }}>
          Media Folders
        </Link>
        <Typography sx={{ color: '#FFF' }}>{projectName}</Typography>
      </Breadcrumbs>

      {months.length === 0 ? (
        <Paper sx={{ p: 4, bgcolor: '#1A1A1A', border: '1px solid #333', textAlign: 'center' }}>
          <Typography variant="body1" sx={{ color: '#888' }}>No months with media</Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {months.map((month) => (
            <Grid item xs={12} sm={6} md={4} key={month}>
              <Card
                sx={{
                  bgcolor: '#1A1A1A',
                  border: '1px solid #333',
                  borderRadius: 2,
                  transition: '0.2s',
                  '&:hover': {
                    borderColor: '#FF9800',
                    transform: 'translateY(-4px)',
                  },
                }}
              >
                <CardActionArea
                  onClick={() =>
                    navigate(`/media/project/${projectId}/month/${month}`, {
                      state: { projectName, yearMonth: month },
                    })
                  }
                  sx={{ p: 2 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <FolderOpen sx={{ fontSize: 40, color: '#FF9800', mr: 2 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 600 }}>
                        {month}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#888' }}>
                        Tap to view media types
                      </Typography>
                    </Box>
                    <ChevronRight sx={{ color: '#888' }} />
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}