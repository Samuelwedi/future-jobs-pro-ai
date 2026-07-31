import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, TextField, IconButton, Paper,
  CircularProgress, Alert, Button, Chip, Stack,
} from '@mui/material';
import { Send, ArrowBack, PersonAdd } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';
const WS_URL = API_BASE.replace('/api', '').replace('https', 'wss').replace('http', 'ws');

interface Message {
  id: string;
  sender_id: string;
  sender_name?: string;
  message: string;
  created_at: string;
  is_ai?: boolean;
}

export default function SupportScreen() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [agentActive, setAgentActive] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [humanRequested, setHumanRequested] = useState(false);
  const [ticketRoom, setTicketRoom] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(WS_URL, {
      transports: ['websocket'],
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-room', 'support-waiting');
      console.log('Connected to support');
    });

    socket.on('new-message', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.sender_id === '00000000-0000-0000-0000-000000000001') {
        setAiTyping(false);
      }
      if (msg.sender_id !== user?.id && msg.sender_id !== '00000000-0000-0000-0000-000000000001') {
        setAgentActive(true);
      }
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    socket.on('agent-joined', (data: { ticketId: string }) => {
      setAgentActive(true);
      alert('A support agent is now assisting you.');
    });

    // Fetch initial messages (optional)
    // ...

    return () => {
      if (ticketRoom) socket.emit('leave-room', ticketRoom);
      socket.disconnect();
    };
  }, [token]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || !user) return;
    const messageText = input.trim();
    setInput('');

    const room = ticketRoom || 'support-waiting';

    if (agentActive) {
      socketRef.current.emit('chat-message', {
        senderId: user.id,
        companyId: user.companyId || '',
        roomId: room,
        message: messageText,
      });
    } else {
      // AI mode
      const tempMsg: Message = {
        id: `temp-${Date.now()}`,
        sender_id: user.id,
        sender_name: user.first_name + ' ' + user.last_name,
        message: messageText,
        created_at: new Date().toISOString(),
        is_ai: false,
      };
      setMessages((prev) => [...prev, tempMsg]);

      // Check for human request
      const humanKeywords = ['human', 'agent', 'talk to someone', 'real person', 'support agent'];
      if (humanKeywords.some(keyword => messageText.toLowerCase().includes(keyword))) {
        requestHumanSupport();
        socketRef.current?.emit('chat-message', {
          senderId: '00000000-0000-0000-0000-000000000001',
          companyId: user.companyId || '',
          roomId: room,
          message: "I've notified our support team. They'll join shortly.",
        });
        return;
      }

      setAiTyping(true);
      fetch(`${API_BASE}/api/chatbot/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: messageText }),
      })
        .then((res) => res.json())
        .then((data) => {
          socketRef.current?.emit('chat-message', {
            senderId: '00000000-0000-0000-0000-000000000001',
            companyId: user.companyId || '',
            roomId: room,
            message: data.answer || "I'm not sure, please try again.",
          });
          setAiTyping(false);
        })
        .catch(() => {
          socketRef.current?.emit('chat-message', {
            senderId: '00000000-0000-0000-0000-000000000001',
            companyId: user.companyId || '',
            roomId: room,
            message: "I'm having trouble. Please request a human.",
          });
          setAiTyping(false);
        });
    }
  };

  const requestHumanSupport = async () => {
    if (humanRequested) {
      alert('Already requested. An agent will join shortly.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/support/request-human`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: user?.id,
          companyId: user?.companyId,
          userName: user?.first_name + ' ' + user?.last_name,
        }),
      });
      const data = await res.json();
      const ticketId = data.ticketId;
      const roomId = `support-ticket-${ticketId}`;
      setTicketRoom(roomId);

      socketRef.current?.emit('leave-room', 'support-waiting');
      socketRef.current?.emit('join-room', roomId);

      setHumanRequested(true);
      alert('Support team notified. They will join shortly.');
    } catch (err) {
      alert('Could not reach support. Please try again.');
    }
  };

  const renderMessage = (msg: Message) => {
    const isMine = msg.sender_id === user?.id;
    const isAI = msg.sender_id === '00000000-0000-0000-0000-000000000001';
    const isAgent = !isMine && !isAI;

    let bgcolor = '#1A1A1A';
    let color = '#FFF';
    let border = '1px solid #333';
    if (isMine) { bgcolor = '#00D4FF'; color = '#0A0A0A'; border = 'none'; }
    if (isAI) { border = '1px solid #00D4FF'; }
    if (isAgent) { border = '1px solid #4CAF50'; }

    return (
      <Box key={msg.id} sx={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', mb: 1.5 }}>
        <Paper sx={{ maxWidth: '70%', p: 1.5, bgcolor, border, borderRadius: 2 }}>
          <Typography variant="caption" sx={{ color: isMine ? '#0A0A0A' : '#00D4FF', display: 'block', mb: 0.5 }}>
            {msg.sender_name || (isMine ? 'You' : isAI ? 'Lucy (AI)' : 'Support Agent')}
          </Typography>
          <Typography variant="body2" sx={{ color }}>{msg.message}</Typography>
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
          Support
        </Typography>
      </Box>

      {/* Status Bar */}
      <Paper sx={{ p: 1, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: '#00D4FF' }}>
          {agentActive
            ? '👤 A support agent is online'
            : humanRequested
            ? '⏳ Agent will join shortly'
            : '🤖 Lucy (AI) is assisting you'}
        </Typography>
        {!agentActive && !humanRequested && (
          <Button
            variant="contained"
            size="small"
            startIcon={<PersonAdd />}
            onClick={requestHumanSupport}
            sx={{ bgcolor: '#F44336', color: '#FFF' }}
          >
            Request Human
          </Button>
        )}
      </Paper>

      {/* Messages */}
      <Box sx={{ flex: 1, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', p: 1 }}>
        {messages.map(renderMessage)}
        {aiTyping && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <CircularProgress size={16} sx={{ color: '#00D4FF' }} />
            <Typography variant="caption" sx={{ color: '#888' }}>Lucy is typing...</Typography>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input Bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, borderTop: '1px solid #333', pt: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder={agentActive ? 'Type your message...' : 'Ask Lucy or request a human'}
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