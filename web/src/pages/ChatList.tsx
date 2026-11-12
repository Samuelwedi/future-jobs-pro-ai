import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Container, InputAdornment,
  List, ListItemAvatar, ListItemButton, ListItemText, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { AddCommentOutlined, ForumOutlined, GroupOutlined, Refresh, Search } from '@mui/icons-material';
import { createViewCountReader, privateViewLabel, PRIVATE_VIEW_HISTORY_NOTE, type ViewCount } from '../services/chatViews';
import { getAuthRevision } from '../services/authSession';
import { chatOwnerKey, openChatInboxSession, readChatOwner, type ChatOwner } from '../services/chatSession';

interface Room {
  id: string;
  name: string | null;
  is_group: boolean;
  other_user_name?: string;
  avatar_url?:string;
  other_user_avatar?:string;
}

function browserRouteKey(): string {
  return JSON.stringify([window.location.pathname, window.location.search, window.location.hash, window.history.state?.key || 'default']);
}

function readRooms(data: any): Room[] {
  if (data?.success !== true || !Array.isArray(data.rooms)) throw new Error('Invalid conversations response');
  const ids = new Set<string>();
  return data.rooms.map((room: any) => {
    if (!room || typeof room.id !== 'string' || !room.id || ids.has(room.id) || typeof room.is_group !== 'boolean') {
      throw new Error('Invalid conversation');
    }
    ids.add(room.id);
    return { id: room.id, is_group: room.is_group,
      name: typeof room.name === 'string' ? room.name : null,
      other_user_name: typeof room.other_user_name === 'string' ? room.other_user_name : undefined,
      avatar_url: typeof room.avatar_url === 'string' ? room.avatar_url : undefined,
      other_user_avatar: typeof room.other_user_avatar === 'string' ? room.other_user_avatar : undefined };
  });
}

