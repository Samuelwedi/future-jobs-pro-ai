import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, List, ListItem, ListItemButton,
  ListItemAvatar, Avatar, ListItemText, CircularProgress, Button,
} from '@mui/material';
import { Chat as ChatIcon, Group as GroupIcon } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Room {
  id: string;
  name: string | null;
  is_group: boolean;
  other_user_name?: string;
}

export default function ChatList() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRooms = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/rooms/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setRooms(data.rooms || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const renderRoom = (room: Room) => {
    const title = room.is_group ? (room.name || 'Unnamed Group') : (room.other_user_name || 'Unknown User');
    return (
      <ListItemButton
        key={room.id}
        onClick={() => navigate(`/chat/${room.id}`, { state: { roomName: title } })}
        sx={{ borderBottom: '1px solid #222' }}
      >
        <ListItemAvatar>
          <Avatar sx={{ bgcolor: '#00D4FF' }}>
            {room.is_group ? <GroupIcon /> : title.charAt(0).toUpperCase()}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={title}
          secondary={room.is_group ? 'Group' : 'Direct message'}
          primaryTypographyProps={{ color: '#FFF' }}
          secondaryTypographyProps={{ color: '#888' }}
        />
      </ListItemButton>
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
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFF' }}>Messages</Typography>
        <Button
          variant="contained"
          startIcon={<ChatIcon />}
          onClick={() => navigate('/new-chat')}
          sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
        >
          New Chat
        </Button>
      </Box>
      <List sx={{ bgcolor: '#1A1A1A', borderRadius: 2, border: '1px solid #333' }}>
        {rooms.length === 0 ? (
          <ListItem>
            <ListItemText primary="No conversations yet" sx={{ color: '#888' }} />
          </ListItem>
        ) : (
          rooms.map(renderRoom)
        )}
      </List>
    </Container>
  );
}