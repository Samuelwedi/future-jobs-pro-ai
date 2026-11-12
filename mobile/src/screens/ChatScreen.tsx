import { useLang } from '../context/LanguageContext';
import MediaAttachment from '../components/MediaAttachment';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Keyboard, Platform, Image, ActivityIndicator, ScrollView,
} from 'react-native';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { API_URL, api } from '../services/api';
import { createChatHistory, emptyHistoryView, HistoryGeneration } from '../utils/chatHistory';
import { chatTextOutbox } from '../services/chatTextOutbox';
import { createChatTextIntent, ChatTextIntent, ChatTextRecord, ChatTextSnapshot, validChatTextReceipt } from '../services/chatTextOutboxStore';
import { useChatViews } from '../hooks/useChatViews';
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
    && typeof message.sender_id === 'string'
    && (message.created_at === null || (typeof message.created_at === 'string' && Number.isFinite(Date.parse(message.created_at))));
}

function mergeMessages(previous: any[], incoming: any[]) {
  const byId = new Map(previous.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) =>
    (a.created_at === null ? (b.created_at === null ? 0 : 1) : b.created_at === null ? -1
      : Date.parse(a.created_at) - Date.parse(b.created_at)) || a.id.localeCompare(b.id));
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
  const denied = useRef(false);
  const roomScopeRevision = useRef(0);
  const authCurrent = useRef(api.captureSessionGuard()).current;
  const isCurrent = () => mounted.current && !denied.current && scopeCurrent() && authCurrent();
  const sessionRef = useRef<ChatSession | null>(null);
  const sendLock = useRef(false);
  const pendingAdmission = useRef<{ intent: ChatTextIntent; revision: number } | null>(null);
  const outboxViewGeneration = useRef(0);
  const [outbox, setOutbox] = useState<ChatTextSnapshot>({ records: [], problems: [] });
  const [outboxProblem, setOutboxProblem] = useState('');
  const [outboxBusy, setOutboxBusy] = useState(false);
  const outboxLock = useRef(false);
  const [outboxLimit, setOutboxLimit] = useState(10);
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
  const nearBottom = useRef(true);
  const scrollAfterLayout = useRef(false);
  const historyRef = useRef<ReturnType<typeof createChatHistory> | null>(null);
  const [history, setHistory] = useState(emptyHistoryView);
  const views = useChatViews({ owner: user, roomId, current: () => isCurrent() && !denied.current,
    session: () => sessionRef.current, rows: messages,
    denied: () => {
      denied.current = true; setMessages([]); setRoom(null); setOutbox({ records: [], problems: [] });
      setReady(false); historyRef.current?.dispose(); socketRef.current?.disconnect();
      setError(t('Conversation access is no longer available. Return to conversations to check access.'));
    },
    refreshHistory: rejected => {
      setMessages(previous => previous.filter(row => !rejected.some(message => message.id === row.id && message.viewVersion === row.view_version)));
      historyRef.current?.refresh('initial', true);
    },
  });

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      if (nearBottom.current) flatListRef.current?.scrollToEnd({ animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let socket: Socket | null = null;
    let disposeSocket = () => {};
    const current = () => active && isCurrent() && !denied.current;
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
        // Initial and manual HTTP reads remain independent of socket availability.
        const historyCurrent = (requestedGeneration: HistoryGeneration) => socketCurrent()
          && (requestedGeneration === 'initial' || requestedGeneration === generation);
        const historyController = createChatHistory({
          read: (page, requestCurrent) => session.readMessages({ ...page, views: !roomId.startsWith('support-ticket-') }, requestCurrent),
          accepted: data => {
            const changed = views.history(data) === true;
            if (changed) {
              roomScopeRevision.current++;
              setMessages([]); setRoom(null);
            }
            return changed;
          },
          current: historyCurrent,
          valid: message => validMessage(message, roomId, user.companyId),
          merge: rows => setMessages(previous => mergeMessages(rows, previous)),
          publish: setHistory,
          failed: cause => {
            views.failed(cause);
            if (socketCurrent()) setError(previous => previous || t("Conversation could not be loaded"));
          },
          recovered: () => setError(previous => previous === t("Conversation could not be loaded") ? '' : previous),
        });
        historyRef.current = historyController;
        const invalidateConnection = () => {
          generation++;
          transportConnected = false;
          historyController.invalidate();
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
              historyController.refresh(joinedGeneration);
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
          // Scroll only after layout and only if the reader was already at the end.
          scrollAfterLayout.current = nearBottom.current;
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
        const roomRequestRevision = roomScopeRevision.current;
        const roomCurrent = () => socketCurrent() && roomScopeRevision.current === roomRequestRevision;
        void session.readRoom(roomCurrent).then(data => {
          if (roomCurrent()) setRoom(data?.room || null);
        }).catch(cause => { if (roomCurrent()) views.failed(cause); });
        historyController.refresh('initial');
      } catch {
        if (current()) setError(t("Conversation could not be loaded"));
      }
    };
    void connect();
    return () => {
      active = false;
      mounted.current = false;
      sessionRef.current = null;
      historyRef.current?.dispose();
      historyRef.current = null;
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

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const generation = ++outboxViewGeneration.current;
      const current = () => active && isCurrent() && generation === outboxViewGeneration.current;
      try {
        const result = await chatTextOutbox.snapshot(user, () => { if (!current()) throw new Error('Conversation changed.'); });
        if (!current()) return;
        setOutbox({ records: result.records.filter(record => record.roomId === roomId),
          problems: result.problems.filter(problem => !problem.roomId || problem.roomId === roomId) });
        const saved = result.records.filter(record => record.roomId === roomId && record.state === 'saved' && validChatTextReceipt(record, record.receipt));
        if (saved.length) setMessages(previous => mergeMessages(previous, saved.map(record => record.receipt.message)));
        setOutboxProblem('');
      } catch { if (current()) setOutboxProblem(t('Saved text could not be loaded. Nothing has been discarded.')); }
    };
    const unsubscribe = chatTextOutbox.subscribe(() => { void refresh(); });
    void refresh();
    return () => { active = false; outboxViewGeneration.current++; unsubscribe(); };
  }, []);

  const recoverText = async (record: ChatTextRecord, mode: 'check' | 'retry' | 'dismiss') => {
    if (outboxLock.current || !isCurrent()) return;
    outboxLock.current = true; setOutboxBusy(true); setOutboxProblem('');
    try {
      if (mode === 'dismiss') await chatTextOutbox.dismiss(record, isCurrent);
      else await chatTextOutbox.retry(record, mode === 'check');
      if (!isCurrent()) return;
      // Clear only the unchanged draft whose original admission was ambiguous.
      // Newer edits (including same words retyped) remain owned by the composer.
      const pending = pendingAdmission.current;
      if (pending?.intent.requestKey === record.requestKey) {
        const snapshot = await chatTextOutbox.snapshot(user, () => { if (!isCurrent()) throw new Error('Conversation changed.'); });
        if (!isCurrent()) return;
        const retained = snapshot.records.find(item => item.requestKey === record.requestKey);
        if (retained && !retained.reason?.startsWith('Local save')) {
          if (draft.current.revision === pending.revision) changeInput('');
          pendingAdmission.current = null;
        }
      }
    } catch (cause: any) {
      if (isCurrent()) setOutboxProblem(t(cause?.message || 'Recovery could not be confirmed. The same request is retained.'));
    } finally { outboxLock.current = false; if (isCurrent()) setOutboxBusy(false); }
  };

  const queueOrdinaryText = async (retryOriginal = false) => {
    const raw = draft.current.text;
    const session = sessionRef.current;
    if ((!retryOriginal && (!raw.trim() || raw.length > 5000)) || (retryOriginal && !pendingAdmission.current) || sendLock.current || !isCurrent() || !session?.isCurrent()) return;
    if (pendingAdmission.current && !retryOriginal) {
      setSendStatus(t('An earlier text needs review. Use Retry saving original text before sending this draft.')); return;
    }
    sendLock.current = true;
    setSending(true); setSendStatus(''); setError('');
    try {
      if (!pendingAdmission.current) pendingAdmission.current = { intent: createChatTextIntent(user, roomId, raw), revision: draft.current.revision };
      const admission = pendingAdmission.current;
      await chatTextOutbox.enqueue(admission.intent, isCurrent);
      if (!isCurrent() || !session.isCurrent()) return;
      if (draft.current.revision === admission.revision) changeInput('');
      pendingAdmission.current = null;
      setSendStatus(t('Queued on this device. It will be saved while the app is open and access is available.'));
    } catch (cause: any) {
      if (isCurrent() && session.isCurrent()) setSendStatus(t(cause?.message || 'Local save not confirmed. Retry the same request; your draft is unchanged.'));
    } finally { sendLock.current = false; if (isCurrent() && session.isCurrent()) setSending(false); }
  };

  // Support has its explicit legacy online path. An ordinary queued request
  // never falls back to this path, even if the server rejects keyed support.
  const sendMessage = async () => {
    if (!roomId.startsWith('support-ticket-')) { await queueOrdinaryText(); return; }
    await sendSupportMessage();
  };

  const sendSupportMessage = async () => {
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
    views.covered(true);
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
      views.covered(false);
      if (isCurrent() && session.isCurrent()) setUploading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMine = item.sender_id === user?.id;
    return (
      <View collapsable={false} ref={view => views.rowRef(item.id, view)} style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        {!isMine && item.sender_avatar && <Image source={{uri:item.sender_avatar}} style={{width:28,height:28,borderRadius:14,marginBottom:5}} />}
        {!isMine && <Text style={styles.sender}>{item.sender_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || t("Team member")}</Text>}
        {item.message?<Text style={styles.message}>{item.message}</Text>:null}
        {item.attachment_id && <MediaAttachment sessionCurrent={isCurrent} onViewerVisibilityChange={visible => views.covered(visible, item.id)} path={`/chat/attachments/${item.attachment_id}/content`} name={item.attachment_name || 'attachment'} mime={item.attachment_type || 'application/octet-stream'}/>}
        <Text style={styles.time}>{item.created_at === null ? t('Time unavailable') : new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
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
      {!roomId.startsWith('support-ticket-') && <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
        <Text accessibilityLiveRegion="polite" style={styles.historyText}>{views.count
          ? t('Messages not marked read: {count}', { count: views.count.unviewedCountCapped ? '99+' : String(views.count.unviewedCount) })
          : t('Read count unavailable')}</Text>
        <Text style={{ color: '#AAA', fontSize: 12 }}>{t('Private to you. Previous views were not recorded.')}</Text>
      </View>}
      {error?<Text style={{color:'#FF718B',paddingHorizontal:16,paddingVertical:8}}>{error}</Text>:null}
      {sendStatus ? <Text accessibilityLiveRegion="polite" style={styles.status}>{sendStatus}</Text> : null}
      {uncertainMessages.length > 0 ? <View style={{ paddingHorizontal: 16 }}>
        <Text style={styles.status}>{t("Send not confirmed. Do not resend these messages: they may already be saved. Nothing will retry automatically.")}</Text>
        {uncertainMessages.map(message => <Text key={message} style={styles.status}>{message}</Text>)}
      </View> : null}
      {pendingAdmission.current ? <View style={{ paddingHorizontal: 16 }}>
        <Text style={styles.status}>{t('Original text awaiting local confirmation:')} {pendingAdmission.current.intent.text}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={sending} onPress={() => void queueOrdinaryText(true)}><Text style={styles.historyText}>{t('Retry saving original text')}</Text></TouchableOpacity>
      </View> : null}
      {outboxProblem ? <Text accessibilityLiveRegion="polite" style={styles.status}>{outboxProblem}</Text> : null}
      {outbox.records.length || outbox.problems.length ? <ScrollView style={{ maxHeight: 190 }} contentContainerStyle={{ paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.historyText}>{t('Text outbox on this device')}</Text>
        {outbox.problems.map(problem => <Text key={problem.storageKey} style={styles.status}>{t(problem.reason)}</Text>)}
        {outbox.records.slice(0, outboxLimit).map(record => <View key={record.requestKey} style={{ paddingVertical: 6 }}>
          <Text style={styles.message}>{record.text}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.status}>{record.state === 'saved' ? t('Saved to conversation. Delivery and reading are not confirmed.')
            : record.state === 'queued' ? t('Queued on this device') : record.state === 'sending' ? t('Sending or awaiting saved-status recovery…')
              : record.state === 'uncertain' ? t('Save not confirmed. Same request retained.') : t('Needs review. Automatic sending paused.')}</Text>
          {record.reason ? <Text style={styles.status}>{record.reason === 'unavailable' ? t('The original saved message is unavailable. This request will not be recreated.')
            : record.reason === 'conflict' ? t('This key conflicts with the saved request. Only status recovery is allowed.') : t(record.reason)}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {record.state === 'saved' ? <><TouchableOpacity accessibilityRole="button" disabled={outboxBusy} onPress={() => void recoverText(record, 'dismiss')}><Text style={styles.historyText}>{t('Dismiss saved receipt')}</Text></TouchableOpacity>
                {record.reason ? <TouchableOpacity accessibilityRole="button" disabled={outboxBusy} onPress={() => void recoverText(record, 'retry')}><Text style={styles.historyText}>{t('Recover local saved receipt')}</Text></TouchableOpacity> : null}</>
              : <>
                <TouchableOpacity accessibilityRole="button" disabled={outboxBusy} onPress={() => void recoverText(record, 'check')}><Text style={styles.historyText}>{t('Check saved status')}</Text></TouchableOpacity>
                {!record.stopPost ? <TouchableOpacity accessibilityRole="button" disabled={outboxBusy} onPress={() => void recoverText(record, 'retry')}><Text style={styles.historyText}>{t('Retry same request')}</Text></TouchableOpacity> : null}
              </>}
          </View>
        </View>)}
        {outbox.records.length > outboxLimit ? <TouchableOpacity accessibilityRole="button" onPress={() => setOutboxLimit(value => value + 10)}><Text style={styles.historyText}>{t('Show more saved requests')}</Text></TouchableOpacity> : null}
      </ScrollView> : null}
      <View style={styles.historyControls}>
        {history.busy ? <ActivityIndicator accessibilityLabel={t("Loading conversation history")} color="#67E8F9" /> : null}
        {history.problem ? <>
          <Text style={styles.status}>{history.problem === 'cursor'
            ? t("History position expired. Refresh to continue; loaded messages will stay visible.")
            : history.problem === 'metadata' ? t("History completeness could not be verified. Refresh to try again.")
              : t("History could not be loaded. Try again.")}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={history.busy} onPress={() => historyRef.current?.retry()} style={styles.historyButton}>
            <Text style={styles.historyText}>{history.problem === 'load' ? t("Retry history") : t("Refresh history")}</Text>
          </TouchableOpacity>
        </> : <>
          {history.gaps > 0 ? <TouchableOpacity accessibilityRole="button" disabled={history.busy} onPress={() => historyRef.current?.continueRecovery()} style={styles.historyButton}>
            <Text style={styles.historyText}>{t("Continue recovering missed messages")}</Text>
          </TouchableOpacity> : null}
          {history.hasOlder ? <TouchableOpacity accessibilityRole="button" disabled={history.busy} onPress={() => historyRef.current?.older()} style={styles.historyButton}>
            <Text style={styles.historyText}>{t("Load older messages")}</Text>
          </TouchableOpacity> : history.hasOlder === false && history.gaps === 0 ? <Text style={styles.historyText}>{t("Beginning of conversation")}</Text> : null}
        </>}
      </View>
      <View ref={views.viewport} collapsable={false} style={{ flex: 1, overflow: 'hidden' }} onLayout={views.layout}>
      <FlatList ref={flatListRef} data={messages} renderItem={renderItem} keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        viewabilityConfig={views.viewabilityConfig} onViewableItemsChanged={views.onViewableItemsChanged}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          views.scroll();
          nearBottom.current = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 48;
          if (!nearBottom.current) scrollAfterLayout.current = false;
        }}
        onContentSizeChange={() => {
          views.layout();
          if (scrollAfterLayout.current && nearBottom.current) flatListRef.current?.scrollToEnd({ animated: true });
          scrollAfterLayout.current = false;
        }}
        onLayout={() => { if (keyboardVisible && nearBottom.current) flatListRef.current?.scrollToEnd({ animated: true }); }} />
      </View>
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
  historyControls: { paddingHorizontal: 16, paddingVertical: 4 },
  historyButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  historyText: { color: '#67E8F9', textAlign: 'center' },
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
