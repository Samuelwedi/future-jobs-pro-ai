import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Box, Container, Typography, TextField, Button, List, ListItem, ListItemText,
  ListItemAvatar, Avatar, Checkbox, CircularProgress, Alert, IconButton,
} from '@mui/material';
import { ArrowBack, GroupAddOutlined, PersonAddAltOutlined, Search } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthRevision } from '../services/authSession';
import { chatOwnerKey, readChatOwner, type ChatOwner } from '../services/chatSession';
import { chatPersonId, MAX_CHAT_RECIPIENTS, openChatCreationSession } from '../services/chatCreationSession';

type Person = { id: string; first_name: string; last_name: string; role: string };
type CreationSession = ReturnType<typeof openChatCreationSession>;
const uncertainNotice = 'Creation not confirmed. It may already exist. Go back and check your conversations before trying again. Nothing will retry automatically.';

function readPeople(data: any, owner: ChatOwner): Person[] {
  if (data?.success !== true || !Array.isArray(data.users)) throw new Error('Invalid people response');
  const ids = new Set<string>();
  return data.users.map((person: any) => {
    const id = chatPersonId(person?.id);
    if (!id || ids.has(id)) throw new Error('Invalid person');
    ids.add(id);
    return { id, first_name: typeof person.first_name === 'string' ? person.first_name : '',
      last_name: typeof person.last_name === 'string' ? person.last_name : '',
      role: typeof person.role === 'string' ? person.role : '' };
  }).filter((person: Person) => person.id !== chatPersonId(owner.id));
}

function browserRouteKey(): string {
  // Read history synchronously too: a navigation can change the address before
  // React commits the new route, including another visit to this same pathname.
  return JSON.stringify([window.location.pathname, window.location.search, window.location.hash, window.history.state?.key || 'default']);
}

export default function NewChat() {
  const location = useLocation();
  const [owner, setOwner] = useState(readChatOwner);
  const [authEpoch, setAuthEpoch] = useState(getAuthRevision);
  // Compare the router's visit to the live browser entry. A state rerender
  // while navigation is pending must not adopt the new URL for an old route.
  const route = JSON.stringify([location.pathname, location.search, location.hash, location.key]);
  const scope = JSON.stringify([chatOwnerKey(owner), authEpoch, location.key, route]);
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
  if (!owner || !chatPersonId(owner.id)) return <Alert severity="error">Sign in to start a conversation.</Alert>;
  return <OwnedNewChat key={scope} owner={owner}
    scopeCurrent={() => currentScope.current === scope && browserRouteKey() === route
      && getAuthRevision() === authEpoch && chatOwnerKey(readChatOwner()) === chatOwnerKey(owner)} />;
}

