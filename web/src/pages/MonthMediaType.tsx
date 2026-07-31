import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Paper, Grid, Card, CardContent,
  CircularProgress, Alert, Button, Breadcrumbs, Link,
  IconButton, Dialog, DialogContent, DialogTitle,
  ImageListItem, ImageListItemBar, List, ListItem, ListItemText,
  ListItemSecondaryAction, Chip,
} from '@mui/material';
import {
  PhotoLibrary, Videocam, Mic, ArrowBack, PlayArrow, Pause,
  Close, ErrorOutline, InsertPhoto, VolumeUp,
} from '@mui/icons-material';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface MediaItem {
  id: string;
  type: 'photo' | 'video' | 'voice_note';
  url: string;
  taken_at: string;
  transcript?: string;
  duration?: number;
  verification_hash?: string;
}

export default function MonthMediaType() {
  const navigate = useNavigate();
  const { projectId, yearMonth, mediaType } = useParams<{
    projectId: string;
    yearMonth: string;
    mediaType: 'photo' | 'video' | 'voice_note';
  }>();
  const location = useLocation();
  const { projectName } = location.state || { projectName: 'Project' };
  const token = localStorage.getItem('token') || '';

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!projectId || !yearMonth || !mediaType) {
      setError('Missing parameters');
      setLoading(false);
      return;
    }
    fetchMedia();
  }, [projectId, yearMonth, mediaType]);

  const fetchMedia = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/media/project/${projectId}/month/${yearMonth}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load media');
      const data = await res.json();
      const allMedia = data.media || [];
      const filtered = allMedia.filter((m: any) => m.type === mediaType);
      setMedia(filtered);
    } catch (err: any) {
      setError(err.message || 'Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAudio = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (!url) return;
    const audio = new Audio(url);
    audio.onended = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
    audioRef.current = audio;
  };

  const handleStopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  };

  const renderMediaItem = (item: MediaItem) => {
    const isPhoto = item.type === 'photo';
    const isVideo = item.type === 'video';
    const isVoice = item.type === 'voice_note';
    const hasAudio = isVoice && item.url && item.url !== 'null' && item.url !== '';

    return (
      <Card key={item.id} sx={{ bgcolor: '#1A1A1A', border: '1px solid #333', mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Thumbnail */}
          <Box sx={{ width: 80, height: 80, flexShrink: 0, bgcolor: '#333', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isPhoto && <img src={item.url} alt="thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />}
            {isVideo && <Videocam sx={{ fontSize: 32, color: '#FFF' }} />}
            {isVoice && (
              <IconButton
                onClick={() => {
                  if (isPlaying) handleStopAudio();
                  else if (hasAudio) handlePlayAudio(item.url);
                }}
                disabled={!hasAudio}
                sx={{ color: hasAudio ? '#00D4FF' : '#888' }}
              >
                {isPlaying ? <Pause /> : <PlayArrow />}
              </IconButton>
            )}
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" sx={{ color: '#FFF' }}>
              {isPhoto ? '📷 Photo' : isVideo ? '🎬 Video' : '🎙️ Voice Note'}
            </Typography>
            <Typography variant="caption" sx={{ color: '#888' }}>
              {new Date(item.taken_at).toLocaleString()}
            </Typography>
            {isVoice && item.transcript && (
              <Typography variant="body2" sx={{ color: '#AAA', mt: 1 }}>
                {item.transcript}
              </Typography>
            )}
            {item.verification_hash && (
              <Chip label={`🔒 ${item.verification_hash.slice(0, 8)}`} size="small" sx={{ mt: 1, bgcolor: '#333', color: '#4CAF50' }} />
            )}
          </Box>

          <IconButton onClick={() => setSelectedMedia(item)} sx={{ color: '#00D4FF' }}>
            <InsertPhoto />
          </IconButton>
        </CardContent>
      </Card>
    );
  };

  const typeLabels: Record<string, string> = {
    photo: 'Photos',
    video: 'Videos',
    voice_note: 'Voice Notes',
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
          <Button variant="contained" onClick={fetchMedia} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>
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
          {projectName} - {yearMonth} - {typeLabels[mediaType || ''] || mediaType}
        </Typography>
      </Box>

      <Breadcrumbs separator={<span style={{ color: '#888' }}>/</span>} sx={{ mb: 3, color: '#888' }}>
        <Link underline="hover" color="inherit" href="/dashboard" sx={{ color: '#888' }}>Dashboard</Link>
        <Link underline="hover" color="inherit" href="/media" sx={{ color: '#888' }}>Media</Link>
        <Link underline="hover" color="inherit" href={`/media/project/${projectId}`} sx={{ color: '#888' }}>{projectName}</Link>
        <Link underline="hover" color="inherit" href={`/media/project/${projectId}/month/${yearMonth}`} sx={{ color: '#888' }}>{yearMonth}</Link>
        <Typography sx={{ color: '#FFF' }}>{typeLabels[mediaType || ''] || mediaType}</Typography>
      </Breadcrumbs>

      {media.length === 0 ? (
        <Paper sx={{ p: 4, bgcolor: '#1A1A1A', border: '1px solid #333', textAlign: 'center' }}>
          <Typography variant="body1" sx={{ color: '#888' }}>No {typeLabels[mediaType || ''] || mediaType} found.</Typography>
        </Paper>
      ) : (
        <Box>
          {media.map(renderMediaItem)}
        </Box>
      )}

      {/* Full-screen Modal */}
      <Dialog open={!!selectedMedia} onClose={() => setSelectedMedia(null)} maxWidth="lg" fullWidth>
        {selectedMedia && (
          <>
            <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">{selectedMedia.type}</Typography>
              <IconButton onClick={() => setSelectedMedia(null)} sx={{ color: '#FFF' }}>
                <Close />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ bgcolor: '#0A0A0A', p: 3, textAlign: 'center' }}>
              {selectedMedia.type === 'photo' && (
                <img src={selectedMedia.url} alt="media" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
              )}
              {selectedMedia.type === 'video' && (
                <video src={selectedMedia.url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh' }} />
              )}
              {selectedMedia.type === 'voice_note' && (
                <Box sx={{ p: 4 }}>
                  <audio controls src={selectedMedia.url} style={{ width: '100%' }} />
                  {selectedMedia.transcript && (
                    <Typography variant="body1" sx={{ color: '#FFF', mt: 2 }}>{selectedMedia.transcript}</Typography>
                  )}
                  {selectedMedia.duration && (
                    <Typography variant="caption" sx={{ color: '#888' }}>Duration: {selectedMedia.duration}s</Typography>
                  )}
                </Box>
              )}
              {selectedMedia.verification_hash && (
                <Typography variant="caption" sx={{ color: '#4CAF50', mt: 2, display: 'block' }}>
                  🔒 {selectedMedia.verification_hash}
                </Typography>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </Container>
  );
}