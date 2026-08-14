import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, LinearProgress, Paper, Stack, Typography,
} from '@mui/material';
import { Description, Download, Map, Mic, Movie, PhotoLibrary, PictureAsPdf } from '@mui/icons-material';
import { API_BASE } from '../services/api';

type Options = { entry: any; photos: any[]; voiceNotes: any[]; attachments: any[]; gps: any[] };
const token = () => localStorage.getItem('token') || '';

export default function EvidencePackageDialog({ timeEntryId, onClose }: { timeEntryId: string; onClose: () => void }) {
  const [data, setData] = useState<Options | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [generated, setGenerated] = useState({ gpsVideo: true, timePdf: true, voiceVideos: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/evidence-bundles/time-entry/${timeEntryId}`, {
      headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store',
    }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.message);
      setData(body); const next: Record<string, boolean> = {};
      [...body.photos, ...body.voiceNotes, ...body.attachments].forEach((item: any) => { next[item.id] = true; });
      setSelected(next);
    }).catch((cause) => setError(cause.message));
  }, [timeEntryId]);

  const itemList = (items: any[], icon: React.ReactNode, label: (item: any) => string) => (
    <Stack gap={1}>{items.map((item) => <Paper key={item.id} variant="outlined" sx={{ px: 1.5 }}>
      <FormControlLabel control={<Checkbox checked={selected[item.id] !== false} onChange={(event) => setSelected({ ...selected, [item.id]: event.target.checked })} />}
        label={<Stack direction="row" gap={1} alignItems="center">{icon}<span>{label(item)}</span></Stack>} />
    </Paper>)}</Stack>
  );

  const directDownload = async (endpoint: string, fallback: string) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!response.ok) { const body = await response.json(); throw new Error(body.message); }
      const blob = await response.blob(); const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob); anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)/)?.[1] || fallback;
      anchor.click(); URL.revokeObjectURL(anchor.href);
    } catch (cause: any) { setError(cause.message); } finally { setBusy(false); }
  };

  const downloadPackage = async () => {
    if (!data) return; setBusy(true); setError('');
    try {
      const body = {
        photoIds: data.photos.filter((item) => selected[item.id]).map((item) => item.id),
        voiceNoteIds: data.voiceNotes.filter((item) => selected[item.id]).map((item) => item.id),
        attachmentIds: data.attachments.filter((item) => selected[item.id]).map((item) => item.id),
        includeGpsVideo: generated.gpsVideo,
        includeTimeEntryPdf: generated.timePdf,
        includeVoiceVideos: generated.voiceVideos,
      };
      const response = await fetch(`${API_BASE}/api/evidence-bundles/time-entry/${timeEntryId}/download`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body),
      });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message); }
      const blob = await response.blob(); const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob);
      anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)/)?.[1] || 'future-jobs-evidence.zip'; anchor.click(); URL.revokeObjectURL(anchor.href);
    } catch (cause: any) { setError(cause.message); } finally { setBusy(false); }
  };

  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
    <DialogTitle>Evidence Studio — select, generate, and download</DialogTitle>
    {busy && <LinearProgress />}
    <DialogContent>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!data && !error ? <CircularProgress /> : data && <Stack gap={2}>
        <Alert severity="info">Generated evidence is derived from the stored source records. The ZIP also includes originals, a GPS CSV, manifest, and SHA-256 verification information.</Alert>
        <Typography variant="h6" fontWeight={900}>Generated evidence</Typography>
        <Paper variant="outlined" sx={{ p: 2 }}><Stack gap={1}>
          <FormControlLabel control={<Checkbox checked={generated.gpsVideo} onChange={(e) => setGenerated({ ...generated, gpsVideo: e.target.checked })} />} label={<><Map sx={{ verticalAlign: 'middle', mr: 1 }} />Animated GPS trail playback video (MP4)</>} />
          <FormControlLabel control={<Checkbox checked={generated.timePdf} onChange={(e) => setGenerated({ ...generated, timePdf: e.target.checked })} />} label={<><PictureAsPdf sx={{ verticalAlign: 'middle', mr: 1 }} />Verified time-entry report (PDF)</>} />
          <FormControlLabel control={<Checkbox checked={generated.voiceVideos} onChange={(e) => setGenerated({ ...generated, voiceVideos: e.target.checked })} />} label={<><Movie sx={{ verticalAlign: 'middle', mr: 1 }} />Captioned waveform video for every selected voice note (MP4)</>} />
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mt={1}>
            <Button variant="outlined" disabled={busy || data.gps.length < 2} onClick={() => directDownload(`/api/evidence-bundles/time-entry/${timeEntryId}/gps-video`, `gps-trail-${timeEntryId}.mp4`)}>Download GPS video only</Button>
            <Button variant="outlined" disabled={busy} onClick={() => directDownload(`/api/evidence-bundles/time-entry/${timeEntryId}/time-entry-pdf`, `time-entry-${timeEntryId}.pdf`)}>Download time PDF only</Button>
          </Stack>
          {data.gps.length < 2 && <Typography variant="caption" color="warning.main">A GPS video needs at least two recorded trail points. The PDF and other evidence remain available.</Typography>}
        </Stack></Paper>

        <Typography fontWeight={900}>Photos and job videos ({data.photos.length})</Typography>
        {itemList(data.photos, <PhotoLibrary />, (item) => `${item.file_type === 'video' ? 'Video' : 'Photo'} · ${new Date(item.taken_at).toLocaleString()}`)}
        <Typography fontWeight={900}>Voice notes ({data.voiceNotes.length})</Typography>
        {itemList(data.voiceNotes, <Mic />, (item) => `${Math.round(item.duration_seconds || 0)} sec · ${String(item.transcript || 'No transcript').slice(0, 100)}`)}
        {data.voiceNotes.filter((item) => selected[item.id] && item.url).map((item) => <Box key={`video-${item.id}`}>
          <Button size="small" startIcon={<Movie />} disabled={busy} onClick={() => directDownload(`/api/evidence-bundles/voice-note/${item.id}/caption-video`, `voice-${item.id}.mp4`)}>Download this captioned voice video</Button>
        </Box>)}
        <Typography fontWeight={900}>Documents ({data.attachments.length})</Typography>
        {itemList(data.attachments, <Description />, (item) => item.file_name)}
      </Stack>}
    </DialogContent>
    <DialogActions><Button onClick={onClose} disabled={busy}>Close</Button><Button variant="contained" startIcon={busy ? <CircularProgress size={16} /> : <Download />} onClick={downloadPackage} disabled={!data || busy}>{busy ? 'Generating evidence…' : 'Generate all-in-one ZIP'}</Button></DialogActions>
  </Dialog>;
}