function OwnedNewChat({ owner, scopeCurrent }: { owner: ChatOwner; scopeCurrent: () => boolean }) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const leaving = useRef(false);
  const pageHidden = useRef(false);
  const denied = useRef(false);
  const foreground = useRef(document.visibilityState !== 'hidden');
  const epoch = useRef(0);
  const sessionRef = useRef<CreationSession | null>(null);
  const loadSequence = useRef(0);
  const createLock = useRef<CreationSession | null>(null);
  const uncertainRef = useRef(false);
  const peopleRef = useRef<Person[]>([]);
  const draft = useRef({ isGroup: false, groupName: '', selectedIds: [] as string[] });
  const [users, setUsers] = useState<Person[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const isCurrent = () => mounted.current && !leaving.current && !denied.current && scopeCurrent();
  const accessChanged = () => {
    if (!isCurrent()) return;
    denied.current = true;
    sessionRef.current = null;
    peopleRef.current = [];
    draft.current.selectedIds = [];
    setUsers([]);
    setSelectedIds([]);
    setLoading(false);
    setCreating(false);
    setStatus('Your access changed. Go back and reopen New conversation or sign in again.');
  };
  const loadPeople = async () => {
    if (!isCurrent() || createLock.current || uncertainRef.current) return;
    const sequence = ++loadSequence.current;
    const generation = epoch.current;
    const current = () => isCurrent() && loadSequence.current === sequence && epoch.current === generation;
    sessionRef.current = null;
    peopleRef.current = [];
    draft.current.selectedIds = [];
    setUsers([]);
    setSelectedIds([]);
    setLoading(true);
    setLoadError(false);
    setStatus('');
    const session = openChatCreationSession(owner, current);
    try {
      const data = await session.readUsers();
      if (!current() || !session.isCurrent()) return;
      const people = readPeople(data, owner);
      peopleRef.current = people;
      setUsers(people);
      sessionRef.current = session;
    } catch (error: any) {
      if (!current() || !session.isCurrent()) return;
      if (error?.code === 'CHAT_ACCESS_CHANGED') accessChanged();
      else setLoadError(true);
    } finally {
      if (current() && session.isCurrent()) setLoading(false);
    }
  };

  useLayoutEffect(() => {
    mounted.current = true;
    leaving.current = false;
    foreground.current = document.visibilityState !== 'hidden';
    const leave = () => { leaving.current = true; epoch.current++; };
    // A hidden/background pending creation cannot later navigate the user away
    // from newer work. Keep its uncertainty in memory, without retrying on focus.
    const suspend = () => {
      foreground.current = false;
      if (!isCurrent() || !createLock.current) return;
      epoch.current++;
      uncertainRef.current = true;
      setUncertain(true);
      setCreating(false);
      setStatus(uncertainNotice);
    };
    const resume = () => { foreground.current = document.visibilityState !== 'hidden'; };
    const visibility = () => { if (document.visibilityState === 'hidden') suspend(); else resume(); };
    const hidePage = () => {
      pageHidden.current = true;
      suspend();
      leave();
    };
    const restorePage = (event: PageTransitionEvent) => {
      if (!event.persisted || !pageHidden.current || !mounted.current || !scopeCurrent()) return;
      pageHidden.current = false;
      leaving.current = false;
      resume();
      if (uncertainRef.current) {
        setCreating(false);
        setUncertain(true);
        setStatus(uncertainNotice);
      } else {
        // BFCache preserves this component. Its old transport remains fenced by
        // the incremented epoch; refresh only the read-only picker, never a POST.
        void loadPeople();
      }
    };
    const routeChanged = () => {
      // BFCache restoration may emit popstate after pageshow for this same
      // history entry. Only a different visit/owner invalidates this view.
      if (!scopeCurrent()) leave();
    };
    window.addEventListener('popstate', routeChanged);
    window.addEventListener('pagehide', hidePage);
    window.addEventListener('pageshow', restorePage);
    window.addEventListener('blur', suspend);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibility);
    void loadPeople();
    return () => {
      mounted.current = false;
      epoch.current++;
      loadSequence.current++;
      sessionRef.current = null;
      window.removeEventListener('popstate', routeChanged);
      window.removeEventListener('pagehide', hidePage);
      window.removeEventListener('pageshow', restorePage);
      window.removeEventListener('blur', suspend);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const canEdit = () => foreground.current && document.visibilityState !== 'hidden' && isCurrent() && !!sessionRef.current?.isCurrent() && !createLock.current && !uncertainRef.current;
  const toggleUser = (id: string) => {
    if (!canEdit() || !peopleRef.current.some(person => person.id === id)) return;
    const previous = draft.current.selectedIds;
    if (draft.current.isGroup && !previous.includes(id) && previous.length >= MAX_CHAT_RECIPIENTS) {
      setStatus(`Select no more than ${MAX_CHAT_RECIPIENTS} people. You are added automatically.`);
      return;
    }
    const selected = draft.current.isGroup
      ? previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
      : previous.includes(id) ? [] : [id];
    draft.current.selectedIds = selected;
    setSelectedIds(selected);
    setStatus('');
  };
  const changeMode = (group: boolean) => {
    if (!canEdit()) return;
    draft.current.isGroup = group;
    draft.current.selectedIds = [];
    setIsGroup(group);
    setSelectedIds([]);
    setStatus('');
  };
  const changeName = (name: string) => {
    if (!canEdit()) return;
    draft.current.groupName = name;
    setGroupName(name);
    setStatus('');
  };
  const goBack = () => {
    if (!mounted.current || leaving.current || !scopeCurrent()) return;
    leaving.current = true;
    navigate(-1);
  };
  const createChat = async () => {
    const session = sessionRef.current;
    if (!canEdit() || !session) return;
    // Retained callbacks use the current draft. The request and its display name
    // then share one immutable snapshot, and edits cannot race the request.
    const { isGroup, groupName } = draft.current;
    const memberIds = [...draft.current.selectedIds];
    if (!memberIds.length || memberIds.length > MAX_CHAT_RECIPIENTS || (!isGroup && memberIds.length !== 1)
      || new Set(memberIds).size !== memberIds.length
      || memberIds.some(id => id === chatPersonId(owner.id) || !peopleRef.current.some(person => person.id === id))) {
      setStatus('Select between 1 and 100 other people from the current list.');
      return;
    }
    const name = groupName.trim();
    if (isGroup && (!name || name.length > 100 || name.includes('\0'))) {
      setStatus('Enter a group name of 1 to 100 characters without null characters.');
      return;
    }
    const other = peopleRef.current.find(person => person.id === memberIds[0]);
    const roomName = isGroup ? name : `${other?.first_name || ''} ${other?.last_name || ''}`.trim() || 'Chat';
    createLock.current = session;
    setCreating(true);
    setStatus('');
    try {
      const result = isGroup ? await session.createGroup(name, memberIds) : await session.createDirect(memberIds[0]);
      if (!isCurrent() || !session.isCurrent()) return;
      const validRoom = typeof result?.roomId === 'string' && (isGroup
        ? /^group-[0-9]+-[a-z0-9]{1,6}$/.test(result.roomId)
        : result.roomId === [chatPersonId(owner.id), memberIds[0]].sort().join('-'));
      if (result?.success !== true || !validRoom) throw new Error('Unconfirmed creation');
      // Fence retained handlers before React/router processes navigation.
      leaving.current = true;
      navigate(`/chat/${encodeURIComponent(result.roomId)}`, { replace: true, state: { roomName } });
    } catch (error: any) {
      if (!isCurrent() || !session.isCurrent()) return;
      if (error?.code === 'CHAT_ACCESS_CHANGED') accessChanged();
      else if (error?.code === 'CHAT_NOT_SENT') {
        setStatus('Chat was not created. Nothing was queued. Check your connection and access, then try again.');
      } else {
        // Memory-only hold, not durable group idempotency. Leaving/reloading loses
        // this guard; the user must inspect the inbox before manually recreating.
        uncertainRef.current = true;
        setUncertain(true);
        setStatus(uncertainNotice);
      }
    } finally {
      if (createLock.current === session && !leaving.current) createLock.current = null;
      if (isCurrent() && session.isCurrent()) setCreating(false);
    }
  };

  const disabled = loading || loadError || creating || uncertain || !isCurrent();
  const lower = searchTerm.trim().toLowerCase();
  const filtered = users.filter(person => `${person.first_name} ${person.last_name}`.toLowerCase().includes(lower));
  return (
    <Box sx={{ bgcolor: '#080B10', minHeight: '100vh', py: { xs: 2, md: 4 } }}><Container maxWidth="md">
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton aria-label="Go back" onClick={goBack} sx={{ color: '#FFF' }}><ArrowBack /></IconButton>
        <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 'bold', ml: 1 }}>New conversation</Typography>
      </Box>
      {status && <Alert severity={uncertain ? 'warning' : 'error'} sx={{ mb: 2 }}>{status}</Alert>}
      {loading ? <CircularProgress aria-label="Loading people" sx={{ color: '#00D4FF' }} />
        : loadError ? <Box><Alert severity="error">Could not load people. Check your connection and access, then try again.</Alert>
          <Button onClick={() => { void loadPeople(); }}>Try again</Button></Box>
        : !isCurrent() ? null : <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Button variant={!isGroup ? 'contained' : 'outlined'} disabled={disabled} onClick={() => changeMode(false)}
              sx={!isGroup ? { bgcolor: '#00D4FF', color: '#0A0A0A' } : { color: '#00D4FF', borderColor: '#00D4FF' }}>
              <PersonAddAltOutlined sx={{ mr: 1 }} /> Direct
            </Button>
            <Button variant={isGroup ? 'contained' : 'outlined'} disabled={disabled} onClick={() => changeMode(true)}
              sx={isGroup ? { bgcolor: '#00D4FF', color: '#0A0A0A' } : { color: '#00D4FF', borderColor: '#00D4FF' }}>
              <GroupAddOutlined sx={{ mr: 1 }} /> Group
            </Button>
          </Box>
          {isGroup && <TextField fullWidth label="Group Name" value={groupName} disabled={disabled}
            inputProps={{ maxLength: 100 }} onChange={e => changeName(e.target.value)}
            helperText={`Select up to ${MAX_CHAT_RECIPIENTS} people. You are added automatically.`}
            sx={{ mb: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />}
          <TextField fullWidth placeholder="Search employees..." value={searchTerm} disabled={disabled}
            onChange={e => { if (canEdit()) setSearchTerm(e.target.value); }}
            InputProps={{ startAdornment: <Search sx={{ color: '#888', mr: 1 }} /> }}
            sx={{ mb: 2, input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
          <List sx={{ bgcolor: '#1A1A1A', borderRadius: 1, border: '1px solid #333' }}>
            {filtered.length === 0 ? <ListItem><ListItemText primary={users.length ? 'No matching people' : 'No other people available'} sx={{ color: '#888' }} /></ListItem>
              : filtered.map(person => {
                const selected = selectedIds.includes(person.id);
                const name = `${person.first_name} ${person.last_name}`.trim() || 'Unnamed person';
                return <ListItem key={person.id} button disabled={disabled} aria-selected={selected}
                  onClick={() => toggleUser(person.id)} sx={{ borderBottom: '1px solid #222' }}>
                  <ListItemAvatar><Avatar sx={{ bgcolor: '#00D4FF' }}>{name.charAt(0).toUpperCase()}</Avatar></ListItemAvatar>
                  <ListItemText primary={name} secondary={person.role} primaryTypographyProps={{ color: '#FFF' }} secondaryTypographyProps={{ color: '#888' }} />
                  {selected && <Checkbox checked tabIndex={-1} sx={{ color: '#00D4FF' }} />}
                </ListItem>;
              })}
          </List>
          <Button fullWidth variant="contained" onClick={createChat} aria-busy={creating}
            disabled={disabled || selectedIds.length === 0} sx={{ mt: 3, bgcolor: '#00D4FF', color: '#0A0A0A', py: 1.5 }}>
            {creating ? 'Creating conversation…' : isGroup ? `Create Group (${selectedIds.length} people)` : 'Start Chat'}
          </Button>
        </>}
    </Container></Box>
  );
}
