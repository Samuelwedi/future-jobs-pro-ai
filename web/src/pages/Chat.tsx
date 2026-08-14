import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Container, Typography, TextField, IconButton, Paper, CircularProgress, Stack,
} from '@mui/material';
import { Send, ArrowBack, ForumOutlined } from '@mui/icons-material';
import { io, Socket } from 'socket.io-client';
import { API_BASE, WS_URL } from '../services/api';

interface Message {
  id: string;
  sender_id: string;
  sender_name?: string;
  first_name?: string;
  last_name?: string;
  message: string;
  created_at: string;
}

export default function Chat() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const { roomName } = location.state || { roomName: 'Chat' };
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId) { setLoading(false); setError('No conversation was selected.'); return; }

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/room/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Conversation could not be loaded');
        if (data.messages) setMessages(data.messages);
      } catch (e: any) { setError(e.message || 'Conversation could not be loaded'); }
      finally { setLoading(false); }
    };
    fetchMessages();

    const socket = io(WS_URL, {
      transports: ['websocket'],
      auth: { token },
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-room', roomId, (result: any) => {
        if (result && !result.success) setError(result.message || 'Could not join this conversation');
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (socketError) => setError(socketError.message));
    socket.on('new-message', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return () => {
      socket.emit('leave-room', roomId);
      socket.disconnect();
    };
  }, [roomId, token]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || !roomId || !connected) return;
    socketRef.current.emit('chat-message', {
      roomId,
      message: input.trim(),
    });
    setInput('');
  };

  const renderMessage = (msg: Message) => {
    const isMine = msg.sender_id === user.id;
    const senderName = msg.sender_name || (msg.first_name && msg.last_name ? `${msg.first_name} ${msg.last_name}` : 'Unknown');
    return (
      <Box key={msg.id} sx={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', mb: 1.5 }}>
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
        <Avatar sx={{ bgcolor: '#00D4FF', color: '#071018', width: 38, height: 38, ml: 1 }}><ForumOutlined fontSize="small" /></Avatar>
        <Box ml={1.5}><Typography variant="h6" sx={{ color: '#FFF', lineHeight: 1.2 }}>{roomName || 'Chat'}</Typography><Typography variant="caption" sx={{ color: connected ? '#58D68D' : '#7D8FA2' }}>{connected ? 'Connected' : 'Reconnecting…'}</Typography></Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 0 }}>{error}</Alert>}

      <Box sx={{ flex: 1, minHeight: 420, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', p: { xs: 2, md: 3 }, bgcolor: '#0B1016' }}>
        {messages.length === 0 && !error && <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 350 }}><ForumOutlined sx={{ color: '#526579', fontSize: 54 }} /><Typography sx={{ color: '#FFF', mt: 2 }}>No messages yet</Typography><Typography sx={{ color: '#7D8FA2' }}>Send the first message to begin.</Typography></Stack>}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, p: 2, borderTop: '1px solid #202C39' }}>
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
        <IconButton onClick={sendMessage} disabled={!connected || !input.trim()} sx={{ bgcolor: '#00D4FF', borderRadius: '50%', p: 1.25, '&:hover': { bgcolor: '#5CE6FF' } }}>
          <Send sx={{ color: '#0A0A0A' }} />
        </IconButton>
      </Box>
      </Paper>
    </Container>
    </Box>
  );
}
