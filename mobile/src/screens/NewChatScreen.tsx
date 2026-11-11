import { useLang } from '../context/LanguageContext';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

type ChatOwner = { id: string; companyId: string; role: string };
type ChatPerson = { id: string; first_name: string; last_name: string; role: string };
type CreationSession = Awaited<ReturnType<typeof api.openChatCreationSession>>;

function readPeople(data: any, ownerId: string): ChatPerson[] {
  if (data?.success !== true || !Array.isArray(data.users)) throw new Error('Invalid people response');
  const ids = new Set<string>();
  return data.users.map((person: any) => {
    if (!person || typeof person.id !== 'string' || !person.id.trim() || ids.has(person.id)) {
      throw new Error('Invalid person');
    }
    ids.add(person.id);
    // Keep only the fields this picker needs. Optional names can be absent in
    // older company accounts; they must not crash the selection screen.
    return { id: person.id, first_name: typeof person.first_name === 'string' ? person.first_name : '',
      last_name: typeof person.last_name === 'string' ? person.last_name : '',
      role: typeof person.role === 'string' ? person.role : '' };
  }).filter((person: ChatPerson) => person.id !== ownerId);
}

export default function NewChatScreen() {
  const { user } = useAuth();
  const focused = useIsFocused();
  const scope = JSON.stringify([user?.id, user?.companyId, user?.role]);
  const currentScope = useRef(scope);
  currentScope.current = focused ? scope : '';
  if (!user?.id || !user.companyId || !focused) return null;
  return <OwnedNewChat key={scope} user={user} scopeCurrent={() => currentScope.current === scope} />;
}

