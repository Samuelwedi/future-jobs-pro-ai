import { captureAuthSession, getAuthRevision } from '../services/authSession';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Box, Container, Typography, Paper, Grid, Card, CardContent,
  CircularProgress, Alert, Button, Breadcrumbs, Link,
  IconButton, Dialog, DialogContent, DialogTitle,
  ImageListItem, ImageListItemBar, List, ListItem, ListItemText,
  ListItemSecondaryAction, Chip,
} from '@mui/material';
import {
  PhotoLibrary, Videocam, Mic, ArrowBack, PlayArrow, Pause,
  Close, ErrorOutline, InsertPhoto, VolumeUp, Download,
} from '@mui/icons-material';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { downloadMedia } from '../services/mediaDownload';
import { API_BASE } from '../services/api';

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
  const [, refreshView] = useState(0);
  const revision = getAuthRevision();
  const auth = captureAuthSession();
  let owner: { id: string; company: string; token: string; role: string } | null = null;
  try {
    const token = localStorage.getItem('token') || '';
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const company = user?.companyId ?? user?.company_id;
    if (token && user?.id && company) owner = { id: String(user.id), company: String(company), token, role: String(user.role || '') };
  } catch { /* Unknown identity cannot retain a private view. */ }
  const ownerKey = owner ? JSON.stringify(owner) : '';
  const routeKey = JSON.stringify([location.pathname, location.search, location.hash, location.key]);
  const browserRouteKey = () => JSON.stringify([window.location.pathname, window.location.search, window.location.hash, window.history.state?.key || 'default']);
  const scope = JSON.stringify([ownerKey, revision, routeKey, projectId, yearMonth, mediaType]);
  const epoch = useRef({ scope, version: 0 });
  if (epoch.current.scope !== scope) epoch.current = { scope, version: epoch.current.version + 1 };
  const version = epoch.current.version;
  const mounted = useRef(true);
  const active = useRef(document.visibilityState !== 'hidden');
  const sequence = useRef(0), selectionSequence = useRef(0);
  const request = useRef<{ version: number; controller: AbortController } | null>(null);
  type Data = { version: number; sequence: number; rows: MediaItem[] };
  type Selection = { data: Data; item: MediaItem; sequence: number };
  const dataRef = useRef<Data | null>(null), selectionRef = useRef<Selection | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loadState, setLoadState] = useState<{ version: number; loading: boolean; error: string | null } | null>(null);
  const [downloadState, setDownloadState] = useState<{ version: number; id: string | null; error: string } | null>(null);
  const downloadRef = useRef<object | null>(null);
  const [playing, setPlaying] = useState<{ version: number; id: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inlineMediaRef = useRef<HTMLMediaElement | null>(null);
  const currentView = () => mounted.current && active.current && document.visibilityState !== 'hidden'
    && epoch.current.version === version && epoch.current.scope === scope && auth.isCurrent()
    && browserRouteKey() === routeKey && !!owner;
  const displayed = data && data === dataRef.current && data.version === version && currentView() ? data : null;
  const media = displayed?.rows || [];
  const displayedSelection = displayed && selection && selection === selectionRef.current && selection.data === displayed ? selection : null;
  const selectedMedia = displayedSelection?.item || null;
  const loading = currentView() && (!loadState || loadState.version !== version || loadState.loading);
  const error = currentView() && loadState?.version === version ? loadState.error : null;
  const downloading = currentView() && downloadState?.version === version ? downloadState.id : null;
  const downloadError = currentView() && downloadState?.version === version ? downloadState.error : '';
  const isPlaying = currentView() && playing?.version === version;
  const canUseItem = (item: MediaItem) => currentView() && displayed !== null && dataRef.current === displayed && displayed.rows.includes(item);
  const releasePlayback = () => {
    const audio = audioRef.current; audioRef.current = null;
    if (audio) { audio.onended = null; try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch {} }
    const inline = inlineMediaRef.current;
    if (inline) { try { inline.pause(); inline.removeAttribute('src'); inline.load(); } catch {} }
  };
  const invalidate = (rerender = true) => {
    epoch.current.version++; sequence.current++; selectionSequence.current++;
    dataRef.current = null; selectionRef.current = null;
    request.current?.controller.abort(); releasePlayback();
    if (rerender && mounted.current) refreshView(value => value + 1);
  };
  // Auth writers invalidate synchronously, including A -> B -> A. Route/focus
  // events also revoke retained callbacks before a later React effect runs.
  useLayoutEffect(() => {
    const remount = !mounted.current;
    mounted.current = true;
    active.current = document.visibilityState !== 'hidden';
    if (remount) refreshView(value => value + 1);
    const identityChanged = () => invalidate();
    const leave = () => { active.current = false; invalidate(); };
    const enter = () => { active.current = document.visibilityState !== 'hidden'; invalidate(); };
    const visibility = () => document.visibilityState === 'hidden' ? leave() : enter();
    for (const event of ['auth-session-changed', 'auth-user-updated', 'popstate']) window.addEventListener(event, identityChanged);
    for (const event of ['blur', 'pagehide']) window.addEventListener(event, leave);
    for (const event of ['focus', 'pageshow']) window.addEventListener(event, enter);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false; active.current = false; invalidate(false);
      for (const event of ['auth-session-changed', 'auth-user-updated', 'popstate']) window.removeEventListener(event, identityChanged);
      for (const event of ['blur', 'pagehide']) window.removeEventListener(event, leave);
      for (const event of ['focus', 'pageshow']) window.removeEventListener(event, enter);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  // Stop resources from the previous rendered scope before the new view paints.
  useLayoutEffect(() => { releasePlayback(); }, [scope, version]);

  const fetchMedia = async () => {
    if (!currentView() || !projectId || !yearMonth || !['photo', 'video', 'voice_note'].includes(mediaType || '')) return;
    const mine = ++sequence.current;
    request.current?.controller.abort();
    const controller = new AbortController(); request.current = { version, controller };
    dataRef.current = null; selectionRef.current = null; selectionSequence.current++;
    releasePlayback(); setSelection(null); setPlaying(null);
    setLoadState({ version, loading: true, error: null });
    const current = () => currentView() && sequence.current === mine && !controller.signal.aborted;
    try {
      const response = await fetch(`${API_BASE}/api/media/project/${encodeURIComponent(projectId)}/month/${encodeURIComponent(yearMonth)}`, {
        headers: { Authorization: `Bearer ${owner!.token}` }, signal: controller.signal, cache: 'no-store',
      });
      if (!current()) return;
      const body = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error('Failed to load media');
      if (!Array.isArray(body?.media)) throw new Error('Media response unavailable');
      const rows = body.media.filter((item: any) => item && item.type === mediaType && typeof item.id === 'string' && item.id
        && typeof item.url === 'string');
      const next = { version, sequence: mine, rows }; dataRef.current = next; setData(next);
      setLoadState({ version, loading: false, error: null });
    } catch (caught) {
      if (current()) setLoadState({ version, loading: false, error: 'Failed to load media' });
    }
  };
  useEffect(() => {
    void fetchMedia();
    return () => { if (request.current?.version === version) request.current.controller.abort(); };
  }, [scope, version]);

  const openMedia = (item: MediaItem) => {
    if (!canUseItem(item)) return;
    releasePlayback(); setPlaying(null);
    const next = { data: displayed!, item, sequence: ++selectionSequence.current };
    selectionRef.current = next; setSelection(next);
  };
  const closeMedia = () => {
    if (!currentView() || !displayedSelection || selectionRef.current !== displayedSelection) return;
    releasePlayback(); selectionSequence.current++; selectionRef.current = null; setSelection(null); setPlaying(null);
  };
  const handleDownload = async (item: MediaItem, fromSelection?: Selection) => {
    const current = () => canUseItem(item) && (!fromSelection || selectionRef.current === fromSelection);
    if (!current() || downloadRef.current) return;
    const attempt = {}; downloadRef.current = attempt;
    setDownloadState({ version, id: item.id, error: '' });
    try { await downloadMedia(item, current); }
    catch { if (current()) setDownloadState({ version, id: null, error: 'Unable to download the file.' }); }
    finally {
      if (downloadRef.current === attempt) {
        downloadRef.current = null;
        if (current()) setDownloadState(previous => previous?.version === version ? { ...previous, id: null } : previous);
        if (mounted.current) refreshView(value => value + 1);
      }
    }
  };
  const handlePlayAudio = async (item: MediaItem) => {
    if (!canUseItem(item) || !item.url || item.url === 'null') return;
    releasePlayback();
    const audio = new Audio(item.url); audioRef.current = audio;
    const current = () => canUseItem(item) && audioRef.current === audio;
    audio.onended = () => { if (current()) { audioRef.current = null; setPlaying(null); } };
    try { await audio.play(); if (current()) setPlaying({ version, id: item.id }); else { audio.pause(); audio.removeAttribute('src'); audio.load(); } }
    catch { if (current()) { releasePlayback(); setPlaying(null); } }
  };
  const handleStopAudio = (item: MediaItem, expectedAudio: HTMLAudioElement | null) => {
    if (!canUseItem(item) || !expectedAudio || audioRef.current !== expectedAudio) return;
    releasePlayback(); setPlaying(null);
  };

  const renderMediaItem = (item: MediaItem) => {
    const isPhoto = item.type === 'photo';
    const isVideo = item.type === 'video';
    const isVoice = item.type === 'voice_note';
    const hasAudio = isVoice && item.url && item.url !== 'null' && item.url !== '';
    const renderedAudio = audioRef.current;

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
                  if (isPlaying && playing?.id === item.id) handleStopAudio(item, renderedAudio);
                  else if (hasAudio) void handlePlayAudio(item);
                }}
                disabled={!hasAudio}
                sx={{ color: hasAudio ? '#00D4FF' : '#888' }}
              >
                {isPlaying && playing?.id === item.id ? <Pause /> : <PlayArrow />}
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

          <IconButton aria-label={`Download ${item.type}`} title="Download file" disabled={Boolean(downloadRef.current)||!item.url||item.url==='null'} onClick={()=>void handleDownload(item)} sx={{color:'#00D4FF'}}>
            {downloading===item.id?<CircularProgress size={20}/>:<Download/>}
          </IconButton>
          <IconButton aria-label="Open media" onClick={() => openMedia(item)} sx={{ color: '#00D4FF' }}>
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

  if (!currentView()) return <Alert severity="info">Reopen this gallery in the current signed-in session.</Alert>;
  if (!projectId || !yearMonth || !['photo','video','voice_note'].includes(mediaType || '')) return <Alert severity="error">Missing parameters</Alert>;

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

      {downloadError&&<Alert severity="error" sx={{mb:2}} onClose={()=>{if(currentView())setDownloadState({version,id:downloading,error:''});}}>{downloadError}</Alert>}
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
      <Dialog open={!!selectedMedia} onClose={closeMedia} maxWidth="lg" fullWidth>
        {selectedMedia && (
          <>
            <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">{selectedMedia.type}</Typography>
              <Button startIcon={<Download/>} disabled={Boolean(downloadRef.current)||!selectedMedia.url||selectedMedia.url==='null'} onClick={()=>void handleDownload(selectedMedia, displayedSelection!)}>{downloading===selectedMedia.id?'Downloading...':'Download file'}</Button>
              <IconButton onClick={closeMedia} sx={{ color: '#FFF' }}>
                <Close />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ bgcolor: '#0A0A0A', p: 3, textAlign: 'center' }}>
              {downloadError&&<Alert severity="error" sx={{mb:2}}>{downloadError}</Alert>}
              {selectedMedia.type === 'photo' && (
                <img src={selectedMedia.url} alt="media" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
              )}
              {selectedMedia.type === 'video' && (
                <video ref={inlineMediaRef as React.RefObject<HTMLVideoElement>} src={selectedMedia.url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh' }} />
              )}
              {selectedMedia.type === 'voice_note' && (
                <Box sx={{ p: 4 }}>
                  <audio ref={inlineMediaRef as React.RefObject<HTMLAudioElement>} controls src={selectedMedia.url} style={{ width: '100%' }} />
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
