import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Container, Typography, TextField, IconButton, Paper, CircularProgress, Stack,
} from '@mui/material';
import { Send, ArrowBack, ForumOutlined, AttachFile, AddAPhoto } from '@mui/icons-material';
import { io, Socket } from 'socket.io-client';
import { API_BASE, WS_URL, api } from '../services/api';

interface Message {
  id: string;
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

function ChatAttachment({message}:{message:Message}) {
 const [url,setUrl]=useState('');
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const load=async()=>{setLoading(true);try{const blob=await api.download(`/api/chat/attachments/${message.attachment_id}/content`);setUrl(URL.createObjectURL(blob));setError('');}catch(e:any){setError(e.message);}finally{setLoading(false);}};
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 return <Box sx={{mt:1}}>{!url&&<Button onClick={()=>void load()} disabled={loading} sx={{color:'inherit'}}> {loading?'Loading…':`Open ${message.attachment_name}`}</Button>}
 {url&&<>{message.attachment_type?.startsWith('image/')&&<Box component="img" src={url} alt={message.attachment_name} sx={{display:'block',maxWidth:'100%',maxHeight:320}}/>}{message.attachment_type?.startsWith('video/')&&<video src={url} controls style={{maxWidth:'100%',maxHeight:320}}/>}{message.attachment_type?.startsWith('audio/')&&<audio src={url} controls/>}<Button component="a" href={url} download={message.attachment_name} sx={{color:'inherit'}}>Save {message.attachment_name}</Button></>}
 <Typography variant="caption" display="block">{(Number(message.attachment_size)/1024/1024).toFixed(1)} MB</Typography>{error&&<Alert severity="error">{error}</Alert>}</Box>;
}

export default function Chat() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const { roomName } = location.state || { roomName: 'Chat' };
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [room,setRoom]=useState<any>(null);
  const [uploading,setUploading]=useState(false);
  const [sending,setSending]=useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages(current => {
      const byId = new Map(current.map(message => [message.id, message]));
      incoming.forEach(message => byId.set(message.id, { ...byId.get(message.id), ...message }));
      return [...byId.values()].sort((left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
    });
  }, []);

  useEffect(() => {
    if (!roomId) { setLoading(false); setError('No conversation was selected.'); return; }

    let active = true;
    const fetchMessages = async (quiet = false) => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/room/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Conversation could not be loaded');
        if (active && Array.isArray(data.messages)) mergeMessages(data.messages);
      } catch (e: any) {
        if (active && !quiet) setError(e.message || 'Conversation could not be loaded');
      } finally { if (active && !quiet) setLoading(false); }
    };
    void fetchMessages();

    const socket = io(WS_URL, {
      // Allow Socket.IO to fall back to HTTP polling on browsers or networks
      // that block a direct WebSocket upgrade.
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-room', roomId, (result: any) => {
        if (result && !result.success) setError(result.message || 'Could not join this conversation');
        else void fetchMessages(true);
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (socketError) => setError(socketError.message));
    socket.on('new-message', (msg: Message) => {
      mergeMessages([msg]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    // Reconcile missed events without requiring a page refresh. This also
    // covers laptop sleep, mobile hotspot changes, and proxy idle timeouts.
    const poll = window.setInterval(() => void fetchMessages(true), 5000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void fetchMessages(true);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      socket.emit('leave-room', roomId);
      socket.disconnect();
    };
  }, [roomId, token, mergeMessages]);

  const sendMessage = async () => {
    const message=input.trim();if(!message||!roomId||sending)return;
    setSending(true);
    try{
      const response=await fetch(`${API_BASE}/api/chat/message`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({roomId,message})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||'Message was not delivered');
      mergeMessages([data.message]);setInput('');
    }catch(cause:any){setError(cause.message||'Message was not delivered');}finally{setSending(false);}
  };

  const uploadFile = async (file:File,photo=false) => {
    if(uploading||!roomId)return;
    if(file.size>(photo?5:25)*1024*1024){setError(`Choose a file smaller than ${photo?5:25} MB`);return;}
    setUploading(true);setError('');
    try {const form=new FormData();form.append(photo?'photo':'file',file);const result:any=await api.upload(`/api/chat/room/${encodeURIComponent(roomId)}/${photo?'photo':'attachments'}`,form);
      if(photo)setRoom((prev:any)=>({...prev,avatar_url:result.avatar_url}));else setMessages(prev=>prev.some(m=>m.id===result.message.id)?prev:[...prev,result.message]);
    }catch(e:any){setError(e.message||'Upload failed');}finally{setUploading(false);}
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
          {msg.attachment_id && <ChatAttachment message={msg} />}
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
        {room?.can_edit_photo && <Button component="label" disabled={uploading} sx={{ml:'auto',color:'#67E8F9'}} startIcon={<AddAPhoto />}>Group photo<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadFile(file,true);e.target.value='';}} /></Button>}
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 0 }}>{error}</Alert>}

      <Box sx={{ flex: 1, minHeight: 420, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', p: { xs: 2, md: 3 }, bgcolor: '#0B1016' }}>
        {messages.length === 0 && !error && <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 350 }}><ForumOutlined sx={{ color: '#526579', fontSize: 54 }} /><Typography sx={{ color: '#FFF', mt: 2 }}>No messages yet</Typography><Typography sx={{ color: '#7D8FA2' }}>Send the first message to begin.</Typography></Stack>}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, p: 2, borderTop: '1px solid #202C39' }}>
        <Button component="label" disabled={uploading} aria-label="Attach a photo, video or document" sx={{minWidth:44,color:'#67E8F9'}}><AttachFile /><input hidden type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp3,.m4a,.wav" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadFile(file);e.target.value='';}} /></Button>
        {uploading && <CircularProgress size={24} />}
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          sx={{
            '& .MuiOutlinedInput-root': {
              color: '#FFF',
              backgroundColor: '#1A1A1A',
              borderRadius: 20,
              '& fieldset': { borderColor: '#333' },
            },
          }}
        />
        <IconButton onClick={sendMessage} disabled={!input.trim()||sending} sx={{ bgcolor: '#00D4FF', borderRadius: '50%', p: 1.25, '&:hover': { bgcolor: '#5CE6FF' } }}>
          <Send sx={{ color: '#0A0A0A' }} />
        </IconButton>
      </Box>
      </Paper>
    </Container>
    </Box>
  );
}
