import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Paper, Avatar, List, ListItem,
  ListItemAvatar, ListItemText, TextField, Button, CircularProgress,
} from '@mui/material';
import { ChatBubble, Send } from '@mui/icons-material';
import { io, Socket } from 'socket.io-client';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Message {
  id: string;
  sender_id: string;
  sender_name?: string;
  message: string;
  created_at: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load user from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setRoomId(parsed.companyId);
      }
    } catch {}
  }, []);

  // Fetch message history
  useEffect(() => {
    if (!user?.companyId) return;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/chat/company/${user.companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 402) {
          window.location.href = '/payment-required';
          return null;
        }
        if (!res.ok) throw new Error('Failed to load messages');
        return res.json();
      })
      .then((data) => {
        if (data?.messages) setMessages(data.messages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  // Connect to WebSocket
  useEffect(() => {
    if (!roomId || !user) return;

    const socket = io(API_BASE, {
      transports: ['websocket'],
      auth: { token: localStorage.getItem('token') },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Chat socket connected');
      socket.emit('join-room', roomId);
    });

    socket.on('new-message', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.emit('leave-room', roomId);
      socket.disconnect();
    };
  }, [roomId, user]);

  // Auto‑scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim() || !socketRef.current || !user) return;

    const payload = {
      senderId: user.id,
      companyId: user.companyId,
      roomId,
      message: newMessage.trim(),
    };

    socketRef.current.emit('chat-message', payload);
    setNewMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!user) {
    return (
      <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <ChatBubble sx={{ mr: 1, verticalAlign: 'middle' }} />
          Team Chat
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Real‑time messaging with your crew
        </Typography>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', p: 2, mb: 2, minHeight: 400, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress sx={{ color: '#00D4FF' }} />
            </Box>
          ) : messages.length === 0 ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography sx={{ color: '#888' }}>No messages yet. Start the conversation!</Typography>
            </Box>
          ) : (
            <List sx={{ flex: 1, overflowY: 'auto', mb: 2 }}>
              {messages.map((msg) => {
                const isMe = msg.sender_id === user.id;
                return (
                  <ListItem
                    key={msg.id}
                    sx={{ flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-start' }}
                  >
                    <ListItemAvatar sx={{ minWidth: 40 }}>
                      <Avatar
                        sx={{
                          bgcolor: isMe ? '#00D4FF' : '#555',
                          width: 32,
                          height: 32,
                          fontSize: 14,
                        }}
                      >
                        {msg.sender_name ? msg.sender_name.charAt(0).toUpperCase() : '?'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={msg.sender_name || 'Unknown'}
                      secondary={msg.message}
                      primaryTypographyProps={{ color: '#FFF', fontSize: 14 }}
                      secondaryTypographyProps={{ color: '#AAA', fontSize: 13 }}
                      sx={{
                        textAlign: isMe ? 'right' : 'left',
                        mr: isMe ? 0 : 2,
                        ml: isMe ? 2 : 0,
                      }}
                    />
                  </ListItem>
                );
              })}
              <div ref={messagesEndRef} />
            </List>
          )}
        </Paper>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            placeholder="Type a message..."
            variant="outlined"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            sx={{
              input: { color: '#FFF' },
              '& .MuiOutlinedInput-root': {
                bgcolor: '#1A1A1A',
                borderRadius: 2,
                '& fieldset': { borderColor: '#333' },
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={!newMessage.trim()}
            sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 4 }}
          >
            <Send />
          </Button>
        </Box>
      </Container>
    </Box>
  );
}