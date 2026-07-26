import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  CircularProgress,
  Alert,
  Breadcrumbs,
  Link,
  Button,
  IconButton,
} from '@mui/material';
import { Folder, ArrowBack, ChevronRight, ErrorOutline } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const API_BASE = (globalThis as any)?.process?.env?.REACT_APP_API_BASE || (import.meta as any)?.env?.VITE_API_BASE || 'https://future-jobs-pro-ai-production.up.railway.app';

interface Project {
  project_id: string;
  project_name: string;
  // Add other fields if needed
}

export default function MediaFolders() {
  const token = localStorage.getItem('token') || '';
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setError(null);
    setLoading(true);
    try {
      console.log('📂 Fetching media projects...');
      const res = await fetch(`${API_BASE}/api/media/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load projects');
      setProjects(data.projects || []);
      console.log(`✅ Found ${data.projects?.length || 0} projects`);
    } catch (e: any) {
      console.error('❌ Error fetching projects:', e);
      setError(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    fetchProjects();
  };

  // Go back – you may replace with your own navigation logic
  const handleBack = () => {
    navigate(-1);
  };

  // Navigate to project media view (you'll need to create that page later)
  const handleProjectClick = (projectId: string, projectName: string) => {
    navigate(`/media/project/${projectId}`, { state: { projectName } });
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
          <CircularProgress sx={{ color: '#00D4FF' }} />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
        <Paper sx={{ p: 4, bgcolor: '#1A1A1A', border: '1px solid #333', textAlign: 'center' }}>
          <ErrorOutline sx={{ fontSize: 48, color: '#F44336', mb: 2 }} />
          <Typography variant="h6" sx={{ color: '#FFF', mb: 2 }}>{error}</Typography>
          <Button variant="contained" onClick={handleRetry} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
            Retry
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      {/* Header with back button */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={handleBack} sx={{ color: '#FFF', mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold' }}>
          Media Folders
        </Typography>
      </Box>

      <Breadcrumbs separator={<ChevronRight sx={{ color: '#888' }} />} sx={{ mb: 3, color: '#888' }}>
        <Link underline="hover" color="inherit" href="/dashboard" sx={{ color: '#888' }}>
          Dashboard
        </Link>
        <Typography sx={{ color: '#FFF' }}>Media Folders</Typography>
      </Breadcrumbs>

      {projects.length === 0 ? (
        <Paper sx={{ p: 4, bgcolor: '#1A1A1A', border: '1px solid #333', textAlign: 'center' }}>
          <Typography variant="body1" sx={{ color: '#888' }}>No media folders found.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {projects.map((project) => (
            <Grid item xs={12} sm={6} md={4} key={project.project_id}>
              <Card
                sx={{
                  bgcolor: '#1A1A1A',
                  border: '1px solid #333',
                  borderRadius: 2,
                  transition: '0.2s',
                  '&:hover': {
                    borderColor: '#00D4FF',
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 24px rgba(0,212,255,0.15)',
                  },
                }}
              >
                <CardActionArea
                  onClick={() => handleProjectClick(project.project_id, project.project_name)}
                  sx={{ p: 2 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Folder sx={{ fontSize: 40, color: '#00D4FF', mr: 2 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 600 }}>
                        {project.project_name}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#888' }}>
                        Tap to view months
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