function OwnedNewChat({ user, scopeCurrent }: { user: ChatOwner; scopeCurrent: () => boolean }) {
  const { t } = useLang();
  const navigation = useNavigation<any>();
  const mounted = useRef(true);
  const leaving = useRef(false);
  const authCurrent = useRef(api.captureSessionGuard()).current;
  const isCurrent = () => mounted.current && !leaving.current && scopeCurrent() && authCurrent();
  const sessionRef = useRef<CreationSession | null>(null);
  const loadSequence = useRef(0);
  const createLock = useRef(false);
  const uncertainRef = useRef(false);
  const draft = useRef({ isGroup: false, groupName: '', selectedIds: [] as string[] });
  const peopleRef = useRef<ChatPerson[]>([]);
  const [users, setUsers] = useState<ChatPerson[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [status, setStatus] = useState('');

  const loadPeople = async () => {
    if (!isCurrent() || createLock.current || uncertainRef.current) return;
    const sequence = ++loadSequence.current;
    const current = () => isCurrent() && loadSequence.current === sequence;
    sessionRef.current = null;
    peopleRef.current = [];
    draft.current.selectedIds = [];
    setUsers([]);
    setSelectedIds([]);
    setLoading(true);
    setLoadError(false);
    try {
      const session = await api.openChatCreationSession(user, current);
      if (!current() || !session.isCurrent()) return;
      const data = await session.readUsers();
      if (!current() || !session.isCurrent()) return;
      const people = readPeople(data, user.id);
      peopleRef.current = people;
      setUsers(people);
      sessionRef.current = session;
    } catch {
      if (current()) setLoadError(true);
    } finally {
      if (current()) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    // Native events can arrive before useIsFocused rerenders the parent.
    const stop = () => { leaving.current = true; };
    const removeBlur = navigation.addListener('blur', stop);
    const removeBeforeRemove = navigation.addListener('beforeRemove', stop);
    void loadPeople();
    return () => {
      mounted.current = false;
      loadSequence.current++;
      sessionRef.current = null;
      removeBlur();
      removeBeforeRemove();
    };
  }, []);

  const canEdit = () => isCurrent() && !!sessionRef.current?.isCurrent() && !createLock.current && !uncertainRef.current;
  const toggleUser = (id: string) => {
    if (!canEdit() || !peopleRef.current.some(person => person.id === id)) return;
    const previous = draft.current.selectedIds;
    const selected = draft.current.isGroup
      ? previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
      : previous.includes(id) ? [] : [id];
    draft.current.selectedIds = selected;
    setSelectedIds(selected);
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
  };
  const goBack = () => {
    if (leaving.current) return;
    leaving.current = true;
    navigation.goBack();
  };

  const createChat = async () => {
    const session = sessionRef.current;
    if (!canEdit() || !session) return;
    // A retained handler must use the current draft, not an earlier render's
    // recipient/name. Snapshot it only once the synchronous lock is available.
    const { isGroup, groupName } = draft.current;
    const memberIds = [...draft.current.selectedIds];
    if (!memberIds.length || memberIds.some(id => !peopleRef.current.some(person => person.id === id))) {
      return Alert.alert(t('Select at least one person'));
    }
    const name = groupName.trim();
    if (isGroup && !name) return Alert.alert(t('Enter a group name'));
    if (isGroup && name.length > 100) return Alert.alert(t('Group name must be 100 characters or fewer'));
    const otherUser = peopleRef.current.find(person => person.id === memberIds[0]);
    const roomName = isGroup ? name : `${otherUser?.first_name || ''} ${otherUser?.last_name || ''}`.trim() || t('Chat');
    createLock.current = true;
    setCreating(true);
    setStatus('');
    let navigating = false;
    try {
      const result = isGroup ? await session.createGroup(name, memberIds) : await session.createDirect(memberIds[0]);
      if (!isCurrent() || !session.isCurrent()) return;
      const validRoom = typeof result?.roomId === 'string' && (isGroup
        ? /^group-[0-9]+-[a-z0-9]{1,6}$/.test(result.roomId)
        : result.roomId === [user.id, memberIds[0]].sort().join('-'));
      if (result?.success !== true || !validRoom) throw new Error('Unconfirmed creation');
      // Keep the same-turn lock until navigation removes this view.
      navigating = true;
      navigation.replace('Chat', { roomId: result.roomId, roomName });
    } catch (error: any) {
      if (!isCurrent() || !session.isCurrent()) return;
      if (error?.code === 'CHAT_NOT_SENT') {
        setStatus(t('Chat was not created. Nothing was queued. Check your connection and access, then try again.'));
      } else {
        uncertainRef.current = true;
        setUncertain(true);
        setStatus(t('Creation not confirmed. It may already exist. Go back and check your conversations before trying again.'));
      }
    } finally {
      if (!navigating) createLock.current = false;
      if (isCurrent() && session.isCurrent() && !navigating) setCreating(false);
    }
  };

  const disabled = loading || loadError || creating || uncertain || !isCurrent();
  const renderUser = ({ item }: { item: ChatPerson }) => {
    const isSelected = selectedIds.includes(item.id);
    const name = `${item.first_name} ${item.last_name}`.trim() || t('Unnamed person');
    return (
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: isSelected, disabled }} disabled={disabled}
        style={[styles.userRow, isSelected && styles.userRowSelected]} onPress={() => toggleUser(item.id)}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{name}</Text>
          <Text style={styles.userRole}>{item.role}</Text>
        </View>
        {isSelected && <Text style={styles.check}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Go back')} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={goBack}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('New Chat')}</Text>
        <View style={{ width: 24 }} />
      </View>
      {!isCurrent() ? <Text accessibilityRole="alert" style={styles.notice}>{t('Your session changed. Go back and reopen New Chat.')}</Text>
        : loading ? <ActivityIndicator accessibilityLabel={t('Loading people')} size="large" color="#00D4FF" style={styles.loading} />
        : loadError ? <View>
          <Text accessibilityRole="alert" style={styles.notice}>{t('Could not load people. Check your connection and access, then try again.')}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => { void loadPeople(); }}><Text style={styles.createBtnText}>{t('Try again')}</Text></TouchableOpacity>
        </View> : <>
          <View style={styles.toggleRow}>
            <TouchableOpacity disabled={disabled} onPress={() => changeMode(false)} style={[styles.toggle, !isGroup && styles.toggleActive]}>
              <Text style={[styles.toggleText, !isGroup && styles.toggleTextActive]}>{t('Direct')}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={disabled} onPress={() => changeMode(true)} style={[styles.toggle, isGroup && styles.toggleActive]}>
              <Text style={[styles.toggleText, isGroup && styles.toggleTextActive]}>{t('Group')}</Text>
            </TouchableOpacity>
          </View>
          {isGroup && <TextInput editable={!disabled} maxLength={100} accessibilityLabel={t('Group name')} style={styles.groupNameInput} placeholder={t('Group name')} placeholderTextColor="#888" value={groupName} onChangeText={changeName} />}
          {!!status && <Text accessibilityRole="alert" style={styles.notice}>{status}</Text>}
          <FlatList data={users} renderItem={renderUser} keyExtractor={item => item.id} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.notice}>{t('No other people available')}</Text>} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={isGroup ? t('Create Group') : t('Start Chat')}
            accessibilityState={{ disabled, busy: creating }} disabled={disabled} style={[styles.createBtn, disabled && styles.disabled]} onPress={createChat}>
            {creating ? <ActivityIndicator accessibilityLabel={t('Creating conversation')} color="#0A0A0A" /> : <Text style={styles.createBtnText}>{isGroup ? t('Create Group') : t('Start Chat')}</Text>}
          </TouchableOpacity>
        </>}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 40 },
  notice: { color: '#CCC', fontSize: 15, lineHeight: 22, paddingHorizontal: 20, paddingVertical: 12 },
  retry: { alignSelf: 'center', backgroundColor: '#00D4FF', padding: 14, borderRadius: 12 },
  disabled: { opacity: 0.5 },
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 24, fontWeight: 'bold', marginLeft: 16 },
  toggleRow: { flexDirection: 'row', padding: 16, justifyContent: 'center', gap: 12 },
  toggle: { paddingHorizontal: 28, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: '#888' },
  toggleActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  toggleText: { color: '#888', fontSize: 14, fontWeight: '500' },
  toggleTextActive: { color: '#0A0A0A', fontWeight: '600' },
  groupNameInput: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14, color: '#FFF', marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
  userRowSelected: { backgroundColor: '#1A3A4A', borderRadius: 12, paddingHorizontal: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00D4FF', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#0A0A0A', fontSize: 18, fontWeight: 'bold' },
  userInfo: { flex: 1 },
  userName: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  userRole: { color: '#888', fontSize: 12, marginTop: 2 },
  check: { color: '#00D4FF', fontSize: 20, fontWeight: 'bold' },
  createBtn: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: '#00D4FF', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  createBtnText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 },
});