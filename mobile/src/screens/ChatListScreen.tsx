import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { InboxRoom, inboxTitle, inboxPreview, inboxTime, readInboxRooms, searchInbox } from '../utils/chatInbox';

type InboxState = {
  scope: string; request: number; status: 'loading' | 'ready' | 'error'; refreshing: boolean;
  rooms: InboxRoom[]; isSessionCurrent: () => boolean;
};

export default function ChatListScreen() {
  const { t, lang } = useLang();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const focused = useIsFocused();
  const validScope = !!user?.id && !!user.companyId;
  const scope = JSON.stringify([user?.id, user?.companyId, user?.role]);
  const currentScope = useRef<string | null>(null);
  currentScope.current = focused && validScope ? scope : null;
  const focusActive = useRef(false);
  const sequence = useRef(0);
  const navigationLock = useRef(false);
  const [state, setState] = useState<InboxState | null>(null);
  const [search, setSearch] = useState({ scope, value: '' });
  const query = search.scope === scope ? search.value : '';

  const loadRooms = useCallback(async (refreshing = false) => {
    if (!user || !focusActive.current || currentScope.current !== scope) return;
    const request = ++sequence.current;
    const isSessionCurrent = api.captureSessionGuard();
    const current = () => focusActive.current && currentScope.current === scope
      && sequence.current === request && isSessionCurrent();
    navigationLock.current = false;
    // Clear stale previews while rechecking membership, including on failed refresh.
    setState({ scope, request, status: 'loading', refreshing, rooms: [], isSessionCurrent });
    try {
      const response = await api.getChatRooms({ id: user.id, companyId: user.companyId, role: user.role }, current);
      if (!current() || !response.isSessionCurrent()) return;
      const rooms = readInboxRooms(response.data);
      setState({ scope, request, status: 'ready', refreshing: false, rooms, isSessionCurrent: response.isSessionCurrent });
    } catch {
      if (current()) setState({ scope, request, status: 'error', refreshing: false, rooms: [], isSessionCurrent });
    }
  }, [scope, user?.id, user?.companyId, user?.role]);

  useFocusEffect(useCallback(() => {
    focusActive.current = true;
    setSearch({ scope, value: '' });
    void loadRooms();
    return () => {
      focusActive.current = false;
      sequence.current++;
      navigationLock.current = false;
    };
  }, [scope, loadRooms]));

  const visibleState = validScope && focused && state?.scope === scope && state.request === sequence.current
    && state.isSessionCurrent() ? state : null;
  const awaitingFocus = validScope && focused && (!state || state.scope !== scope || state.request !== sequence.current);
  const rooms = searchInbox(visibleState?.rooms || [], query, t);

  const openConversation = (room?: InboxRoom) => {
    if (!focusActive.current || currentScope.current !== scope || state?.scope !== scope
      || state.request !== sequence.current || state.status !== 'ready' || !state.isSessionCurrent()
      || navigationLock.current || (room && !state.rooms.includes(room))) return;
    navigationLock.current = true;
    if (room) navigation.navigate('Chat', { roomId: room.id, roomName: inboxTitle(room, t) });
    else navigation.navigate('NewChat');
  };

  const renderRoom = ({ item }: { item: InboxRoom }) => {
    const title = inboxTitle(item, t);
    const avatar = item.is_group ? item.avatar_url : item.other_user_avatar;
    const time = inboxTime(item.last_message_at, lang);
    return <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Open conversation with {name}', { name: title })}
      style={styles.roomCard} onPress={() => openConversation(item)}>
      {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.is_group ? '#' : title.charAt(0).toUpperCase()}</Text>
      </View>}
      <View style={styles.roomInfo}>
        <View style={styles.roomHeading}>
          <Text numberOfLines={1} style={styles.roomName}>{title}</Text>
          {!!time && <Text style={styles.roomTime}>{time}</Text>}
        </View>
        <Text numberOfLines={1} style={styles.roomSubtitle}>{inboxPreview(item, t)}</Text>
      </View>
    </TouchableOpacity>;
  };

  return <View style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Go back')} style={styles.back} onPress={() => navigation.goBack()}>
        <MaterialIcons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('Messages')}</Text>
    </View>
    {validScope && <View style={styles.searchRow}>
      <MaterialIcons name="search" size={22} color="#AAA" />
      <TextInput accessibilityLabel={t('Search conversations')} placeholder={t('Search conversations')}
        placeholderTextColor="#999" style={styles.searchInput} value={query}
        onChangeText={value => setSearch({ scope, value })} autoCapitalize="none" autoCorrect={false} />
      {!!query && <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Clear search')}
        style={styles.clearSearch} onPress={() => setSearch({ scope, value: '' })}>
        <MaterialIcons name="close" size={22} color="#CCC" />
      </TouchableOpacity>}
    </View>}
    {!validScope ? <Text style={styles.notice}>{t('Sign in to view conversations.')}</Text>
      : awaitingFocus ? <ActivityIndicator accessibilityLabel={t('Loading conversations')} size="large" color="#00D4FF" style={styles.loading} />
      : !visibleState || visibleState.status === 'error' ? <View style={styles.noticeBox}>
        <Text accessibilityRole="alert" style={styles.notice}>{t('Could not load conversations. Check your connection and access, then try again.')}</Text>
        <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => { void loadRooms(); }}>
          <Text style={styles.retryText}>{t('Try again')}</Text>
        </TouchableOpacity>
      </View> : <FlatList data={rooms} renderItem={renderRoom} keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={visibleState.refreshing} onRefresh={() => { void loadRooms(true); }} tintColor="#00D4FF" />}
        ListEmptyComponent={visibleState.status === 'loading'
          ? <ActivityIndicator accessibilityLabel={t('Loading conversations')} size="large" color="#00D4FF" style={styles.loading} />
          : <Text style={styles.notice}>{query.trim() ? t('No conversations match your search') : t('No conversations yet')}</Text>}
      />}
    {visibleState?.status === 'ready' && <TouchableOpacity accessibilityRole="button" style={styles.newChatBtn} onPress={() => openConversation()}>
      <Text style={styles.newChatBtnText}>{t('+ New Chat')}</Text>
    </TouchableOpacity>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  back: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 24, fontWeight: 'bold', marginLeft: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', margin: 16, borderRadius: 12, paddingLeft: 12 },
  searchInput: { flex: 1, color: '#FFF', minHeight: 48, fontSize: 16, paddingHorizontal: 10 },
  clearSearch: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 110, flexGrow: 1 },
  roomCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#00D4FF', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#0A0A0A', fontSize: 20, fontWeight: 'bold' },
  roomInfo: { flex: 1, minWidth: 0 },
  roomHeading: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  roomName: { flexGrow: 1, flexShrink: 1, color: '#FFF', fontSize: 16, fontWeight: '600' },
  roomTime: { color: '#AAA', fontSize: 12 },
  roomSubtitle: { color: '#AAA', fontSize: 14, marginTop: 5 },
  loading: { marginTop: 40 },
  noticeBox: { alignItems: 'center' },
  notice: { color: '#AAA', textAlign: 'center', padding: 20, marginTop: 20, fontSize: 16, lineHeight: 24 },
  retry: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 24, borderRadius: 24, backgroundColor: '#00D4FF' },
  retryText: { color: '#0A0A0A', fontWeight: '600' },
  newChatBtn: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#00D4FF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30, elevation: 5 },
  newChatBtnText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 },
});
