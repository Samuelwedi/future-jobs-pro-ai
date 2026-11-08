import React, { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, IconButton, List, ListItem, ListItemAvatar, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import { CheckCircle, Mic, Send, SmartToy, StopCircle } from '@mui/icons-material';
import { api, API_BASE } from '../services/api';
import LucyWorkspacePanel from '../components/LucyWorkspacePanel';
import LucySourceEvidence from '../components/LucySourceEvidence';
import type {LucyEvidence} from '../utils/lucyEvidence';
import { LucyWakeControl } from '../components/LucyWakeControl';
import { speakAsLucy } from '../utils/lucySpeech';
import { LucyChatRequestController, lucyRequestNotice, type LucyChatAttempt } from '../utils/lucyChatRequest';
type Detail = { label: string; value: string | number };
type ResultSection = { title: string; rows: Array<Record<string, unknown>> };
type LucyAction = { type: string; title: string; status: 'completed' | 'pending_approval' | 'failed' | 'information'; summary?: string; details?: Detail[]; sections?: ResultSection[]; approvalId?: string; download?: {url:string;filename:string;label:string} };
type Message = { text: string; isUser: boolean; action?: LucyAction; evidence?: LucyEvidence; requestId?: string };
type VoiceState = 'idle' | 'greeting' | 'listening' | 'thinking' | 'speaking';
const greeting = "Hi! I'm Lucy. Ask about your workforce or tell me what you need done.";
const readChatScope = () => {
  const token = localStorage.getItem('token');
  if (!token) return '';
  try { const user = JSON.parse(localStorage.getItem('user') || '{}'); return JSON.stringify([token, user.id, user.companyId ?? user.company_id, user.role]); }
  catch { return ''; }
};
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

export default function AskLucy({initialPrompt = ''}: {initialPrompt?:string}) {
  const [messages, setMessages] = useState<Message[]>([{ text: greeting, isUser: false }]);
  const [input, setInput] = useState(initialPrompt);
  useEffect(()=>setInput(initialPrompt),[initialPrompt]);
  const [loading, setLoading] = useState(false);
  const [workspaceOpen,setWorkspaceOpen]=useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceActiveRef = useRef(false);
  const supported = Boolean(recognitionConstructor());

  const controllerRef = useRef(new LucyChatRequestController());
  const controller = controllerRef.current;
  const [requestState, setRequestState] = useState(controller.snapshot());
  const lifecycle = useRef(0);
  const voiceEpoch = useRef(0);
  const mounted = useRef(true);
  const interacted = useRef(false);
  const scopeReady = useRef(false);
  const deniedScope = useRef<string|null>(null);
  const syncRequest = () => setRequestState(controller.snapshot());
  const finishVoice = () => { voiceActiveRef.current = false; setVoiceState('idle'); };
  const stopVoice = () => { voiceEpoch.current++; voiceActiveRef.current = false; recognitionRef.current?.abort?.(); window.speechSynthesis?.cancel(); setVoiceState('idle'); };
  const syncScope = () => {
    const nextScope = readChatScope();
    if (deniedScope.current === nextScope) return;
    deniedScope.current = null;
    if (controller.setScope(nextScope)) {
      lifecycle.current++; stopVoice(); interacted.current = false;
      setMessages([{text: greeting, isUser: false}]); setInput(scopeReady.current ? '' : initialPrompt); scopeReady.current = true; setLoading(false); setError(''); setWorkspaceOpen(false); syncRequest();
    }
  };
  const viewCurrent = (epoch: number) => mounted.current && lifecycle.current === epoch && document.visibilityState !== 'hidden';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    mounted.current = true; syncScope();
    const visibility = () => {
      syncScope(); lifecycle.current++;
      if (document.visibilityState === 'hidden') {controller.suspend(); stopVoice(); setLoading(false);}
      else controller.resume();
      syncRequest();
    };
    visibility();
    const epoch = lifecycle.current;
    const token = localStorage.getItem('token');
    if (token) void (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/lucy/history`, {headers: {Authorization: `Bearer ${token}`}});
        const data = await response.json();
        if (!mounted.current) return;
        syncScope();
        if (viewCurrent(epoch) && !interacted.current && response.ok && Array.isArray(data.messages)) setMessages(current => [...current, ...data.messages.map((item: any) => ({ text: item.content, isUser: item.role === 'user' }))]);
      } catch { /* History is optional and must not replace a newer conversation. */ }
    })();
    const blur = () => {lifecycle.current++; controller.suspend(); stopVoice(); setLoading(false); syncRequest();};
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur); window.addEventListener('focus', visibility);
    window.addEventListener('storage', syncScope);
    // Existing web authentication lives in localStorage, including same-tab updates.
    const timer = window.setInterval(syncScope, 1000);
    return () => {mounted.current = false; lifecycle.current++; controller.suspend(); voiceEpoch.current++; voiceActiveRef.current = false; recognitionRef.current?.abort?.(); window.speechSynthesis?.cancel(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('storage', syncScope); window.removeEventListener('focus', visibility); window.removeEventListener('blur', blur);};
  }, []);

  const runRequest = async (attempt: LucyChatAttempt, fromVoice: boolean) => {
    const epoch = lifecycle.current;
    const speechEpoch = voiceEpoch.current;
    setLoading(true); setError(''); syncRequest();
    if (fromVoice) setVoiceState('thinking');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/lucy-v2${attempt.checking ? `/requests/${encodeURIComponent(attempt.payload.requestId)}` : ''}`, { method: attempt.checking ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(attempt.checking ? {} : {body: JSON.stringify(attempt.payload)}) });
      const body = await response.json();
      if (!mounted.current) return;
      syncScope();
      if (!controller.isCurrent(attempt)) return;
      if ([401, 403].includes(response.status)) {
        deniedScope.current = readChatScope(); controller.setScope(''); lifecycle.current++; stopVoice(); setMessages([]); setInput('');
        setError('Your access changed. Sign in again or refresh this page before continuing.'); setLoading(false); syncRequest(); return;
      }
      const outcome = controller.receive(attempt, attempt.checking && body?.response ? body.response.body : body, attempt.checking && body?.response ? body.response.statusCode : response.status);
      if (outcome.kind === 'stale') return;
      const data = outcome.data;
      if (data) {
        const text = data.text || (outcome.kind === 'completed' ? 'Lucy returned the request receipt.' : 'Lucy returned the following action receipts. The overall request outcome is not confirmed.');
        const action: LucyAction | undefined = data.action || data.actions?.[0] || (data.approvalId ? { type: 'approval', title: 'Approval required', status: 'pending_approval', approvalId: data.approvalId } : undefined);
        const requestId = attempt.payload.requestId;
        setMessages(current => [...current.filter(item => item.isUser || item.requestId !== requestId), { text, isUser: false, action, evidence: data.evidence, requestId }, ...(data.actions || []).slice(1).map((a:LucyAction)=>({text:'',isUser:false,action:a,requestId}))]);
        if (outcome.kind === 'completed' && fromVoice && !attempt.checking && viewCurrent(epoch) && speechEpoch === voiceEpoch.current) {
          setVoiceState('speaking'); await speakAsLucy(text, { onEnd: () => {if (viewCurrent(epoch) && speechEpoch === voiceEpoch.current) finishVoice();}, onError: () => {if (viewCurrent(epoch) && speechEpoch === voiceEpoch.current) finishVoice();} });
        }
      }
      if (outcome.kind !== 'completed') stopVoice();
    } catch {
      if (!mounted.current) return;
      syncScope();
      if (controller.fail(attempt).kind !== 'stale') stopVoice();
    } finally {
      if (viewCurrent(epoch)) {setLoading(controller.snapshot().busy); syncRequest();}
    }
  };
  const sendMessage = async (supplied?: string, fromVoice = false) => {
    syncScope();
    const message = (supplied ?? input).trim();
    const attempt = controller.begin({message, channel: fromVoice ? 'voice' : 'text', language: 'en'});
    if (!attempt) return;
    interacted.current = true;
    setMessages(current => [...current, {text: message, isUser: true}]); setInput('');
    await runRequest(attempt, fromVoice);
  };
  const checkPrevious = () => {syncScope(); const attempt = controller.check(); if (attempt) void runRequest(attempt, false);};
  const startNew = () => {
    syncScope(); const requestId = controller.snapshot().requestId;
    if (!requestId || controller.snapshot().busy) return;
    if (window.confirm('The previous request may already have changed records. Starting a new request does not cancel it and could duplicate its actions. Review your records first. Start a new request anyway?')) {
      syncScope(); if (controller.startNewAfterWarning(requestId)) syncRequest();
    }
  };

  const beginRecognition = () => {
    if (!mounted.current || document.visibilityState === 'hidden' || controller.snapshot().pending || !voiceActiveRef.current) return;
    const epoch = voiceEpoch.current;
    if (!supported) { setError('Voice recognition requires a current version of Chrome or Edge.'); finishVoice(); return; }
    const Recognition = recognitionConstructor(); const recognition = new Recognition(); recognitionRef.current = recognition; let submitted = false;
    recognition.lang = 'en-CA'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => {if (epoch === voiceEpoch.current) setVoiceState('listening');};
    recognition.onresult = (event: any) => { if (!mounted.current || epoch !== voiceEpoch.current || document.visibilityState === 'hidden') return; const transcript = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0]?.transcript || '').join(' ').trim(); setInput(transcript); const last = event.results[event.results.length - 1]; if (last?.isFinal && transcript && !submitted) { submitted = true; void sendMessage(transcript, true); } };
    recognition.onerror = (event: any) => { if (epoch !== voiceEpoch.current || !mounted.current) return; setError(event.error === 'not-allowed' ? 'Microphone permission was denied.' : `Voice recognition stopped: ${event.error}`); finishVoice(); };
    recognition.onend = () => { if (epoch === voiceEpoch.current && voiceActiveRef.current && !submitted) finishVoice(); };
    recognition.start();
  };

  const startVoice = async (greet: boolean) => {
    syncScope(); if (!mounted.current || document.visibilityState === 'hidden' || voiceActiveRef.current || controller.snapshot().pending || loading) return; voiceActiveRef.current = true; setError('');
    const epoch = ++voiceEpoch.current;
    recognitionRef.current?.abort?.(); window.speechSynthesis?.cancel();
    if (!greet) { beginRecognition(); return; }
    setVoiceState('greeting'); await speakAsLucy('Hey! What can I do for you?', { onEnd: () => {if (epoch === voiceEpoch.current) beginRecognition();}, onError: () => {if (epoch === voiceEpoch.current) beginRecognition();} });
  };

  const resolveApproval = async (id: string, decision: 'approve' | 'reject') => {
    syncScope(); const epoch = lifecycle.current;
    try { const token = localStorage.getItem('token'); const response = await fetch(`${API_BASE}/api/approvals/${id}/${decision}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} }); const data = await response.json(); if (!response.ok) throw new Error(data.message);
      if (!mounted.current) return; syncScope(); if (!viewCurrent(epoch)) return;
      setMessages(current => [...current, { text: decision === 'approve' ? 'Approved. The protected action result is below.' : 'Rejected. No protected action was performed.', isUser: false, action: data.action || { type: 'approval', title: decision === 'approve' ? 'Approved' : 'Rejected', status: decision === 'approve' ? 'completed' : 'information', details: data.result ? Object.entries(data.result).map(([label, value]) => ({ label, value: String(value) })) : [] } }]);
    } catch (cause: any) { if (mounted.current) {syncScope(); if (viewCurrent(epoch)) setError(cause.message || 'Approval failed');} }
  };

  const download = async (item:NonNullable<LucyAction['download']>) => {
    try {
      if(!item.url.startsWith('/lucy-v2/timesheet-excel?'))throw new Error('Unsupported report link');
      const blob=await api.download(`/api${item.url}`);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=item.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e:any){setError(e.message);}
  };
  const voiceBusy = voiceState !== 'idle';
  return <Box sx={{ bgcolor: '#070B10', minHeight: '100vh', py: 4, display: 'flex', justifyContent: 'center' }}><Box sx={{ width: '100%', maxWidth: 960, px: 2, display: 'flex', flexDirection: 'column', height: '82vh' }}>
    <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 850, mb: 1, textAlign: 'center' }}><SmartToy sx={{ mr: 1, verticalAlign: 'middle' }} />Ask Lucy</Typography>
    <Typography variant="body2" sx={{ color: '#8FA5B8', mb: 2, textAlign: 'center' }}>Your voice-first workforce command centre. Lucy explains every action and asks before protected operations.</Typography>
    <Box sx={{textAlign:'center',mb:1}}><Button onClick={()=>setWorkspaceOpen(true)}>Tasks and preferences</Button></Box>
    <LucyWorkspacePanel open={workspaceOpen} onClose={()=>setWorkspaceOpen(false)}/>
    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}><LucyWakeControl suspended={voiceBusy || requestState.pending} onWake={() => void startVoice(true)} /></Box>
    {requestState.pending && <Alert severity="warning" sx={{mb: 2}}><Typography role="status" aria-live="polite">{lucyRequestNotice(requestState)}</Typography><Stack direction="row" spacing={1}><Button onClick={checkPrevious} disabled={!requestState.canCheck}>Check previous request</Button><Button onClick={startNew} disabled={requestState.busy}>Start a new request…</Button></Stack></Alert>}
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {voiceBusy && <Chip label={{ greeting: 'Lucy is responding', listening: 'Listening for your command', thinking: 'Lucy is working', speaking: 'Lucy is reporting back' }[voiceState]} color="info" sx={{ alignSelf: 'center', mb: 1 }} />}
    <Paper sx={{ flex: 1, bgcolor: '#10161E', borderRadius: 3, border: '1px solid #22303E', p: 2, mb: 2, overflowY: 'auto' }}><List>{messages.map((message, index) => <ListItem key={index} sx={{ flexDirection: message.isUser ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
      {!message.isUser && <ListItemAvatar sx={{ minWidth: 40 }}><Avatar sx={{ bgcolor: '#00D4FF', width: 32, height: 32, fontSize: 14 }}>L</Avatar></ListItemAvatar>}
      <Box sx={{ width: message.isUser ? 'auto' : '100%' }}><ListItemText primary={message.text} primaryTypographyProps={{ color: message.isUser ? '#00D4FF' : '#FFF', fontSize: 14, fontWeight: message.isUser ? 700 : 400, sx: { textAlign: message.isUser ? 'right' : 'left', whiteSpace: 'pre-wrap' } }} />
      {message.action && <Paper variant="outlined" sx={{ mt: 1, p: 2, bgcolor: '#0B1118', borderColor: message.action.status === 'failed' ? '#7B2C38' : message.action.status === 'pending_approval' ? '#806B28' : '#20545D' }}><Stack direction="row" spacing={1} alignItems="center"><CheckCircle color={message.action.status === 'failed' ? 'error' : 'success'} /><Typography sx={{ color: '#FFF', fontWeight: 750 }}>{message.action.title}</Typography><Chip size="small" label={message.action.status.replace('_', ' ')} /></Stack>{message.action.summary && <Typography variant="body2" sx={{ color: '#AFC0CF', mt: 1 }}>{message.action.summary}</Typography>}{message.action.details?.map(detail => <Stack key={detail.label} direction="row" justifyContent="space-between" sx={{ mt: 1, gap: 2 }}><Typography variant="body2" sx={{ color: '#8295A7' }}>{detail.label}</Typography><Typography variant="body2" sx={{ color: '#FFF', textAlign: 'right' }}>{String(detail.value)}</Typography></Stack>)}<ActionSections sections={message.action.sections} />{message.action.download&&<Button sx={{mt:1}} onClick={()=>void download(message.action!.download!)}>{message.action.download.label}</Button>}{message.action.status === ('pending' as any)&&<Button sx={{mt:1}} disabled={loading || requestState.pending} onClick={()=>void sendMessage('yes, run it')}>Create draft payroll</Button>}{message.action.status === 'pending_approval' && message.action.approvalId && <Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button variant="contained" onClick={() => void resolveApproval(message.action!.approvalId!, 'approve')}>Approve</Button><Button color="error" onClick={() => void resolveApproval(message.action!.approvalId!, 'reject')}>Reject</Button></Stack>}</Paper>}
      {!message.isUser && <LucySourceEvidence evidence={message.evidence}/>}
      </Box></ListItem>)}{loading && <CircularProgress size={22} sx={{ color: '#00D4FF', display: 'block', mx: 'auto' }} />}<div ref={endRef} /></List></Paper>
    <Box sx={{ display: 'flex', gap: 1 }}><IconButton disabled={!voiceBusy && requestState.pending} aria-label={voiceBusy ? 'Stop Lucy voice interaction' : 'Talk to Lucy'} onClick={voiceBusy ? stopVoice : () => void startVoice(false)} sx={{ border: '1px solid #27404C', color: voiceBusy ? '#FF667A' : '#00D4FF', width: 48, height: 48 }}>{voiceBusy ? <StopCircle /> : <Mic />}</IconButton><TextField fullWidth placeholder={voiceState === 'listening' ? 'Listening…' : 'Ask Lucy or give her a task…'} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} disabled={loading} sx={{ input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { bgcolor: '#10161E', '& fieldset': { borderColor: '#293746' } } }} /><IconButton aria-label="Send message" onClick={() => void sendMessage()} disabled={loading || requestState.pending || !input.trim()} sx={{ bgcolor: '#00D4FF', color: '#07111F', width: 48, height: 48 }}><Send /></IconButton></Box>
  </Box></Box>;
}
