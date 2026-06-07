import React, { useState, useRef, useEffect } from 'react';
import {
  Box, TextField, IconButton, Paper, Typography, List, ListItem,
  Avatar, ListItemAvatar, ListItemText, CircularProgress,
} from '@mui/material';
import { Send, SmartToy } from '@mui/icons-material';

interface Message {
  text: string;
  isUser: boolean;
}

export default function AskLucy() {
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hi! I'm Lucy. Try asking: 'run payroll for last week' or 'show my team status'", isUser: false },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setMessages(prev => [...prev, { text: userMessage, isUser: true }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/lucy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!res.ok) {
        throw new Error(`Lucy responded with status ${res.status}`);
      }

      const data = await res.json();
      const botText = data?.[0]?.text || "I'm not sure how to respond to that yet.";
      setMessages(prev => [...prev, { text: botText, isUser: false }]);
    } catch (err: any) {
      console.error('Lucy fetch error:', err.message);
      setMessages(prev => [...prev, {
        text: `Sorry, Lucy is taking a break. (${err.message})`,
        isUser: false
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4, display: 'flex', justifyContent: 'center' }}>
      <Box sx={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', height: '90vh' }}>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2, textAlign: 'center' }}>
          <SmartToy sx={{ mr: 1, verticalAlign: 'middle' }} />
          Ask Lucy
        </Typography>
        <Typography variant="body2" sx={{ color: '#888', mb: 3, textAlign: 'center' }}>
          Type a command – Lucy will execute it. (e.g., “run payroll for last week”)
        </Typography>

        <Paper sx={{ flex: 1, bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', p: 2, mb: 2, overflowY: 'auto' }}>
          <List>
            {messages.map((msg, i) => (
              <ListItem key={i} sx={{ flexDirection: msg.isUser ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                {!msg.isUser && (
                  <ListItemAvatar sx={{ minWidth: 40 }}>
                    <Avatar sx={{ bgcolor: '#00D4FF', width: 32, height: 32, fontSize: 14 }}>L</Avatar>
                  </ListItemAvatar>
                )}
                <ListItemText
                  primary={msg.text}
                  primaryTypographyProps={{
                    color: msg.isUser ? '#00D4FF' : '#FFF',
                    fontSize: 14,
                    fontWeight: msg.isUser ? 'bold' : 'normal',
                    sx: { textAlign: msg.isUser ? 'right' : 'left' },
                  }}
                />
              </ListItem>
            ))}
            {loading && <CircularProgress size={20} sx={{ color: '#00D4FF', display: 'block', mx: 'auto' }} />}
            <div ref={messagesEndRef} />
          </List>
        </Paper>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            placeholder="Type a command..."
            variant="outlined"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            sx={{
              input: { color: '#FFF' },
              '& .MuiOutlinedInput-root': { bgcolor: '#1A1A1A', borderRadius: 2, '& fieldset': { borderColor: '#333' } },
            }}
          />
          <IconButton onClick={sendMessage} disabled={loading || !input.trim()} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', width: 48, height: 48 }}>
            <Send />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}