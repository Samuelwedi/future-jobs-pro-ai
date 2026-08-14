import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowBack, PersonAdd, Send } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

const API_BASE =
  ((import.meta.env as any).VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://future-jobs-pro-ai-production.up.railway.app';
const LUCY_ID = 'lucy-ai';

interface Message {
  id: string;
  sender_id: string;
  sender_name?: string;
  message: string;
  created_at: string;
  is_ai?: boolean;
}

export default function Support() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agentActive, setAgentActive] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [humanRequested, setHumanRequested] = useState(false);
  const [ticketRoom, setTicketRoom] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addMessage = (message: Message) => {
    setMessages((current) =>
      current.some((item) => item.id === message.id)
        ? current
        : [...current, message],
    );
  };

  useEffect(() => {
    if (!token) return;
    const socket = io(API_BASE, {
      transports: ['websocket'],
      auth: { token },
    });
    socketRef.current = socket;
    socket.on('connect_error', (socketError) => setError(socketError.message));
    socket.on('new-message', (message: Message) => addMessage(message));
    socket.on('support-message', (message: any) => addMessage({
      id: String(message.id),
      sender_id: message.senderType === 'agent' ? 'support-agent' : String(user.id),
      sender_name: message.senderName,
      message: message.message,
      created_at: message.createdAt,
    }));
    socket.on('agent-joined', () => setAgentActive(true));
    socket.on('ticket-resolved', () => {
      setAgentActive(false);
      setHumanRequested(false);
      setTicketRoom(null);
      setTicketId(null);
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void fetch(`${API_BASE}/api/support/active`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.ticket) return;
      const id = String(data.ticket.id);
      const roomId = String(data.ticket.roomId);
      setTicketId(id);
      setTicketRoom(roomId);
      setHumanRequested(true);
      setAgentActive(Boolean(data.ticket.assignedAgentId));
      socketRef.current?.emit('join-room', roomId);
      await loadTicketMessages(roomId);
    }).catch(() => {});
    // Restore an open support conversation after refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiTyping]);

  const loadTicketMessages = async (roomId: string) => {
    const id = roomId.replace(/^support-ticket-/, '');
    const response = await fetch(`${API_BASE}/api/support/tickets/${encodeURIComponent(id)}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load support messages');
    setAgentActive(Boolean(data.agentActive));
    setMessages((data.messages || []).map((item: any) => ({
      id: String(item.id),
      sender_id: item.senderType === 'customer' ? String(user.id) : item.senderType === 'lucy' ? LUCY_ID : 'support-agent',
      sender_name: item.senderName,
      message: item.message,
      created_at: item.createdAt,
      is_ai: item.senderType === 'lucy',
    })));
  };

  const requestHumanSupport = async () => {
    if (humanRequested) return;
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/support/request-human`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lucyMessages: messages,
          lucySummary: messages.slice(-10).map((item) => `${item.sender_name || 'Customer'}: ${item.message}`).join('\n'),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not request support');
      const roomId = String(data.roomId);
      setTicketId(String(data.ticketId));
      setTicketRoom(roomId);
      setHumanRequested(true);
      socketRef.current?.emit('join-room', roomId);
      await loadTicketMessages(roomId);
    } catch (requestError: any) {
      setError(requestError.message || 'Could not reach support');
    }
  };

  const askLucy = async (question: string) => {
    setAiTyping(true);
    try {
      const response = await fetch(`${API_BASE}/api/lucy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Lucy could not respond');
      const text = Array.isArray(data) ? data[0]?.text : data.text;
      addMessage({
        id: `lucy-${Date.now()}`,
        sender_id: LUCY_ID,
        sender_name: 'Lucy',
        message: text || "I'm not sure how to help with that.",
        created_at: new Date().toISOString(),
        is_ai: true,
      });
    } catch (lucyError: any) {
      setError(lucyError.message || 'Lucy is temporarily unavailable');
    } finally {
      setAiTyping(false);
    }
  };

  const sendMessage = async () => {
    const message = input.trim();
    if (!message) return;
    setInput('');
    setError('');

    if (ticketRoom && ticketId && humanRequested) {
      const response = await fetch(`${API_BASE}/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not send support message');
      await loadTicketMessages(ticketRoom);
      return;
    }

    addMessage({
      id: `local-${Date.now()}`,
      sender_id: user.id,
      sender_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'You',
      message,
      created_at: new Date().toISOString(),
    });

    if (/\b(human|agent|real person|talk to someone|support agent)\b/i.test(message)) {
      await requestHumanSupport();
      return;
    }
    await askLucy(message);
  };

  const renderMessage = (message: Message) => {
    const mine = message.sender_id === user.id;
    const ai = message.sender_id === LUCY_ID || message.is_ai;
    return (
      <Box key={message.id} sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', mb: 1.5 }}>
        <Paper
          sx={{
            maxWidth: '75%',
            p: 1.5,
            bgcolor: mine ? '#00D4FF' : '#1A1A1A',
            border: mine ? 'none' : `1px solid ${ai ? '#00D4FF' : '#4CAF50'}`,
            borderRadius: 2,
          }}
        >
          <Typography variant="caption" sx={{ color: mine ? '#0A0A0A' : ai ? '#00D4FF' : '#4CAF50' }}>
            {mine ? 'You' : message.sender_name || (ai ? 'Lucy' : 'Support Agent')}
          </Typography>
          <Typography variant="body2" sx={{ color: mine ? '#0A0A0A' : '#FFF', whiteSpace: 'pre-wrap' }}>
            {message.message}
          </Typography>
        </Paper>
      </Box>
    );
  };

  return (
    <Container maxWidth="md" sx={{ py: 2, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}><ArrowBack /></IconButton>
        <Typography variant="h6" sx={{ color: '#FFF', ml: 1 }}>Support</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper sx={{ p: 1.5, bgcolor: '#1A1A1A', border: '1px solid #333', mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: '#00D4FF' }}>
          {agentActive ? 'A support agent is online' : humanRequested ? 'Your support ticket is open' : 'Lucy is assisting you'}
        </Typography>
        {!humanRequested && (
          <Button variant="contained" size="small" startIcon={<PersonAdd />} onClick={requestHumanSupport} sx={{ bgcolor: '#F44336' }}>
            Request Human
          </Button>
        )}
      </Paper>

      <Box sx={{ minHeight: 420, maxHeight: 'calc(100vh - 270px)', overflowY: 'auto', p: 1 }}>
        {messages.length === 0 && (
          <Typography sx={{ color: '#888', textAlign: 'center', mt: 8 }}>
            Ask Lucy a question, or request a human support agent.
          </Typography>
        )}
        {messages.map(renderMessage)}
        {aiTyping && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <CircularProgress size={16} sx={{ color: '#00D4FF' }} />
            <Typography variant="caption" sx={{ color: '#888' }}>Lucy is typing…</Typography>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, borderTop: '1px solid #333', pt: 2 }}>
        <TextField
          fullWidth
          value={input}
          placeholder={humanRequested ? 'Message support…' : 'Ask Lucy…'}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          disabled={aiTyping}
          sx={{ '& .MuiOutlinedInput-root': { color: '#FFF', bgcolor: '#1A1A1A', borderRadius: 20 }, mr: 1 }}
        />
        <IconButton onClick={() => void sendMessage()} disabled={aiTyping || !input.trim()} sx={{ bgcolor: '#00D4FF' }}>
          <Send sx={{ color: '#0A0A0A' }} />
        </IconButton>
      </Box>
    </Container>
  );
}
