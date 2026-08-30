import React, { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, IconButton, List, ListItem, ListItemAvatar, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import { CheckCircle, Mic, Send, SmartToy, StopCircle } from '@mui/icons-material';
import { LucyWakeControl } from '../components/LucyWakeControl';
import { speakAsLucy } from '../utils/lucySpeech';

const API_BASE = ((import.meta.env as any).VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://future-jobs-pro-ai-production.up.railway.app';
type Detail = { label: string; value: string | number };
type ResultSection = { title: string; rows: Array<Record<string, unknown>> };
type LucyAction = { type: string; title: string; status: 'completed' | 'pending_approval' | 'failed' | 'information'; summary?: string; details?: Detail[]; sections?: ResultSection[]; approvalId?: string };
type Message = { text: string; isUser: boolean; action?: LucyAction };
type VoiceState = 'idle' | 'greeting' | 'listening' | 'thinking' | 'speaking';
const recognitionConstructor = (): any => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

function ActionSections({ sections }: { sections?: ResultSection[] }) {
  if (!sections?.length) return null;
  return <Stack spacing={2} sx={{ mt: 2 }}>{sections.map(section => <Box key={section.title}>
    <Typography variant="subtitle2" sx={{ color: '#00D4FF', mb: 1 }}>{section.title} ({section.rows.length})</Typography>
    <Stack spacing={1}>{section.rows.map((row, index) => <Paper key={index} variant="outlined" sx={{ p: 1.5, bgcolor: '#0E1821', borderColor: '#263846' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
        {Object.entries(row).map(([label, value]) => <Box key={label}><Typography variant="caption" sx={{ color: '#73899C', textTransform: 'capitalize' }}>{label.replace(/([A-Z])/g, ' $1')}</Typography><Typography variant="body2" sx={{ color: '#EDF6FC', overflowWrap: 'anywhere' }}>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '—')}</Typography></Box>)}
      </Box>
    </Paper>)}</Stack>
  </Box>)}</Stack>;
}

export default function AskLucy() {
  const [messages, setMessages] = useState<Message[]>([{ text: "Hi! I'm Lucy. Ask about your workforce or tell me what you need done.", isUser: false }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceActiveRef = useRef(false);
  const supported = Boolean(recognitionConstructor());

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => { recognitionRef.current?.abort?.(); window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { void (async () => {
    const token = localStorage.getItem('token'); if (!token) return;
    try { const response = await fetch(`${API_BASE}/api/lucy/history`, { headers: { Authorization: `Bearer ${token}` } }); const data = await response.json();
      if (response.ok && Array.isArray(data.messages)) setMessages(current => [...current, ...data.messages.map((item: any) => ({ text: item.content, isUser: item.role === 'user' }))]);
    } catch (cause) { console.error('Lucy history load failed:', cause); }
  })(); }, []);

  const finishVoice = () => { voiceActiveRef.current = false; setVoiceState('idle'); };

  const sendMessage = async (supplied?: string, fromVoice = false) => {
    const message = (supplied ?? input).trim(); if (!message || loading) return;
    setMessages(current => [...current, { text: message, isUser: true }]); setInput(''); setLoading(true);
    if (fromVoice) setVoiceState('thinking');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/lucy`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ message, channel: fromVoice ? 'voice' : 'text' }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || `Lucy returned ${response.status}`);
      const text = data.text || "I completed the request but didn't receive a summary.";
      const action: LucyAction | undefined = data.action || (data.approvalId ? { type: 'approval', title: 'Approval required', status: 'pending_approval', approvalId: data.approvalId } : undefined);
      setMessages(current => [...current, { text, isUser: false, action }]);
      if (fromVoice) { setVoiceState('speaking'); await speakAsLucy(text, { onEnd: finishVoice, onError: finishVoice }); }
    } catch (cause: any) {
      const text = `I couldn't complete that request. ${cause.message || 'Please try again.'}`;
      setMessages(current => [...current, { text, isUser: false, action: { type: 'error', title: 'Action failed', status: 'failed' } }]);
      if (fromVoice) await speakAsLucy(text, { onEnd: finishVoice, onError: finishVoice });
    } finally { setLoading(false); if (fromVoice && !('speechSynthesis' in window)) finishVoice(); }
  };

  const beginRecognition = () => {
    if (!supported) { setError('Voice recognition requires a current version of Chrome or Edge.'); finishVoice(); return; }
    const Recognition = recognitionConstructor(); const recognition = new Recognition(); recognitionRef.current = recognition; let submitted = false;
    recognition.lang = 'en-CA'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => setVoiceState('listening');
    recognition.onresult = (event: any) => { const transcript = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0]?.transcript || '').join(' ').trim(); setInput(transcript); const last = event.results[event.results.length - 1]; if (last?.isFinal && transcript && !submitted) { submitted = true; void sendMessage(transcript, true); } };
    recognition.onerror = (event: any) => { setError(event.error === 'not-allowed' ? 'Microphone permission was denied.' : `Voice recognition stopped: ${event.error}`); finishVoice(); };
    recognition.onend = () => { if (voiceActiveRef.current && !submitted) finishVoice(); };
    recognition.start();
  };

  const startVoice = async (greet: boolean) => {
    if (voiceActiveRef.current || loading) return; voiceActiveRef.current = true; setError('');
    recognitionRef.current?.abort?.(); window.speechSynthesis?.cancel();
    if (!greet) { beginRecognition(); return; }
    setVoiceState('greeting'); await speakAsLucy('Hey! What can I do for you?', { onEnd: beginRecognition, onError: beginRecognition });
  };
  const stopVoice = () => { recognitionRef.current?.abort?.(); window.speechSynthesis?.cancel(); finishVoice(); };

  const resolveApproval = async (id: string, decision: 'approve' | 'reject') => {
    try { const token = localStorage.getItem('token'); const response = await fetch(`${API_BASE}/api/approvals/${id}/${decision}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} }); const data = await response.json(); if (!response.ok) throw new Error(data.message);
      setMessages(current => [...current, { text: decision === 'approve' ? 'Approved. The protected action result is below.' : 'Rejected. No protected action was performed.', isUser: false, action: data.action || { type: 'approval', title: decision === 'approve' ? 'Approved' : 'Rejected', status: decision === 'approve' ? 'completed' : 'information', details: data.result ? Object.entries(data.result).map(([label, value]) => ({ label, value: String(value) })) : [] } }]);
    } catch (cause: any) { setError(cause.message || 'Approval failed'); }
  };

  const voiceBusy = voiceState !== 'idle';
  return <Box sx={{ bgcolor: '#070B10', minHeight: '100vh', py: 4, display: 'flex', justifyContent: 'center' }}><Box sx={{ width: '100%', maxWidth: 760, px: 2, display: 'flex', flexDirection: 'column', height: '90vh' }}>
    <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 850, mb: 1, textAlign: 'center' }}><SmartToy sx={{ mr: 1, verticalAlign: 'middle' }} />Ask Lucy</Typography>
    <Typography variant="body2" sx={{ color: '#8FA5B8', mb: 2, textAlign: 'center' }}>Your voice-first workforce command centre. Lucy explains every action and asks before protected operations.</Typography>
    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}><LucyWakeControl suspended={voiceBusy} onWake={() => void startVoice(true)} /></Box>
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {voiceBusy && <Chip label={{ greeting: 'Lucy is responding', listening: 'Listening for your command', thinking: 'Lucy is working', speaking: 'Lucy is reporting back' }[voiceState]} color="info" sx={{ alignSelf: 'center', mb: 1 }} />}
    <Paper sx={{ flex: 1, bgcolor: '#10161E', borderRadius: 3, border: '1px solid #22303E', p: 2, mb: 2, overflowY: 'auto' }}><List>{messages.map((message, index) => <ListItem key={index} sx={{ flexDirection: message.isUser ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
      {!message.isUser && <ListItemAvatar sx={{ minWidth: 40 }}><Avatar sx={{ bgcolor: '#00D4FF', width: 32, height: 32, fontSize: 14 }}>L</Avatar></ListItemAvatar>}
      <Box sx={{ width: message.isUser ? 'auto' : '100%' }}><ListItemText primary={message.text} primaryTypographyProps={{ color: message.isUser ? '#00D4FF' : '#FFF', fontSize: 14, fontWeight: message.isUser ? 700 : 400, sx: { textAlign: message.isUser ? 'right' : 'left', whiteSpace: 'pre-wrap' } }} />
      {message.action && <Paper variant="outlined" sx={{ mt: 1, p: 2, bgcolor: '#0B1118', borderColor: message.action.status === 'failed' ? '#7B2C38' : message.action.status === 'pending_approval' ? '#806B28' : '#20545D' }}><Stack direction="row" spacing={1} alignItems="center"><CheckCircle color={message.action.status === 'failed' ? 'error' : 'success'} /><Typography sx={{ color: '#FFF', fontWeight: 750 }}>{message.action.title}</Typography><Chip size="small" label={message.action.status.replace('_', ' ')} /></Stack>{message.action.summary && <Typography variant="body2" sx={{ color: '#AFC0CF', mt: 1 }}>{message.action.summary}</Typography>}{message.action.details?.map(detail => <Stack key={detail.label} direction="row" justifyContent="space-between" sx={{ mt: 1, gap: 2 }}><Typography variant="body2" sx={{ color: '#8295A7' }}>{detail.label}</Typography><Typography variant="body2" sx={{ color: '#FFF', textAlign: 'right' }}>{String(detail.value)}</Typography></Stack>)}<ActionSections sections={message.action.sections} />{message.action.status === 'pending_approval' && message.action.approvalId && <Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button variant="contained" onClick={() => void resolveApproval(message.action!.approvalId!, 'approve')}>Approve</Button><Button color="error" onClick={() => void resolveApproval(message.action!.approvalId!, 'reject')}>Reject</Button></Stack>}</Paper>}
      </Box></ListItem>)}{loading && <CircularProgress size={22} sx={{ color: '#00D4FF', display: 'block', mx: 'auto' }} />}<div ref={endRef} /></List></Paper>
    <Box sx={{ display: 'flex', gap: 1 }}><IconButton aria-label={voiceBusy ? 'Stop Lucy voice interaction' : 'Talk to Lucy'} onClick={voiceBusy ? stopVoice : () => void startVoice(false)} sx={{ border: '1px solid #27404C', color: voiceBusy ? '#FF667A' : '#00D4FF', width: 48, height: 48 }}>{voiceBusy ? <StopCircle /> : <Mic />}</IconButton><TextField fullWidth placeholder={voiceState === 'listening' ? 'Listening…' : 'Ask Lucy or give her a task…'} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} disabled={loading} sx={{ input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { bgcolor: '#10161E', '& fieldset': { borderColor: '#293746' } } }} /><IconButton onClick={() => void sendMessage()} disabled={loading || !input.trim()} sx={{ bgcolor: '#00D4FF', color: '#07111F', width: 48, height: 48 }}><Send /></IconButton></Box>
  </Box></Box>;
}
