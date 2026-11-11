import { getAuthRevision } from '../services/authSession';
import MediaAttachment from '../components/MediaAttachment';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Container, Typography, TextField, IconButton, Paper, CircularProgress, Stack,
} from '@mui/material';
import { Send, ArrowBack, ForumOutlined, AttachFile, AddAPhoto } from '@mui/icons-material';
import { io } from 'socket.io-client';
import { WS_URL } from '../services/api';
import { chatOwnerKey, openChatSession, readChatOwner, type ChatOwner } from '../services/chatSession';

interface Message {
  id: string;
  room_id: string;
  company_id: string;
  sender_id: string;
  sender_name?: string;
  first_name?: string;
  last_name?: string;
  message: string;
  created_at: string;
  sender_avatar?: string;
  attachment_id?: string;
  attachment_name?: string;
  attachment_type?: string;
  attachment_size?: number;
}

type ChatSession = ReturnType<typeof openChatSession>;
type SendAttempt = { message: string; revision: number; session: ChatSession };

function validMessage(message: any, roomId: string, companyId: string): message is Message {
  return message && typeof message.id === 'string' && !!message.id && message.room_id === roomId
    && typeof message.company_id === 'string' && !!message.company_id
    // Support rooms use ticket authorization and may belong to another company.
    && (roomId.startsWith('support-ticket-') || message.company_id === companyId)
    && typeof message.sender_id === 'string' && typeof message.message === 'string'
    && typeof message.created_at === 'string' && Number.isFinite(Date.parse(message.created_at));
}

function ChatAttachment({ message, session }: { message: Message; session: ChatSession }) {
  return <MediaAttachment load={() => session.download(message.attachment_id!)} isCurrent={session.isCurrent}
    name={message.attachment_name || 'attachment'} mime={message.attachment_type || 'application/octet-stream'} />;
}