export default function ChatList() {
  const location = useLocation();
  const [owner, setOwner] = useState(readChatOwner);
  const [authEpoch, setAuthEpoch] = useState(getAuthRevision);
  const route = JSON.stringify([location.pathname, location.search, location.hash, location.key]);
  const scope = JSON.stringify([chatOwnerKey(owner), authEpoch, route]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    const refresh = () => {
      const next = readChatOwner();
      const revision = getAuthRevision();
      if (chatOwnerKey(next) !== chatOwnerKey(owner) || revision !== authEpoch) {
        currentScope.current = '';
        setOwner(next);
        setAuthEpoch(revision);
      }
    };
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('auth-session-changed', refresh);
    window.addEventListener('auth-user-updated', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('auth-session-changed', refresh);
      window.removeEventListener('auth-user-updated', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [owner, authEpoch]);
  if (!owner) return <Alert severity="error">Sign in to use messages.</Alert>;
  return <OwnedChatList key={scope} owner={owner}
    scopeCurrent={() => currentScope.current === scope && browserRouteKey() === route
      && getAuthRevision() === authEpoch && chatOwnerKey(readChatOwner()) === chatOwnerKey(owner)} />;
}

function OwnedChatList({ owner, scopeCurrent }: { owner: ChatOwner; scopeCurrent: () => boolean }) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const leaving = useRef(false);
  const pageActive = useRef(true);
  const foreground = useRef(document.visibilityState !== 'hidden' && document.hasFocus());
  const denied = useRef(false);
  const epoch = useRef(0);
  const loadSequence = useRef(0);
  const roomsRef = useRef<Room[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [placeholderHeight, setPlaceholderHeight] = useState(300);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [viewCounts, setViewCounts] = useState<ViewCount[] | null>(null);
  const countsRef = useRef<ReturnType<typeof createViewCountReader> | null>(null);
  const isCurrent = () => mounted.current && !leaving.current && !denied.current && scopeCurrent();
  const canRead = () => isCurrent() && pageActive.current && foreground.current
    && document.visibilityState !== 'hidden' && document.hasFocus();

  const holdListSpace = () => {
    const height = listRef.current?.getBoundingClientRect().height;
    if (height && Number.isFinite(height)) setPlaceholderHeight(Math.max(300, Math.ceil(height)));
  };

  const loadRooms = async () => {
    if (!canRead()) return;
    countsRef.current?.invalidate();
    const sequence = ++loadSequence.current;
    const generation = epoch.current;
    const current = () => canRead() && loadSequence.current === sequence && epoch.current === generation;
    // Keep this view's measured geometry while private rows are cleared. This
    // avoids clamping page scroll on refresh/blur/BFCache without forcing a
    // later scroll jump if the person moves while loading. A new key starts fresh.
    holdListSpace();
    roomsRef.current = [];
    setRooms([]);
    setLoading(true);
    setError('');
    setLoadFailed(false);
    const session = openChatInboxSession(owner, current);
    try {
      const data = await session.readRooms();
      if (!current() || !session.isCurrent()) return;
      const next = readRooms(data);
      roomsRef.current = next;
      setRooms(next);
      void countsRef.current?.refresh();
    } catch (requestError: any) {
      if (!current() || !session.isCurrent()) return;
      setLoadFailed(true);
      if (requestError?.code === 'CHAT_ACCESS_CHANGED') {
        denied.current = true;
        setViewCounts(null);
        setLoading(false);
        setError('Your access to messages changed. Reopen messages or sign in again.');
      } else setError('Conversations could not be loaded. Refresh to try again.');
    } finally {
      if (current() && session.isCurrent()) setLoading(false);
    }
  };

  useLayoutEffect(() => {
    mounted.current = true;
    leaving.current = false;
    pageActive.current = true;
    foreground.current = document.visibilityState !== 'hidden' && document.hasFocus();
    const countSession = openChatInboxSession(owner, canRead);
    const countReader = createViewCountReader({ owner, isCurrent: () => canRead() && countSession.isCurrent(),
      read: countSession.readViewCounts, onCounts: setViewCounts,
      onDenied: () => {
        denied.current = true; epoch.current++; roomsRef.current = []; setRooms([]); setViewCounts(null); setLoading(false); setLoadFailed(true);
        setError('Your access to messages changed. Reopen messages or sign in again.');
      } });
    countsRef.current = countReader;
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (canRead() && detail?.actorId === owner.id && detail?.companyId === owner.companyId) {
        countReader.invalidate(); void countReader.refresh();
      }
    };
    window.addEventListener('chat-views-updated', changed);
    const leave = () => { countReader.invalidate(); setViewCounts(null); leaving.current = true; epoch.current++; };
    const suspend = () => {
      countReader.invalidate();
      setViewCounts(null);
      foreground.current = false;
      epoch.current++;
      roomsRef.current = [];
      if (!isCurrent()) return;
      holdListSpace();
      setRooms([]);
      setLoading(true);
      setError('');
    };
    const resume = () => {
      if (!pageActive.current || foreground.current || document.visibilityState === 'hidden' || !document.hasFocus() || !isCurrent()) return;
      foreground.current = true;
      void loadRooms();
    };
    const visibility = () => document.visibilityState === 'hidden' ? suspend() : resume();
    const hidePage = () => { pageActive.current = false; suspend(); };
    const restorePage = () => {
      // BFCache keeps the component alive. Replace its read, never revive the
      // pre-pagehide request, including pageshow followed by same-entry popstate.
      if (!mounted.current || !scopeCurrent()) return;
      pageActive.current = true;
      resume();
    };
    const routeChanged = () => {
      if (!scopeCurrent()) { leave(); return; }
      // Rapid Back/Forward can return to this visit before React unmounts it.
      // Revalidate with a new read rather than reviving the departed request.
      if (mounted.current && pageActive.current && leaving.current) {
        leaving.current = false;
        suspend();
        resume();
      }
    };
    window.addEventListener('popstate', routeChanged);
    window.addEventListener('pagehide', hidePage);
    window.addEventListener('pageshow', restorePage);
    window.addEventListener('blur', suspend);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibility);
    void loadRooms();
    return () => {
      countReader.dispose();
      if (countsRef.current === countReader) countsRef.current = null;
      window.removeEventListener('chat-views-updated', changed);
      mounted.current = false;
      epoch.current++;
      loadSequence.current++;
      roomsRef.current = [];
      window.removeEventListener('popstate', routeChanged);
      window.removeEventListener('pagehide', hidePage);
      window.removeEventListener('pageshow', restorePage);
      window.removeEventListener('blur', suspend);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const openConversation = (room?: Room) => {
    if (!canRead() || (room && !roomsRef.current.includes(room))) return;
    leaving.current = true;
    epoch.current++;
    if (!room) navigate('/new-chat');
    else navigate(`/chat/${encodeURIComponent(room.id)}`, {
      state: { roomName: room.is_group ? room.name || 'Unnamed group' : room.other_user_name || 'Direct message' },
    });
  };

  const visibleRooms = rooms.filter((room) => {
    const title = room.is_group ? room.name : room.other_user_name;
    return String(title || 'Chat').toLowerCase().includes(query.toLowerCase());
  });

  return (
    <Box sx={{ bgcolor: '#080B10', minHeight: '100vh', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} mb={3}>
          <Box><Typography variant="overline" sx={{ color: '#00D4FF', letterSpacing: 2 }}>TEAM COMMUNICATION</Typography><Typography variant="h3" sx={{ color: '#FFF', fontWeight: 800, fontSize: { xs: 32, md: 44 } }}>Messages</Typography><Typography sx={{ color: '#8FA0B4', mt: 1 }}>Private, company-scoped conversations for your field and office teams.</Typography></Box>
          <Button variant="contained" startIcon={<AddCommentOutlined />} disabled={denied.current} onClick={() => openConversation()} sx={{ alignSelf: { sm: 'center' }, bgcolor: '#00D4FF', color: '#031016', fontWeight: 800, px: 2.5 }}>New conversation</Button>
        </Stack>
        <Typography variant="caption" sx={{ color: '#8FA0B4', display: 'block', mb: 2 }}>{PRIVATE_VIEW_HISTORY_NOTE}</Typography>
        {error && <Alert severity="error" onClose={() => { if (canRead() && !denied.current) setError(''); }} sx={{ mb: 2 }}>{error}</Alert>}
        <Paper sx={{ bgcolor: '#10161E', border: '1px solid #202C39', borderRadius: 3, overflow: 'hidden' }}>
          <Stack direction="row" spacing={1} p={2} borderBottom="1px solid #202C39">
            <TextField fullWidth size="small" value={query} onChange={(e) => { if (canRead()) setQuery(e.target.value); }} placeholder="Search conversations" InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: '#65778A' }} /></InputAdornment> }} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF', bgcolor: '#0B1118', '& fieldset': { borderColor: '#263443' } } }} />
            <Button aria-label="Refresh conversations" disabled={denied.current} onClick={() => void loadRooms()} sx={{ minWidth: 44, color: '#8FA5B8', border: '1px solid #263443' }}><Refresh /></Button>
          </Stack>
          <Box ref={listRef} sx={{ minHeight: loading ? placeholderHeight : undefined }}>
          {loading ? <Box display="grid" sx={{ placeItems: 'center', minHeight: 300 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box> : visibleRooms.length === 0 ? (
            <Box textAlign="center" py={9} px={2}><ForumOutlined sx={{ fontSize: 58, color: '#526579' }} /><Typography variant="h6" sx={{ color: '#FFF', mt: 2 }}>{loadFailed ? 'Conversations unavailable' : query ? 'No matching conversations' : 'Start your first conversation'}</Typography><Typography sx={{ color: '#8292A6', mt: 1 }}>Direct messages and groups will appear here.</Typography></Box>
          ) : (
            <List disablePadding>{visibleRooms.map((room) => {
              const title = room.is_group ? room.name || 'Unnamed group' : room.other_user_name || 'Direct message';
              const count = viewCounts?.find(count => count.roomId === room.id);
              const countLabel = privateViewLabel(count);
              return <ListItemButton key={room.id} onClick={() => openConversation(room)} sx={{ py: 2, px: 2.5, flexWrap: 'wrap', gap: 1, borderBottom: '1px solid #1B2733', '&:hover': { bgcolor: '#14212C' } }}>
                <ListItemAvatar><Avatar src={room.is_group?room.avatar_url:room.other_user_avatar} sx={{ bgcolor: room.is_group ? '#7357FF' : '#00D4FF', color: '#061017', fontWeight: 800 }}>{room.is_group ? <GroupOutlined sx={{ color: '#FFF' }} /> : title.charAt(0).toUpperCase()}</Avatar></ListItemAvatar>
                <ListItemText primary={title} secondary={room.is_group ? 'Team group' : 'Direct message'} primaryTypographyProps={{ color: '#FFF', fontWeight: 700 }} secondaryTypographyProps={{ color: '#7D8FA2' }} />
                {!room.id.startsWith('support-ticket-') && <Chip size="small" label={count ? count.unviewedCountCapped ? '99+' : count.unviewedCount : 'Unavailable'}
                  title={countLabel} aria-label={countLabel} sx={{ color: '#B6D6E8', bgcolor: '#182330', mr: 1 }} />}
                <Chip size="small" label={room.is_group ? 'Group' : 'Direct'} sx={{ color: '#8FA5B8', bgcolor: '#182330' }} />
              </ListItemButton>;
            })}</List>
          )}
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
