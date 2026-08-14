import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Grid, IconButton,
  Paper, Stack, Switch, Typography,
} from '@mui/material';
import {
  ArrowBack, GraphicEq, Mic, MicOff, RecordVoiceOver, SecurityOutlined,
  StopCircleOutlined, VolumeOff, VolumeUp,
} from '@mui/icons-material';
import { api } from '../services/api';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

const examples = [
  'Who is scheduled today?',
  'Show me the Downtown project',
  'How do I prepare payroll?',
  'Open my timesheet',
];

function speechRecognitionConstructor(): any {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

export default function VoiceAssistant() {
  const navigate = useNavigate();
  const recognitionRef = useRef<any>(null);
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [spokenReplies, setSpokenReplies] = useState(true);
  const supported = Boolean(speechRecognitionConstructor());

  useEffect(() => () => {
    recognitionRef.current?.stop?.();
    window.speechSynthesis?.cancel();
  }, []);

  const speak = (text: string) => {
    if (!spokenReplies || !('speechSynthesis' in window)) { setState('idle'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-CA';
    utterance.rate = 1;
    utterance.onstart = () => setState('speaking');
    utterance.onend = () => setState('idle');
    utterance.onerror = () => setState('idle');
    window.speechSynthesis.speak(utterance);
  };

  const askLucy = async (command: string) => {
    const cleanCommand = command.trim();
    if (!cleanCommand) return;
    setTranscript(cleanCommand);
    setAnswer('');
    setError('');
    setState('thinking');
    try {
      const data = await api.post<{ text?: string }>('/api/lucy', { message: cleanCommand });
      const text = data.text?.trim() || 'Lucy completed the request but did not return a spoken response.';
      setAnswer(text);
      speak(text);
    } catch (requestError: any) {
      setError(requestError.message || 'Lucy could not process that request');
      setState('idle');
    }
  };

  const startListening = () => {
    if (!supported || state === 'thinking') return;
    setError('');
    setTranscript('');
    setAnswer('');
    window.speechSynthesis?.cancel();
    const Recognition = speechRecognitionConstructor();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-CA';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setState('listening');
    recognition.onresult = (event: any) => {
      const combined = Array.from(event.results as ArrayLike<any>)
        .map((result: any) => result[0]?.transcript || '').join(' ').trim();
      setTranscript(combined);
      const last = event.results[event.results.length - 1];
      if (last?.isFinal) void askLucy(combined);
    };
    recognition.onerror = (event: any) => {
      setState('idle');
      setError(event.error === 'not-allowed' ? 'Microphone permission was denied. Allow microphone access in your browser settings.' : `Voice recognition stopped: ${event.error}`);
    };
    recognition.onend = () => setState((current) => current === 'listening' ? 'idle' : current);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop?.();
    window.speechSynthesis?.cancel();
    setState('idle');
  };

  const stateLabel = { idle: 'Ready', listening: 'Listening', thinking: 'Lucy is thinking', speaking: 'Lucy is speaking' }[state];

  return (
    <Box sx={{ bgcolor: '#070B10', minHeight: '100vh', py: { xs: 2, md: 5 } }}>
      <Container maxWidth="lg">
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/dashboard')} sx={{ color: '#8FA5B8', mb: 2 }}>Dashboard</Button>
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ minHeight: 620, p: { xs: 3, md: 5 }, bgcolor: '#10161E', border: '1px solid #22303E', borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Chip icon={<GraphicEq />} label={stateLabel} sx={{ color: state === 'idle' ? '#8FA5B8' : '#00D4FF', bgcolor: '#0A1118', border: '1px solid #263645' }} />
              <Typography variant="h3" sx={{ color: '#FFF', fontWeight: 850, mt: 3, fontSize: { xs: 34, md: 48 } }}>Talk to Lucy</Typography>
              <Typography sx={{ color: '#91A0B2', maxWidth: 560, mt: 1.5 }}>Use push-to-talk for secure, hands-free guidance and authorized operational questions.</Typography>

              <Box sx={{ position: 'relative', my: 5 }}>
                {state === 'listening' && <Box sx={{ position: 'absolute', inset: -18, borderRadius: '50%', border: '2px solid #00D4FF', animation: 'pulse 1.4s infinite', '@keyframes pulse': { '0%': { opacity: 1, transform: 'scale(.8)' }, '100%': { opacity: 0, transform: 'scale(1.25)' } } }} />}
                <IconButton onClick={state === 'idle' ? startListening : stopListening} disabled={!supported || state === 'thinking'} sx={{ width: 132, height: 132, bgcolor: state === 'listening' ? '#FF5C72' : '#00D4FF', color: '#061017', '&:hover': { bgcolor: state === 'listening' ? '#FF7A8C' : '#52E2FF' }, '&.Mui-disabled': { bgcolor: '#273340', color: '#75879A' } }}>
                  {state === 'listening' ? <StopCircleOutlined sx={{ fontSize: 56 }} /> : state === 'thinking' ? <CircularProgress size={48} /> : <Mic sx={{ fontSize: 56 }} />}
                </IconButton>
              </Box>

              {!supported && <Alert severity="warning" sx={{ width: '100%', textAlign: 'left' }}>This browser does not provide speech recognition. Use current Chrome or Edge, or type to Lucy from Ask Lucy.</Alert>}
              {error && <Alert severity="error" onClose={() => setError('')} sx={{ width: '100%', textAlign: 'left', mb: 2 }}>{error}</Alert>}
              {(transcript || answer) && <Paper variant="outlined" sx={{ width: '100%', textAlign: 'left', p: 2.5, bgcolor: '#0B1118', borderColor: '#263645', borderRadius: 3 }}>
                {transcript && <><Typography variant="caption" sx={{ color: '#00D4FF', letterSpacing: 1 }}>YOU SAID</Typography><Typography sx={{ color: '#FFF', mt: .5, mb: answer ? 2 : 0 }}>{transcript}</Typography></>}
                {answer && <><Typography variant="caption" sx={{ color: '#A58BFF', letterSpacing: 1 }}>LUCY</Typography><Typography sx={{ color: '#DDE6EE', mt: .5, whiteSpace: 'pre-wrap' }}>{answer}</Typography></>}
              </Paper>}
            </Paper>
          </Grid>
          <Grid item xs={12} md={5}>
            <Stack spacing={3}>
              <Paper sx={{ p: 3, bgcolor: '#10161E', border: '1px solid #22303E', borderRadius: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography sx={{ color: '#FFF', fontWeight: 750 }}>Spoken replies</Typography><Typography variant="body2" sx={{ color: '#8192A5' }}>Read Lucy’s answer aloud</Typography></Box><Switch checked={spokenReplies} onChange={(e) => setSpokenReplies(e.target.checked)} icon={<VolumeOff />} checkedIcon={<VolumeUp />} /></Stack>
              </Paper>
              <Paper sx={{ p: 3, bgcolor: '#10161E', border: '1px solid #22303E', borderRadius: 3 }}>
                <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 750, mb: 2 }}>Try saying</Typography>
                <Stack spacing={1}>{examples.map((example) => <Button key={example} onClick={() => void askLucy(example)} startIcon={<RecordVoiceOver />} sx={{ justifyContent: 'flex-start', textTransform: 'none', color: '#C5D0DB', bgcolor: '#0B1118', border: '1px solid #202D3A', p: 1.5 }}>{example}</Button>)}</Stack>
              </Paper>
              <Paper sx={{ p: 3, bgcolor: '#0C1718', border: '1px solid #1D464B', borderRadius: 3 }}>
                <Stack direction="row" spacing={1.5}><SecurityOutlined sx={{ color: '#4CD7C8' }} /><Box><Typography sx={{ color: '#E9FFFF', fontWeight: 750 }}>Review before action</Typography><Typography variant="body2" sx={{ color: '#88AAA9', mt: .5 }}>Voice uses your signed-in permissions. Payroll, invoices and irreversible actions must still be reviewed and confirmed.</Typography></Box></Stack>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
