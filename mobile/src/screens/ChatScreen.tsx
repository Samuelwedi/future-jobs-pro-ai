import { useLang } from '../context/LanguageContext';
import MediaAttachment from '../components/MediaAttachment';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Keyboard, Platform, Image, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { API_URL, api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const WS_URL = API_URL.replace(/\/api\/?$/, '');
type ChatSession = Awaited<ReturnType<typeof api.openChatSession>>;
type ChatOwner = { id: string; companyId: string; role: string };

function validMessage(message: any, roomId: string, companyId: string) {
  return message && typeof message.id === 'string' && message.id.length > 0
    && message.room_id === roomId && message.company_id === companyId
    && typeof message.sender_id === 'string' && typeof message.created_at === 'string';
}

function mergeMessages(previous: any[], incoming: any[]) {
  const byId = new Map(previous.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
}

export default function ChatScreen() {
  const route = useRoute<any>();
  const { user } = useAuth();
  const focused = useIsFocused();
  const roomId = typeof route.params?.roomId === 'string' ? route.params.roomId : '';
  const scope = JSON.stringify([user?.id, user?.companyId, user?.role, roomId]);
  const currentScope = useRef(scope);
  currentScope.current = focused ? scope : '';
  if (!user || !roomId || !focused) return null;
  return <OwnedChat key={scope} user={user} roomId={roomId} roomName={route.params?.roomName}
    scopeCurrent={() => currentScope.current === scope} />;
}

function OwnedChat({ user, roomId, roomName, scopeCurrent }: {
  user: ChatOwner; roomId: string; roomName?: string; scopeCurrent: () => boolean;
}) {
  const { t } = useLang();
  const safeInsets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const mounted = useRef(true);
  const authCurrent = useRef(api.captureSessionGuard()).current;
  const isCurrent = () => mounted.current && scopeCurrent() && authCurrent();
  const sessionRef = useRef<ChatSession | null>(null);
  const sendLock = useRef(false);
  const mediaLock = useRef(false);
  const mediaUncertainRef = useRef(false);
  const draft = useRef({ text: '', revision: 0 });
  const uncertainTexts = useRef(new Set<string>());
  const [uncertainMessages, setUncertainMessages] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const [mediaUncertain, setMediaUncertain] = useState(false);
  const [room,setRoom]=useState<any>(null);
  const [uploading,setUploading]=useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let socket: Socket | null = null;
    let disposeSocket = () => {};
    const current = () => active && isCurrent();
    const connect = async () => {
      try {
        const session = await api.openChatSession(roomId, user, current);
        if (!current() || !session.isCurrent()) return;
        sessionRef.current = session;
        setReady(true);
        socket = io(WS_URL, { transports: ['websocket'], auth: { token: session.token } });
        socketRef.current = socket;
        const socketCurrent = () => current() && session.isCurrent();
        let generation = 0;
        let transportConnected = false;
        let historyReading = false;
        type HistoryGeneration = number | 'initial';
        let pendingHistory: HistoryGeneration | null = null;
        // HTTP history is independently authenticated. A socket failure or denied
        // join must not discard the initial fallback for this current session.
        const historyCurrent = (requestedGeneration: HistoryGeneration) => socketCurrent()
          && (requestedGeneration === 'initial' || requestedGeneration === generation);
        // Keep the initial HTTP fallback, then reconcile after each authorized
        // join. Only one read runs at a time; reconnect bursts retain just the
        // newest request. Post-join reads cannot publish for a disconnected generation.
        const readHistory = async (requestedGeneration: HistoryGeneration) => {
          if (!historyCurrent(requestedGeneration)) return;
          pendingHistory = requestedGeneration;
          if (historyReading) return;
          historyReading = true;
          try {
            while (pendingHistory !== null && socketCurrent()) {
              const readingGeneration: HistoryGeneration = pendingHistory;
              pendingHistory = null;
              try {
                const data = await session.readMessages();
                if (!historyCurrent(readingGeneration)) continue;
                if (!Array.isArray(data?.messages) || data.messages.some((message: any) => !validMessage(message, roomId, user.companyId))) {
                  throw new Error('Invalid conversation response');
                }
                // Keep socket/HTTP messages received while this snapshot was pending.
                setMessages(previous => mergeMessages(data.messages, previous));
                setError(previous => previous === t("Conversation could not be loaded") ? '' : previous);
              } catch {
                if (historyCurrent(readingGeneration)) setError(previous => previous || t("Conversation could not be loaded"));
              }
            }
          } finally {
            historyReading = false;
          }
        };
        const invalidateConnection = () => {
          generation++;
          transportConnected = false;
          pendingHistory = null;
        };
        const onConnect = () => {
          if (!socketCurrent()) { socket?.disconnect(); return; }
          if (transportConnected) return;
          transportConnected = true;
          const joinedGeneration = ++generation;
          let acknowledged = false;
          socket?.emit('join-room', roomId, (result: any) => {
            if (acknowledged || !transportConnected || !historyCurrent(joinedGeneration)) return;
            acknowledged = true;
            if (result?.success !== true) setError(previous => previous || t("Could not join conversation"));
            else {
              setConnected(true);
              setError(previous => previous === t("Could not join conversation") || previous === t("Message connection failed") ? '' : previous);
              void readHistory(joinedGeneration);
            }
          });
        };
        const onDisconnect = () => {
          invalidateConnection();
          if (socketCurrent()) setConnected(false);
        };
        const onConnectError = () => {
          invalidateConnection();
          if (socketCurrent()) {
            setConnected(false);
            setError(previous => previous || t("Message connection failed"));
          }
        };
        const onMessage = (message: any) => {
          if (!socketCurrent() || !transportConnected || !validMessage(message, roomId, user.companyId)) return;
          setMessages(previous => mergeMessages(previous, [message]));
          flatListRef.current?.scrollToEnd({ animated: true });
        };
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        socket.on('new-message', onMessage);
        disposeSocket = () => {
          invalidateConnection();
          socket?.off('connect', onConnect);
          socket?.off('disconnect', onDisconnect);
          socket?.off('connect_error', onConnectError);
          socket?.off('new-message', onMessage);
        };
        void session.readRoom().then(data => {
          if (socketCurrent()) setRoom(data?.room || null);
        }).catch(() => {});
        void readHistory('initial');
      } catch {
        if (current()) setError(t("Conversation could not be loaded"));
      }
    };
    void connect();
    return () => {
      active = false;
      mounted.current = false;
      sessionRef.current = null;
      disposeSocket();
      if (socketRef.current === socket) socketRef.current = null;
      socket?.emit('leave-room', roomId);
      socket?.disconnect();
    };
  }, []);

  const changeInput = (text: string) => {
    draft.current = { text, revision: draft.current.revision + 1 };
    setInput(text);
  };

  const sendMessage = async () => {
    const message = draft.current.text.trim();
    const session = sessionRef.current;
    if (!message || message.length > 5000 || sendLock.current || uncertainTexts.current.has(message)
      || !isCurrent() || !session?.isCurrent()) return;
    sendLock.current = true;
    const revision = draft.current.revision;
    setSending(true);
    setSendStatus(t("Sending…"));
    setError('');
    try {
      const result = await session.sendMessage(message);
      if (!isCurrent() || !session.isCurrent()) return;
      if (result?.success !== true || !validMessage(result.message, roomId, user.companyId)
        || result.message.sender_id !== user.id || result.message.message !== message) {
        throw Object.assign(new Error('Invalid acknowledgement'), { code: 'CHAT_UNCERTAIN' });
      }
      setMessages(previous => mergeMessages(previous, [result.message]));
      setSendStatus(t("Saved to conversation"));
      // Keep anything typed while the request was pending, even if it was changed
      // back to the same words. React state alone is not a synchronous tap lock.
      if (draft.current.revision === revision) changeInput('');
    } catch (cause: any) {
      if (!isCurrent() || !session.isCurrent()) return;
      if (cause?.code === 'CHAT_NOT_SENT') {
        setSendStatus(t("Not sent. Your draft is unchanged. Nothing was queued."));
      } else {
        uncertainTexts.current.add(message);
        setUncertainMessages(Array.from(uncertainTexts.current));
        setSendStatus('');
      }
    } finally {
      sendLock.current = false;
      if (isCurrent() && session.isCurrent()) setSending(false);
    }
  };

  const uploadAttachment = async (asset: { uri: string; name: string; mimeType?: string; size?: number }, session: ChatSession) => {
    if (!isCurrent() || !session.isCurrent()) return;
    if (asset.size && asset.size > 25 * 1024 * 1024) {
      setError(t("Choose a file smaller than 25 MB"));
      return;
    }
    const result = await session.upload('attachments', asset);
    if (!isCurrent() || !session.isCurrent()) return;
    if (result?.success !== true || !validMessage(result.message, roomId, user.companyId)
      || result.message.sender_id !== user.id || typeof result.message.attachment_id !== 'string'
      || !result.message.attachment_id) throw new Error('Invalid upload acknowledgement');
    setMessages(previous => mergeMessages(previous, [result.message]));
  };

  const chooseAttachment = async (kind: 'file' | 'media' | 'photo') => {
    const session = sessionRef.current;
    if (mediaLock.current || mediaUncertainRef.current || !isCurrent() || !session?.isCurrent()) return;
    mediaLock.current = true;
    setUploading(true);
    setError('');
    let attempted = false;
    try {
      if (kind === 'file') {
        const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'text/csv'], copyToCacheDirectory: true });
        if (!isCurrent() || !session.isCurrent() || result.canceled) return;
        attempted = true;
        await uploadAttachment(result.assets[0], session);
      } else {
        if (kind === 'photo' && !room?.can_edit_photo) return;
        const result = await ImagePicker.launchImageLibraryAsync(kind === 'photo'
          ? { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 }
          : { mediaTypes: ['images', 'videos'], quality: 0.8 });
        if (!isCurrent() || !session.isCurrent() || result.canceled) return;
        const asset = result.assets[0];
        if (asset.type === 'video') {
          attempted = true;
          await uploadAttachment({ uri: asset.uri, name: asset.fileName || 'video.mp4', mimeType: asset.mimeType || 'video/mp4', size: asset.fileSize }, session);
        } else {
          const photo = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: kind === 'photo' ? 512 : Math.min(asset.width || 1920, 1920) } }], { compress: .85, format: ImageManipulator.SaveFormat.JPEG });
          if (!isCurrent() || !session.isCurrent()) return;
          attempted = true;
          if (kind === 'photo') {
            const result = await session.upload('photo', { uri: photo.uri, name: 'photo.jpg', mimeType: 'image/jpeg' });
            if (!isCurrent() || !session.isCurrent()) return;
            if (result?.success !== true || typeof result.avatar_url !== 'string' || !result.avatar_url) throw new Error('Invalid photo acknowledgement');
            setRoom((previous: any) => ({ ...previous, avatar_url: result.avatar_url }));
          } else await uploadAttachment({ uri: photo.uri, name: 'photo.jpg', mimeType: 'image/jpeg' }, session);
        }
      }
    } catch (cause: any) {
      if (!isCurrent() || !session.isCurrent()) return;
      if (!attempted) setError(t("Could not choose media"));
      else if (cause?.code === 'CHAT_NOT_SENT') setError(t("Not sent. Nothing was queued. Check your connection and access."));
      else {
        mediaUncertainRef.current = true;
        setMediaUncertain(true);
        setError(t("Upload not confirmed. Check the conversation or group photo before uploading again. Nothing will retry automatically."));
      }
    } finally {
      mediaLock.current = false;
      if (isCurrent() && session.isCurrent()) setUploading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMine = item.sender_id === user?.id;
    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        {!isMine && item.sender_avatar && <Image source={{uri:item.sender_avatar}} style={{width:28,height:28,borderRadius:14,marginBottom:5}} />}
        {!isMine && <Text style={styles.sender}>{item.sender_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || t("Team member")}</Text>}
        {item.message?<Text style={styles.message}>{item.message}</Text>:null}
        {item.attachment_id && <MediaAttachment sessionCurrent={isCurrent} path={`/chat/attachments/${item.attachment_id}/content`} name={item.attachment_name || 'attachment'} mime={item.attachment_type || 'application/octet-stream'}/>}
        <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView keyboardVerticalOffset={0} style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: safeInsets.top + 16 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{flex:1,marginLeft:16}}><Text style={styles.headerTitle}>{roomName || 'Chat'}</Text><Text style={{color:connected?'#55D66B':'#FFB020',fontSize:11}}>{connected?'LIVE':'RECONNECTING'}</Text></View>
        {(room?.avatar_url||room?.other_user_avatar)?<Image source={{uri:room.avatar_url||room.other_user_avatar}} style={{width:40,height:40,borderRadius:20}}/>:null}
        {room?.can_edit_photo && <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Change group photo")} disabled={!ready || uploading || mediaUncertain} onPress={() => void chooseAttachment('photo')}><MaterialIcons name="add-a-photo" size={24} color="#67E8F9" /></TouchableOpacity>}
      </View>
      {error?<Text style={{color:'#FF718B',paddingHorizontal:16,paddingVertical:8}}>{error}</Text>:null}
      {sendStatus ? <Text accessibilityLiveRegion="polite" style={styles.status}>{sendStatus}</Text> : null}
      {uncertainMessages.length > 0 ? <View style={{ paddingHorizontal: 16 }}>
        <Text style={styles.status}>{t("Send not confirmed. Do not resend these messages: they may already be saved. Nothing will retry automatically.")}</Text>
        {uncertainMessages.map(message => <Text key={message} style={styles.status}>{message}</Text>)}
      </View> : null}
      <FlatList ref={flatListRef} data={messages} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onLayout={() => { if (keyboardVisible) flatListRef.current?.scrollToEnd({ animated: true }); }} />
      {uploading && <ActivityIndicator color="#00D4FF" />}
      <View style={[styles.inputBar, { paddingBottom: keyboardVisible ? 12 : Math.max(12, safeInsets.bottom) }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Attach document")} disabled={!ready || uploading || mediaUncertain} onPress={() => void chooseAttachment('file')} style={{padding:8}}><MaterialIcons name="attach-file" size={24} color="#67E8F9" /></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Attach photo or video")} disabled={!ready || uploading || mediaUncertain} onPress={() => void chooseAttachment('media')} style={{padding:8}}><MaterialIcons name="photo-library" size={24} color="#67E8F9" /></TouchableOpacity>
        <TextInput style={styles.textInput} value={input} onChangeText={changeInput} maxLength={5000} placeholder={t("Message...")} placeholderTextColor="#888" />
        <TouchableOpacity style={[styles.sendBtn,(!ready || !input.trim() || sending || uncertainTexts.current.has(input.trim()))&&{opacity:.5}]} disabled={!ready || !input.trim() || sending || uncertainTexts.current.has(input.trim())} onPress={sendMessage}>
          <Text style={styles.sendText}>{sending ? t('Sending…') : t('Send')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  status: { color: '#FFB020', paddingHorizontal: 16, paddingVertical: 6 },
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
  listContent: { padding: 16 },
  bubble: { maxWidth: '80%', marginBottom: 12, padding: 12, borderRadius: 12 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: '#1A1A1A' },
  sender: { color: '#00D4FF', fontSize: 12, marginBottom: 4 },
  message: { color: '#FFF', fontSize: 15 },
  time: { color: '#888', fontSize: 10, marginTop: 4, textAlign: 'right' },
  inputBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#333', alignItems: 'center' },
  textInput: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF', marginRight: 10 },
  sendBtn: { backgroundColor: '#00D4FF', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  sendText: { color: '#0A0A0A', fontWeight: '600' },
});
