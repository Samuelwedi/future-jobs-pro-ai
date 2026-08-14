import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Container, InputAdornment,
  List, ListItemAvatar, ListItemButton, ListItemText, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { AddCommentOutlined, ForumOutlined, GroupOutlined, Refresh, Search } from '@mui/icons-material';
import { api } from '../services/api';

interface Room {
  id: string;
  name: string | null;
  is_group: boolean;
  other_user_name?: string;
}

export default function ChatList() {
  const navigate = useNavigate();
  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const loadRooms = useCallback(async () => {
    if (!user.id) { setError('Your session is missing user information. Please sign in again.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ success: boolean; rooms: Room[] }>(`/api/chat/rooms/${encodeURIComponent(user.id)}`, { cache: 'no-store' });
      setRooms(data.rooms || []);
    } catch (requestError: any) {
      setError(requestError.message || 'Conversations could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);

  const visibleRooms = rooms.filter((room) => {
    const title = room.is_group ? room.name : room.other_user_name;
    return String(title || 'Chat').toLowerCase().includes(query.toLowerCase());
  });

  return (
    <Box sx={{ bgcolor: '#080B10', minHeight: '100vh', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} mb={3}>
          <Box><Typography variant="overline" sx={{ color: '#00D4FF', letterSpacing: 2 }}>TEAM COMMUNICATION</Typography><Typography variant="h3" sx={{ color: '#FFF', fontWeight: 800, fontSize: { xs: 32, md: 44 } }}>Messages</Typography><Typography sx={{ color: '#8FA0B4', mt: 1 }}>Private, company-scoped conversations for your field and office teams.</Typography></Box>
          <Button variant="contained" startIcon={<AddCommentOutlined />} onClick={() => navigate('/new-chat')} sx={{ alignSelf: { sm: 'center' }, bgcolor: '#00D4FF', color: '#031016', fontWeight: 800, px: 2.5 }}>New conversation</Button>
        </Stack>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
        <Paper sx={{ bgcolor: '#10161E', border: '1px solid #202C39', borderRadius: 3, overflow: 'hidden' }}>
          <Stack direction="row" spacing={1} p={2} borderBottom="1px solid #202C39">
            <TextField fullWidth size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations" InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: '#65778A' }} /></InputAdornment> }} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF', bgcolor: '#0B1118', '& fieldset': { borderColor: '#263443' } } }} />
            <Button aria-label="Refresh conversations" onClick={() => void loadRooms()} sx={{ minWidth: 44, color: '#8FA5B8', border: '1px solid #263443' }}><Refresh /></Button>
          </Stack>
          {loading ? <Box display="grid" sx={{ placeItems: 'center', minHeight: 300 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box> : visibleRooms.length === 0 ? (
            <Box textAlign="center" py={9} px={2}><ForumOutlined sx={{ fontSize: 58, color: '#526579' }} /><Typography variant="h6" sx={{ color: '#FFF', mt: 2 }}>{query ? 'No matching conversations' : 'Start your first conversation'}</Typography><Typography sx={{ color: '#8292A6', mt: 1 }}>Direct messages and groups will appear here.</Typography></Box>
          ) : (
            <List disablePadding>{visibleRooms.map((room) => {
              const title = room.is_group ? room.name || 'Unnamed group' : room.other_user_name || 'Direct message';
              return <ListItemButton key={room.id} onClick={() => navigate(`/chat/${encodeURIComponent(room.id)}`, { state: { roomName: title } })} sx={{ py: 2, px: 2.5, borderBottom: '1px solid #1B2733', '&:hover': { bgcolor: '#14212C' } }}>
                <ListItemAvatar><Avatar sx={{ bgcolor: room.is_group ? '#7357FF' : '#00D4FF', color: '#061017', fontWeight: 800 }}>{room.is_group ? <GroupOutlined sx={{ color: '#FFF' }} /> : title.charAt(0).toUpperCase()}</Avatar></ListItemAvatar>
                <ListItemText primary={title} secondary={room.is_group ? 'Team group' : 'Direct message'} primaryTypographyProps={{ color: '#FFF', fontWeight: 700 }} secondaryTypographyProps={{ color: '#7D8FA2' }} />
                <Chip size="small" label={room.is_group ? 'Group' : 'Direct'} sx={{ color: '#8FA5B8', bgcolor: '#182330' }} />
              </ListItemButton>;
            })}</List>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
