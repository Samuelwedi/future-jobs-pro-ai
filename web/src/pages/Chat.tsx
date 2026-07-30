import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, TextField, IconButton, Paper,
  CircularProgress,
} from '@mui/material';
import { Send, ArrowBack } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

declare const process: { env: { REACT_APP_API_BASE?: string } };

const API_BASE = process.env.REACT_APP_API_BASE || 'https://future-jobs-pro-ai-production.up.railway.app';
const WS_URL = API_BASE.replace('/api', '').replace('https', 'wss').replace('http', 'ws');

interface Message {
  id: string;
  sender_id: string;
  sender_name?: string;
  first_name?: string;
  last_name?: string;
  message: string;
  created_at: string;
}

export default function ChatScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId, roomName } = location.state || { roomId: '', roomName: 'Chat' };
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch previous messages using the correct endpoint
    const fetchMessages = async () => {
      if (!roomId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/chat/messages/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.messages) setMessages(data.messages);
      } catch (e) {
        console.error('Error fetching messages:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();

    // Socket connection
    const socket = io(WS_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      if (roomId) socket.emit('join-room', roomId);
    });
    socket.on('new-message', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return () => {
      if (roomId) socket.emit('leave-room', roomId);
      socket.disconnect();
    };
  }, [roomId, token]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || !roomId) return;
    const senderId = user?.id;
    if (!senderId) {
      alert('You must be logged in to send messages.');
      return;
    }
    socketRef.current.emit('chat-message', {
      senderId: senderId,
      companyId: user?.companyId || '',
      roomId,
      message: input.trim(),
    });
    setInput('');
  };

  const renderMessage = (msg: Message) => {
    const isMine = msg.sender_id === user?.id;
    return (
      <Box
        key={msg.id}
        sx={{
          display: 'flex',
          justifyContent: isMine ? 'flex-end' : 'flex-start',
          mb: 1.5,
        }}
      >
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
              {msg.sender_name || msg.first_name || 'User'}
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

  return (
    <Container maxWidth="md" sx={{ py: 2, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h6" sx={{ color: '#FFF', ml: 1 }}>
          {roomName || 'Chat'}
        </Typography>
      </Box>

      {/* Messages */}
      <Box sx={{ flex: 1, maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', p: 1 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress sx={{ color: '#00D4FF' }} />
          </Box>
        ) : (
          <>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {/* Input Bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, borderTop: '1px solid #333', pt: 2 }}>
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
            mr: 1,
          }}
        />
        <IconButton onClick={sendMessage} sx={{ bgcolor: '#00D4FF', borderRadius: '50%', p: 1 }}>
          <Send sx={{ color: '#0A0A0A' }} />
        </IconButton>
      </Box>
    </Container>
  );
}