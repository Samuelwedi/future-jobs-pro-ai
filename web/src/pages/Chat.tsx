import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Paper, Avatar, List, ListItem,
  ListItemAvatar, ListItemText, TextField, Button, CircularProgress,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { ChatBubble, Send, GroupAdd, SupportAgent } from '@mui/icons-material';
import { io, Socket } from 'socket.io-client';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Message {
  id: string;
  sender_id: string;
  sender_name?: string;
  message: string;
  created_at: string;
}

interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  // Fetch team members
  useEffect(() => {
    if (!user?.companyId) return;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/team`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => { if (data.members) setMembers(data.members); })
      .catch(console.error);
  }, [user]);

  // Fetch messages when roomId changes
  useEffect(() => {
    if (!roomId) return;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/chat/room/${roomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => { setMessages(data.messages || []); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
  }, [roomId]);

  // WebSocket connection
  useEffect(() => {
    if (!roomId || !user) return;
    const socket = io(API_BASE, {
      transports: ['websocket'],
      auth: { token: localStorage.getItem('token') },
    });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('join-room', roomId));
    socket.on('new-message', (msg: Message) => setMessages(prev => [...prev, msg]));

    return () => {
      socket.emit('leave-room', roomId);
      socket.disconnect();
    };
  }, [roomId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startDM = (otherUserId: string) => {
    const sorted = [user.id, otherUserId].sort();
    setRoomId(`dm_${sorted[0]}_${sorted[1]}`);
    setSelectedUser(otherUserId);
    setCreatingGroup(false);
    setLoading(true);
  };

  const createGroup = () => {
    if (!groupName.trim()) return;
    setRoomId(`group_${Date.now()}_${groupName.replace(/\s+/g, '_')}`);
    setCreatingGroup(false);
    setGroupName('');
    setLoading(true);
  };

  const joinSupport = () => {
    setRoomId('support');
    setSelectedUser('');
    setCreatingGroup(false);
    setLoading(true);
  };

  const handleSend = () => {
    if (!newMessage.trim() || !socketRef.current || !user || !roomId) return;
    socketRef.current.emit('chat-message', {
      senderId: user.id,
      companyId: user.companyId,
      roomId,
      message: newMessage.trim(),
    });
    setNewMessage('');
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
          Choose a colleague or create a group to start chatting
        </Typography>

        {/* Room selection */}
        <Paper sx={{ p: 2, mb: 2, bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel sx={{ color: '#888' }}>Chat with</InputLabel>
              <Select
                value={selectedUser}
                onChange={(e) => startDM(e.target.value)}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
              >
                {members.map(m => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.first_name} {m.last_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              startIcon={<GroupAdd />}
              onClick={() => setCreatingGroup(!creatingGroup)}
              sx={{ color: '#00D4FF', borderColor: '#00D4FF' }}
            >
              New Group
            </Button>
            {/* ---- Support Button ---- */}
            <Button
              variant="outlined"
              startIcon={<SupportAgent />}
              onClick={joinSupport}
              sx={{ color: '#F44336', borderColor: '#F44336' }}
            >
              Contact Support
            </Button>
          </Box>
          {creatingGroup && (
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                placeholder="Group name"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                sx={{ input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
              />
              <Button variant="contained" onClick={createGroup} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}>Create</Button>
            </Box>
          )}
        </Paper>

        {/* Chat messages */}
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
                      <Avatar sx={{ bgcolor: isMe ? '#00D4FF' : '#555', width: 32, height: 32, fontSize: 14 }}>
                        {msg.sender_name ? msg.sender_name.charAt(0).toUpperCase() : '?'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={msg.sender_name || 'Unknown'}
                      secondary={msg.message}
                      primaryTypographyProps={{ color: '#FFF', fontSize: 14 }}
                      secondaryTypographyProps={{ color: '#AAA', fontSize: 13 }}
                      sx={{ textAlign: isMe ? 'right' : 'left', mr: isMe ? 0 : 2, ml: isMe ? 2 : 0 }}
                    />
                  </ListItem>
                );
              })}
              <div ref={messagesEndRef} />
            </List>
          )}
        </Paper>

        {/* Send input */}
        {roomId && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              placeholder="Type a message..."
              variant="outlined"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              sx={{ input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { bgcolor: '#1A1A1A', borderRadius: 2, '& fieldset': { borderColor: '#333' } } }}
            />
            <Button variant="contained" onClick={handleSend} disabled={!newMessage.trim()} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 4 }}>
              <Send />
            </Button>
          </Box>
        )}
      </Container>
    </Box>
  );
}