import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, TextField, Button, Switch, FormControlLabel,
  List, ListItem, ListItemText, ListItemAvatar, Avatar, Checkbox,
  CircularProgress, Alert, IconButton, Chip,
} from '@mui/material';
import { ArrowBack, Search } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

export default function NewChat() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      setFiltered(users.filter(u =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(lower)
      ));
    } else {
      setFiltered(users);
    }
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/company/${user?.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const allUsers = data.users || [];
      // Exclude current user
      const others = allUsers.filter((u: any) => u.id !== user?.id);
      setUsers(others);
      setFiltered(others);
    } catch (e) {
      console.error(e);
      alert('Could not load users');
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (id: string) => {
    if (isGroup) {
      setSelectedIds(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    } else {
      setSelectedIds(prev => (prev.includes(id) ? [] : [id]));
    }
  };

  const createChat = async () => {
    if (selectedIds.length === 0) {
      alert('Select at least one person');
      return;
    }
    try {
      let url = '';
      let body = {};
      if (isGroup) {
        if (!groupName.trim()) {
          alert('Enter a group name');
          return;
        }
        url = '/api/chat/create-group';
        body = { name: groupName.trim(), creatorId: user?.id, memberIds: selectedIds };
      } else {
        url = '/api/chat/create-direct';
        body = { userId1: user?.id, userId2: selectedIds[0] };
      }
      const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.roomId) {
        const otherUser = users.find(u => u.id === selectedIds[0]);
        const roomName = isGroup ? groupName.trim() : `${otherUser?.first_name} ${otherUser?.last_name}`;
        navigate('/chat', { state: { roomId: data.roomId, roomName } });
      } else {
        alert('Failed to create chat');
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
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
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', ml: 1 }}>
          New Chat
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Button
          variant={!isGroup ? 'contained' : 'outlined'}
          onClick={() => { setIsGroup(false); setSelectedIds([]); }}
          sx={!isGroup ? { bgcolor: '#00D4FF', color: '#0A0A0A' } : { color: '#00D4FF', borderColor: '#00D4FF' }}
        >
          Direct
        </Button>
        <Button
          variant={isGroup ? 'contained' : 'outlined'}
          onClick={() => { setIsGroup(true); setSelectedIds([]); }}
          sx={isGroup ? { bgcolor: '#00D4FF', color: '#0A0A0A' } : { color: '#00D4FF', borderColor: '#00D4FF' }}
        >
          Group
        </Button>
      </Box>

      {isGroup && (
        <TextField
          fullWidth
          label="Group Name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          sx={{ mb: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
        />
      )}

      <TextField
        fullWidth
        placeholder="Search employees..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        InputProps={{ startAdornment: <Search sx={{ color: '#888', mr: 1 }} /> }}
        sx={{ mb: 2, input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
      />

      <List sx={{ bgcolor: '#1A1A1A', borderRadius: 1, border: '1px solid #333' }}>
        {filtered.length === 0 ? (
          <ListItem>
            <ListItemText primary="No users found" sx={{ color: '#888' }} />
          </ListItem>
        ) : (
          filtered.map((u) => {
            const isSelected = selectedIds.includes(u.id);
            return (
              <ListItem
                key={u.id}
                button
                onClick={() => toggleUser(u.id)}
                sx={{ borderBottom: '1px solid #222' }}
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: '#00D4FF' }}>
                    {u.first_name[0]}{u.last_name[0]}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={`${u.first_name} ${u.last_name}`}
                  secondary={u.role}
                  primaryTypographyProps={{ color: '#FFF' }}
                  secondaryTypographyProps={{ color: '#888' }}
                />
                {isSelected && <Checkbox checked sx={{ color: '#00D4FF' }} />}
              </ListItem>
            );
          })
        )}
      </List>

      <Button
        fullWidth
        variant="contained"
        onClick={createChat}
        disabled={selectedIds.length === 0}
        sx={{ mt: 3, bgcolor: '#00D4FF', color: '#0A0A0A', py: 1.5 }}
      >
        {isGroup ? `Create Group (${selectedIds.length} members)` : 'Start Chat'}
      </Button>
    </Container>
  );
}