export default function Chat() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const location = useLocation();
  const [owner, setOwner] = useState(readChatOwner);
  const [authEpoch, setAuthEpoch] = useState(getAuthRevision);
  const scope = JSON.stringify([chatOwnerKey(owner), roomId, authEpoch]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    const refresh = () => {
      const next = readChatOwner();
      const revision = getAuthRevision();
      if (chatOwnerKey(next) !== chatOwnerKey(owner) || revision !== authEpoch) {
        currentScope.current = '';
        setOwner(next);
        setAuthEpoch(revision);
      }
    };
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('auth-session-changed', refresh);
    window.addEventListener('auth-user-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('auth-session-changed', refresh);
      window.removeEventListener('auth-user-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [owner, authEpoch]);
  if (!roomId || !owner) return <Alert severity="error">{!roomId ? 'No conversation was selected.' : 'Sign in to use messages.'}</Alert>;
  return <OwnedChat key={scope} user={owner} roomId={roomId} roomName={location.state?.roomName || 'Chat'}
    scopeCurrent={() => currentScope.current === scope && getAuthRevision() === authEpoch && chatOwnerKey(readChatOwner()) === chatOwnerKey(owner)} />;
}

function OwnedChat({ user, roomId, roomName, scopeCurrent }: {
  user: ChatOwner; roomId: string; roomName: string; scopeCurrent: () => boolean;
}) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const foreground = useRef({ active: document.visibilityState !== 'hidden' && document.hasFocus(), epoch: 0 });
  const [viewEpoch, setViewEpoch] = useState(0);
  const denied = useRef(false);
  const isCurrent = () => mounted.current && scopeCurrent() && !denied.current;
  const sessionRef = useRef<ChatSession | null>(null);
  const sendLock = useRef<SendAttempt | null>(null);
  const mediaLock = useRef<ChatSession | null>(null);
  const draft = useRef({ text: '', revision: 0 });
  const uncertainTexts = useRef(new Set<string>());
  const mediaUncertainRef = useRef(false);
  const [uncertainMessages, setUncertainMessages] = useState<string[]>([]);
  const [mediaUncertain, setMediaUncertain] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ file: File; photo: boolean } | null>(null);
  const [sendStatus, setSendStatus] = useState('');
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages(current => {
      const byId = new Map(current.map(message => [message.id, message]));
      incoming.forEach(message => byId.set(message.id, { ...byId.get(message.id), ...message }));
      return [...byId.values()].sort((left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime() || left.id.localeCompare(right.id));
    });
  }, []);

  const changeInput = (text: string) => {
    draft.current = { text, revision: draft.current.revision + 1 };
    setInput(text);
  };
  const markUncertain = (message: string) => {
    uncertainTexts.current.add(message);
    setUncertainMessages(Array.from(uncertainTexts.current));
    setSendStatus('');
  };
  const accessChanged = () => {
    denied.current = true;
    sessionRef.current = null;
    sendLock.current = null; mediaLock.current = null;
    setSending(false); setUploading(false); setReady(false); setConnected(false); setLoading(false);
    setMessages([]); setRoom(null); setSelectedFile(null); changeInput(''); setUncertainMessages([]); setMediaUncertain(false); setSendStatus('');
    setError('Your access to this conversation changed. Reopen it or sign in again.');
    setViewEpoch(value => value + 1);
  };

  useEffect(() => {
    mounted.current = true;
    foreground.current = { active: document.visibilityState !== 'hidden' && document.hasFocus(), epoch: foreground.current.epoch + 1 };
    const suspend = () => {
      if (!foreground.current.active) return;
      foreground.current = { active: false, epoch: foreground.current.epoch + 1 };
      sessionRef.current = null;
      if (!isCurrent()) return;
      if (sendLock.current) markUncertain(sendLock.current.message);
      if (mediaLock.current) { mediaUncertainRef.current = true; setMediaUncertain(true); }
      sendLock.current = null; mediaLock.current = null;
      setSending(false); setUploading(false); setReady(false); setConnected(false);
      setViewEpoch(value => value + 1);
    };
    const resume = () => {
      if (document.visibilityState === 'hidden' || !document.hasFocus() || !isCurrent() || foreground.current.active) return;
      foreground.current = { active: true, epoch: foreground.current.epoch + 1 };
      setViewEpoch(value => value + 1);
    };
    const visibility = () => document.visibilityState === 'hidden' ? suspend() : resume();
    window.addEventListener('blur', suspend);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      foreground.current = { active: false, epoch: foreground.current.epoch + 1 };
      sessionRef.current = null;
      window.removeEventListener('blur', suspend);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    if (!foreground.current.active || !isCurrent()) return;
    let active = true;
    const epoch = foreground.current.epoch;
    const session = openChatSession(roomId, user, () => active && isCurrent() && foreground.current.active && foreground.current.epoch === epoch);
    sessionRef.current = session;
    setReady(true);
    const fetchMessages = async (quiet = false) => {
      try {
        const data = await session.readMessages();
        if (!session.isCurrent()) return;
        if (!Array.isArray(data?.messages) || data.messages.some((message: any) => !validMessage(message, roomId, user.companyId))) {
          throw new Error('Conversation could not be loaded.');
        }
        mergeMessages(data.messages);
      } catch (cause: any) {
        if (!session.isCurrent()) return;
        if (cause?.code === 'CHAT_ACCESS_CHANGED') accessChanged();
        else if (!quiet) setError('Conversation could not be loaded.');
      } finally { if (session.isCurrent() && !quiet) setLoading(false); }
    };
    void fetchMessages();
    void session.readRoom().then(data => {
      if (session.isCurrent() && data?.success === true && data.room?.id === roomId) setRoom(data.room);
    }).catch(cause => { if (session.isCurrent() && cause?.code === 'CHAT_ACCESS_CHANGED') accessChanged(); });

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'], auth: { token: session.token },
      reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 500, reconnectionDelayMax: 5000,
    });
    socket.on('connect', () => {
      if (!session.isCurrent()) { socket.disconnect(); return; }
      socket.emit('join-room', roomId, (result: any) => {
        if (!session.isCurrent()) return;
        if (result?.success !== true) { setConnected(false); setError('Could not join this conversation.'); }
        else { setConnected(true); void fetchMessages(true); }
      });
    });
    socket.on('disconnect', () => { if (session.isCurrent()) setConnected(false); });
    socket.on('connect_error', () => { if (session.isCurrent()) setError('Message connection could not be established.'); });
    socket.on('new-message', (message: Message) => {
      if (!session.isCurrent() || !validMessage(message, roomId, user.companyId)) return;
      mergeMessages([message]);
      window.setTimeout(() => { if (session.isCurrent()) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
    });
    // Keep reconciliation on reconnect, polling, visibility and focus. These are
    // read-only: uncertain writes are never replayed by reconnect or resume.
    const poll = window.setInterval(() => { if (session.isCurrent()) void fetchMessages(true); }, 5000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && session.isCurrent()) void fetchMessages(true);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      active = false;
      if (sessionRef.current === session) sessionRef.current = null;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      socket.emit('leave-room', roomId);
      socket.disconnect();
    };
  }, [viewEpoch, roomId, user, mergeMessages]);

  const acquireSession = () => {
    if (!isCurrent() || document.visibilityState === 'hidden' || !document.hasFocus()) return null;
    // A native file chooser can fire change immediately after focus, before
    // React runs the connection effect. Establish the same fenced transport
    // synchronously so an ordinary selection does not get silently dropped.
    if (!foreground.current.active) {
      foreground.current = { active: true, epoch: foreground.current.epoch + 1 };
      setViewEpoch(value => value + 1);
    }
    if (sessionRef.current?.isCurrent()) return sessionRef.current;
    const epoch = foreground.current.epoch;
    const session = openChatSession(roomId, user, () => isCurrent() && foreground.current.active && foreground.current.epoch === epoch);
    sessionRef.current = session;
    return session;
  };

  const sendMessage = async () => {
    const message = draft.current.text.trim();
    const session = acquireSession();
    if (!message || message.length > 5000 || sendLock.current || uncertainTexts.current.has(message)
      || !isCurrent() || !session?.isCurrent()) return;
    const attempt = { message, revision: draft.current.revision, session };
    sendLock.current = attempt;
    setSending(true); setSendStatus('Sending…'); setError('');
    try {
      const result = await session.sendMessage(message);
      if (!isCurrent() || !session.isCurrent()) return;
      if (result?.success !== true || !validMessage(result.message, roomId, user.companyId)
        || result.message.sender_id !== user.id || result.message.message !== message) throw new Error('Invalid acknowledgement');
      mergeMessages([result.message]); setSendStatus('Saved to conversation');
      if (draft.current.revision === attempt.revision) changeInput('');
    } catch (cause: any) {
      if (!isCurrent() || !session.isCurrent()) return;
      if (cause?.code === 'CHAT_ACCESS_CHANGED') accessChanged();
      else if (cause?.code === 'CHAT_NOT_SENT') setSendStatus('Not sent. Your draft is unchanged. Nothing was queued.');
      else markUncertain(message);
    } finally {
      if (sendLock.current === attempt) {
        sendLock.current = null;
        if (isCurrent() && session.isCurrent()) setSending(false);
      }
    }
  };

  const uploadFile = async (file: File, photo = false) => {
    const session = acquireSession();
    if (mediaLock.current || mediaUncertainRef.current || !isCurrent() || !session?.isCurrent() || (photo && !room?.can_edit_photo)) return;
    if (file.size > (photo ? 5 : 25) * 1024 * 1024) { setError(`Choose a file smaller than ${photo ? 5 : 25} MB`); return; }
    mediaLock.current = session;
    setUploading(true); setError('');
    try {
      const form = new FormData(); form.append(photo ? 'photo' : 'file', file);
      const result = await session.upload(photo ? 'photo' : 'attachments', form);
      if (!isCurrent() || !session.isCurrent()) return;
      if (photo) {
        if (result?.success !== true || typeof result.avatar_url !== 'string' || !result.avatar_url) throw new Error('Invalid photo acknowledgement');
        setRoom((previous: any) => ({ ...previous, avatar_url: result.avatar_url }));
      } else {
        if (result?.success !== true || !validMessage(result.message, roomId, user.companyId)
          || result.message.sender_id !== user.id || typeof result.message.attachment_id !== 'string' || !result.message.attachment_id) throw new Error('Invalid attachment acknowledgement');
        mergeMessages([result.message]);
      }
    } catch (cause: any) {
      if (!isCurrent() || !session.isCurrent()) return;
      if (cause?.code === 'CHAT_ACCESS_CHANGED') accessChanged();
      else if (cause?.code === 'CHAT_NOT_SENT') setError('Not uploaded. Nothing was queued.');
      else { mediaUncertainRef.current = true; setMediaUncertain(true); }
    } finally {
      if (mediaLock.current === session) {
        mediaLock.current = null;
        if (isCurrent() && session.isCurrent()) setUploading(false);
      }
    }
  };
  const selectFile = (file: File, photo = false) => {
    if (!isCurrent() || mediaUncertainRef.current || mediaLock.current) return;
    if (document.visibilityState === 'hidden' || !document.hasFocus()) {
      // Some browsers dispatch change before returning focus from the chooser.
      // Keep the user's selection for an explicit send, not a write on focus.
      setSelectedFile({ file, photo });
      return;
    }
    setSelectedFile(null);
    void uploadFile(file, photo);
  };

  const renderMessage = (msg: Message) => {
    const isMine = msg.sender_id === user.id;
    const senderName = msg.sender_name || (msg.first_name && msg.last_name ? `${msg.first_name} ${msg.last_name}` : 'Unknown');
    return (
      <Box key={msg.id} sx={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', mb: 1.5 }}>
        {!isMine && <Avatar src={msg.sender_avatar} sx={{width:28,height:28,mr:1}}>{senderName.charAt(0)}</Avatar>}
        <Paper
          sx={{
            maxWidth: '70%',
            p: 1.5,
            bgcolor: isMine ? '#00D4FF' : '#1A1A1A',
            borderRadius: 2,
            border: isMine ? 'none' : '1px solid #333',
          }}
        >
          {!isMine && (
            <Typography variant="caption" sx={{ color: '#00D4FF', display: 'block', mb: 0.5 }}>
              {senderName}
            </Typography>
          )}
          <Typography variant="body2" sx={{ color: isMine ? '#0A0A0A' : '#FFF' }}>
            {msg.message}
          </Typography>
          {msg.attachment_id && sessionRef.current && <ChatAttachment key={viewEpoch} message={msg} session={sessionRef.current} />}
          <Typography variant="caption" sx={{ color: '#888', display: 'block', textAlign: 'right', mt: 0.5 }}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Paper>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#080B10', minHeight: '100vh', py: { xs: 1, md: 3 } }}>
    <Container maxWidth="lg">
      <Paper sx={{ bgcolor: '#10161E', border: '1px solid #202C39', borderRadius: 3, overflow: 'hidden', minHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid #202C39' }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}>
          <ArrowBack />
        </IconButton>
        <Avatar src={room?.is_group?room.avatar_url:room?.other_user_avatar} sx={{ bgcolor: '#00D4FF', color: '#071018', width: 38, height: 38, ml: 1 }}><ForumOutlined fontSize="small" /></Avatar>
        <Box ml={1.5}><Typography variant="h6" sx={{ color: '#FFF', lineHeight: 1.2 }}>{roomName || 'Chat'}</Typography><Typography variant="caption" sx={{ color: connected ? '#58D68D' : '#7D8FA2' }}>{connected ? 'Connected' : 'Reconnecting…'}</Typography></Box>
        {room?.can_edit_photo && <Button component="label" disabled={!ready || uploading || mediaUncertain} sx={{ml:'auto',color:'#67E8F9'}} startIcon={<AddAPhoto />}>Group photo<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)selectFile(file,true);e.target.value='';}} /></Button>}
      </Box>

      {sendStatus && <Alert severity="info" role="status" sx={{ borderRadius: 0 }}>{sendStatus}</Alert>}
      {uncertainMessages.length > 0 && <Alert severity="warning" sx={{ borderRadius: 0 }}>Send not confirmed. Do not resend these messages: they may already be saved. Nothing will retry automatically. Check the conversation before sending again.
        {uncertainMessages.map(message => <Typography key={message} sx={{ overflowWrap: 'anywhere' }}>{message}</Typography>)}
      </Alert>}
      {selectedFile && <Alert severity="info" sx={{ borderRadius: 0 }}>Selected {selectedFile.file.name}. Nothing has been uploaded yet.
        <Button disabled={!ready || uploading || mediaUncertain} onClick={() => { const selection = selectedFile; setSelectedFile(null); void uploadFile(selection.file, selection.photo); }}>{selectedFile.photo ? 'Update group photo' : 'Send attachment'}</Button>
        <Button onClick={() => setSelectedFile(null)}>Cancel</Button>
      </Alert>}
      {mediaUncertain && <Alert severity="warning" sx={{ borderRadius: 0 }}>Upload not confirmed. It may already be saved. Check the conversation or group photo before uploading again. Nothing will retry automatically.</Alert>}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 0 }}>{error}</Alert>}

      <Box sx={{ flex: 1, minHeight: 420, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', p: { xs: 2, md: 3 }, bgcolor: '#0B1016' }}>
        {messages.length === 0 && !error && <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 350 }}><ForumOutlined sx={{ color: '#526579', fontSize: 54 }} /><Typography sx={{ color: '#FFF', mt: 2 }}>No messages yet</Typography><Typography sx={{ color: '#7D8FA2' }}>Send the first message to begin.</Typography></Stack>}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, p: 2, borderTop: '1px solid #202C39' }}>
        <Button component="label" disabled={!ready || uploading || mediaUncertain} aria-label="Attach a photo, video or document" sx={{minWidth:44,color:'#67E8F9'}}><AttachFile /><input hidden type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp3,.m4a,.wav" onChange={e=>{const file=e.target.files?.[0];if(file)selectFile(file);e.target.value='';}} /></Button>
        {uploading && <CircularProgress size={24} />}
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => changeInput(e.target.value)}
          inputProps={{ maxLength: 5000 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat) { e.preventDefault(); void sendMessage(); } }}
          sx={{
            '& .MuiOutlinedInput-root': {
              color: '#FFF',
              backgroundColor: '#1A1A1A',
              borderRadius: 20,
              '& fieldset': { borderColor: '#333' },
            },
          }}
        />
        <IconButton onClick={sendMessage} aria-label="Send message" disabled={!ready || !input.trim() || sending || uncertainMessages.includes(input.trim())} sx={{ bgcolor: '#00D4FF', borderRadius: '50%', p: 1.25, '&:hover': { bgcolor: '#5CE6FF' } }}>
          <Send sx={{ color: '#0A0A0A' }} />
        </IconButton>
      </Box>
      </Paper>
    </Container>
    </Box>
  );
}
