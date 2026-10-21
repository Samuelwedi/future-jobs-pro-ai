import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  DeviceEventEmitter, AppState,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

interface Message {
  text: string;
  isUser: boolean;
  approvalId?: string;
  actionType?: string;
  actions?: ActionReceipt[];
}

interface ActionReceipt {
  type: string;
  title: string;
  status: 'completed' | 'information' | 'pending' | 'failed';
  summary: string;
  details: Array<{ label: string; value: string | number }>;
}

export default function AIAssistantScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hi! I'm Lucy. I can schedule, run payroll, and generate reports. Try me!", isUser: false },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [conversationActive, setConversationActive] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isSpeaking = useRef(false);
  const finishingRecording = useRef(false);
  const heardSpeech = useRef(false);
  const silenceStartedAt = useRef<number | null>(null);
  const maximumRecordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationActiveRef = useRef(false);
  const consecutiveMisses = useRef(0);
  const active = useRef(true);
  const generation = useRef(0);
  const recorder = useRef<Audio.Recording | null>(null);
  const startingRecording = useRef(false);
  const current = (epoch: number) => active.current && generation.current === epoch;

  useEffect(() => {
    const leave = () => {
      active.current = false;
      generation.current += 1;
      conversationActiveRef.current = false;
      for (const timer of [followUpTimer, conversationTimer, maximumRecordingTimer]) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
      }
      isSpeaking.current = false;
      void Speech.stop().catch(() => {});
      const pending = recorder.current;
      recorder.current = null;
      if (pending) {
        pending.setOnRecordingStatusUpdate(null);
        void pending.stopAndUnloadAsync().catch(() => {});
      }
      DeviceEventEmitter.emit('lucyConversationEnded');
    };
    const enter = () => {
      active.current = true;
      setRecording(null);
      setIsRecording(false);
      setLoading(false);
      setConversationActive(false);
      setVoiceStatus('');
    };
    const blur = navigation.addListener('blur', leave);
    const focus = navigation.addListener('focus', enter);
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') leave();
      else if (navigation.isFocused()) enter();
    });
    return () => { blur(); focus(); appState.remove(); leave(); };
  }, [navigation]);

  const setConversation = (active: boolean) => {
    if (!current(generation.current)) return;
    conversationActiveRef.current = active;
    setConversationActive(active);
    if (conversationTimer.current) clearTimeout(conversationTimer.current);
    if (active) conversationTimer.current = setTimeout(() => {
      conversationActiveRef.current = false;
      setConversationActive(false);
      setVoiceStatus('Conversation ended • Say “Hey Lucy” to begin again');
    }, 60000);
  };

  const queueFollowUp = (delay = 550) => {
    if (!conversationActiveRef.current) return;
    if (followUpTimer.current) clearTimeout(followUpTimer.current);
    followUpTimer.current = setTimeout(() => {
      if (conversationActiveRef.current && !isSpeaking.current && !finishingRecording.current) void startRecording();
    }, delay);
  };

  // Auto-record from Home screen
  useEffect(() => {
    if (route.params?.autoRecord) {
      let cancelled = false;
      const epoch = generation.current;
      const beginWakeConversation = async () => {
        if (cancelled || !current(epoch)) return;
        setConversation(true);
        const greeting = "I'm here. What would you like me to take care of?";
        setMessages(prev => [...prev, { text: greeting, isUser: false }]);
        await speakText(greeting);
        if (!cancelled && current(epoch)) queueFollowUp(350);
      };
      const timer = setTimeout(() => void beginWakeConversation(), 900);
      return () => { cancelled = true; clearTimeout(timer); };
    }
  }, [route.params?.autoRecord, route.params?.wakeEvent]);

  // Load conversation history
  useEffect(() => {
    if (!user) return;
    api.get('/lucy/history')
      .then((data: any) => {
        if (active.current && data.messages) {
          const history = data.messages.map((m: any) => ({
            text: m.content,
            isUser: m.role === 'user',
          }));
          setMessages(prev => [...prev, ...history]);
        }
      })
      .catch(() => {});
  }, [user]);

  // Speak Lucy's response
  const speakText = async (text: string): Promise<void> => {
    const epoch = generation.current;
    if (!current(epoch)) return;
    try {
    if (isSpeaking.current) await Speech.stop();
    if (!current(epoch)) return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
    if (!current(epoch)) return;
    const preferred = voices.find(voice =>
      /samantha|zira|ava|victoria|female|serena|karen/i.test(`${voice.name} ${voice.identifier}`)
      && /^en/i.test(voice.language)
    ) || voices.find(voice => /^en/i.test(voice.language));
    isSpeaking.current = true;
    const spokenText = text.replace(/[*_#`>-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1800);
    await new Promise<void>(resolve => Speech.speak(spokenText, {
      language: 'en-US',
      voice: preferred?.identifier,
      pitch: 1.0,
      rate: 0.9,
      onDone: () => { isSpeaking.current = false; resolve(); },
      onStopped: () => { isSpeaking.current = false; resolve(); },
      onError: () => { isSpeaking.current = false; resolve(); },
    }));
    } catch {
      // Speech is optional: native audio failures must not reject UI handlers.
      if (current(epoch)) isSpeaking.current = false;
    }
  };

  const sendMessage = async (text: string, fromVoice = false) => {
    const epoch = generation.current;
    if (!text.trim() || !current(epoch)) return;
    setMessages(prev => [...prev, { text: text.trim(), isUser: true }]);
    setLoading(true);
    try {
      const data = await api.post<any>('/lucy-v2', { message: text.trim(), conversationMode: conversationActiveRef.current });
      if (!current(epoch)) return;
      const botText = data?.text || data?.[0]?.text || "I'm not sure how to respond to that.";
      const approvalId = data?.approvalId || null;
      const actions: ActionReceipt[] = Array.isArray(data?.actions) ? data.actions : [];
      if (!data?.ignored) setMessages(prev => [...prev, { text: botText, isUser: false, approvalId, actions }]);
      consecutiveMisses.current = 0;
      if (conversationActiveRef.current) setConversation(true);
      if (!data?.ignored && botText) await speakText(approvalId ? `${botText} Please approve or reject the protected action on screen.` : botText);
      if (!current(epoch)) return;
      if (fromVoice && data?.continueListening !== false && !approvalId && conversationActiveRef.current) queueFollowUp();
      else if (approvalId) setVoiceStatus('Waiting for your approval');
    } catch (err: any) {
      if (!current(epoch)) return;
      const errorMsg = 'Sorry, Lucy is taking a break.';
      setMessages(prev => [...prev, { text: errorMsg, isUser: false }]);
      await speakText(errorMsg);
      if (current(epoch) && fromVoice && conversationActiveRef.current) queueFollowUp(900);
    } finally {
      if (current(epoch)) setLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  // ----- Voice Recording with higher gain -----
  const finishRecording = async (activeRecording: Audio.Recording | null) => {
    const epoch = generation.current;
    if (!current(epoch) || !activeRecording || finishingRecording.current) return;
    finishingRecording.current = true;
    if (maximumRecordingTimer.current) clearTimeout(maximumRecordingTimer.current);
    setIsRecording(false);
    setVoiceStatus('Processing your request…');
    try {
      activeRecording.setOnRecordingStatusUpdate(null);
      recorder.current = null;
      await activeRecording.stopAndUnloadAsync();
      if (!current(epoch)) return;
      const uri = activeRecording.getURI();
      setRecording(null);
      if (!uri) throw new Error('Recording file was not created');
      const transcript = await transcribeAudio(uri);
      if (!current(epoch)) return;
      const endConversation = /^(thanks|thank you|that's all|that is all|goodbye|stop listening|cancel)$/i.test(transcript.trim());
      if (endConversation) {
        setConversation(false);
        const closing = 'Of course. I’ll be here when you need me.';
        setMessages(prev => [...prev, { text: closing, isUser: false }]);
        await speakText(closing);
      } else if (transcript) {
        setConversation(true);
        await sendMessage(transcript, true);
      } else if (conversationActiveRef.current) {
        consecutiveMisses.current += 1;
        if (consecutiveMisses.current < 2) {
          setVoiceStatus('Still listening…');
          queueFollowUp(500);
        } else {
          setConversation(false);
          setVoiceStatus('Conversation paused • Say “Hey Lucy” when ready');
        }
      }
    } catch (err) {
      if (current(epoch)) Alert.alert('Error', 'Failed to process recording.');
    } finally {
      finishingRecording.current = false;
      heardSpeech.current = false;
      silenceStartedAt.current = null;
      if (current(epoch)) setVoiceStatus('');
    }
  };

  const startRecording = async () => {
    const epoch = generation.current;
    if (!current(epoch) || startingRecording.current || recorder.current) return;
    startingRecording.current = true;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!current(epoch)) return;
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please grant microphone access.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      if (!current(epoch)) return;

      // Higher gain for better sensitivity
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          inputGain: 25,  // louder
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          inputGain: 25,
        },
      };
      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      if (!current(epoch)) {
        await recording.stopAndUnloadAsync().catch(() => {});
        return;
      }
      recorder.current = recording;
      setRecording(recording);
      setIsRecording(true);
      setVoiceStatus('Listening… speak now');
      heardSpeech.current = false;
      silenceStartedAt.current = null;
      recording.setProgressUpdateInterval(150);
      recording.setOnRecordingStatusUpdate(status => {
        if (!status.isRecording || typeof status.metering !== 'number') return;
        if (status.metering > -42) {
          heardSpeech.current = true;
          silenceStartedAt.current = null;
        } else if (heardSpeech.current) {
          silenceStartedAt.current ??= Date.now();
          if (Date.now() - silenceStartedAt.current > 1800) void finishRecording(recording);
        }
      });
      maximumRecordingTimer.current = setTimeout(() => void finishRecording(recording), 15000);
    } catch (err) {
      if (current(epoch)) Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    } finally {
      startingRecording.current = false;
    }
  };

  const stopRecording = async () => {
    await finishRecording(recording);
  };

  const transcribeAudio = async (uri: string): Promise<string> => {
    const epoch = generation.current;
    try {
      const response = await api.uploadFileWithData<{ transcript: string }>(
        '/voice/assistant-transcribe',
        uri,
        { userId: user?.id || '', projectId: '00000000-0000-0000-0000-000000000000' },
        'audio'
      );
      return response.transcript || '';
    } catch (err: any) {
      if (!current(epoch)) return '';
      console.error('Transcription error:', err);
      if (err.response?.status === 422) {
        return '';
      } else if (err.response?.status === 500) {
        Alert.alert('Server Error', 'Voice processing failed. Please try again later.');
      } else {
        Alert.alert('Error', 'Failed to transcribe audio.');
      }
      return '';
    }
  };

  const handleApprove = async (approvalId: string) => {
    const epoch = generation.current;
    try {
      const response = await api.post<any>(`/approvals/${approvalId}/approve`);
      if (!current(epoch)) return;
      const action = response?.action as ActionReceipt | undefined;
      const confirmation = action?.summary || 'The approved action was completed.';
      setMessages(prev => [...prev.map(msg => msg.approvalId === approvalId ? { ...msg, approvalId: undefined } : msg), { text: confirmation, isUser: false, actions: action ? [action] : [] }]);
      await speakText(confirmation);
      if (conversationActiveRef.current) queueFollowUp();
    } catch (err) {
      if (current(epoch)) Alert.alert('Error', 'Could not approve.');
    }
  };

  const handleReject = async (approvalId: string) => {
    const epoch = generation.current;
    try {
      await api.post(`/approvals/${approvalId}/reject`);
      if (!current(epoch)) return;
      Alert.alert('Rejected', 'Action cancelled.');
      speakText('Action rejected.');
      setMessages(prev => prev.map(msg =>
        msg.approvalId === approvalId ? { ...msg, approvalId: undefined } : msg
      ));
    } catch (err) {
      if (current(epoch)) Alert.alert('Error', 'Could not reject.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerIdentity}><Text style={styles.headerTitle}>Lucy</Text><Text style={[styles.sessionStatus, conversationActive && styles.sessionStatusLive]}>{conversationActive ? 'CONVERSATION LIVE' : 'READY'}</Text></View>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View>
            <View style={[styles.bubble, item.isUser ? styles.bubbleMe : styles.bubbleThem]}>
              {!item.isUser && (
                <View style={styles.avatar}>
                  <Ionicons name="chatbubble-ellipses" size={20} color="#00D4FF" />
                </View>
              )}
              <Text style={styles.msgText}>{item.text}</Text>
            </View>
            {!item.isUser && item.approvalId && (
              <View style={styles.approvalRow}>
                <TouchableOpacity
                  style={[styles.approvalBtn, styles.approveBtn]}
                  onPress={() => handleApprove(item.approvalId!)}
                >
                  <Text style={styles.approvalBtnText}>✅ Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approvalBtn, styles.rejectBtn]}
                  onPress={() => handleReject(item.approvalId!)}
                >
                  <Text style={styles.approvalBtnText}>❌ Reject</Text>
                </TouchableOpacity>
              </View>
            )}
            {!item.isUser && item.actions?.map((action: ActionReceipt, actionIndex: number) => (
              <View key={`${action.type}-${actionIndex}`} style={[styles.actionCard, action.status === 'failed' && styles.actionFailed]}>
                <View style={styles.actionHeader}><MaterialIcons name={action.status === 'completed' ? 'check-circle' : action.status === 'pending' ? 'schedule' : action.status === 'failed' ? 'error' : 'insights'} size={19} color={action.status === 'failed' ? '#FF6B6B' : '#67E8F9'} /><Text style={styles.actionTitle}>{action.title}</Text><Text style={styles.actionStatus}>{action.status}</Text></View>
                <Text style={styles.actionSummary}>{action.summary}</Text>
                {action.details?.map((detail: { label: string; value: string | number }, detailIndex: number) => <View key={detailIndex} style={styles.detailRow}><Text style={styles.detailLabel}>{detail.label}</Text><Text style={styles.detailValue}>{String(detail.value)}</Text></View>)}
              </View>
            ))}
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      {loading && <ActivityIndicator color="#00D4FF" style={{ padding: 8 }} />}
      {!!voiceStatus && <Text style={styles.voiceStatus}>{voiceStatus}</Text>}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Type a command..."
          placeholderTextColor="#888"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={isRecording ? stopRecording : startRecording} style={styles.micBtn}>
          <MaterialIcons name={isRecording ? 'stop' : 'mic'} size={28} color={isRecording ? '#F44336' : '#00D4FF'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSend} disabled={loading || !input.trim()}>
          <MaterialIcons name="send" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: { padding: 8, marginLeft: 4 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  headerIdentity: { alignItems: 'center' },
  sessionStatus: { color: '#64748B', fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 2 },
  sessionStatusLive: { color: '#67E8F9' },
  bubble: { margin: 8, padding: 12, borderRadius: 12, maxWidth: '80%' },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333', flexDirection: 'row', alignItems: 'center' },
  avatar: { marginRight: 8 },
  msgText: { color: '#FFF', fontSize: 15 },
  approvalRow: { flexDirection: 'row', marginTop: 4, marginLeft: 8, gap: 12 },
  approvalBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#555' },
  approveBtn: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  rejectBtn: { backgroundColor: '#F44336', borderColor: '#F44336' },
  approvalBtnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#333' },
  input: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF', fontSize: 16, marginRight: 12 },
  micBtn: { padding: 4, marginRight: 8 },
  voiceStatus: { color: '#67E8F9', textAlign: 'center', paddingVertical: 6, fontWeight: '700' },
  actionCard: { marginHorizontal: 12, marginBottom: 10, padding: 13, borderRadius: 14, backgroundColor: '#0D1B27', borderWidth: 1, borderColor: '#21445A' },
  actionFailed: { borderColor: '#6D3030', backgroundColor: '#231315' },
  actionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionTitle: { color: '#EAF5FA', fontSize: 13, fontWeight: '800', flex: 1 },
  actionStatus: { color: '#7DD3FC', fontSize: 8, fontWeight: '900', textTransform: 'uppercase' },
  actionSummary: { color: '#A9BBC8', fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#193142' },
  detailLabel: { color: '#6F8798', fontSize: 10 },
  detailValue: { color: '#DCE8EF', fontSize: 10, fontWeight: '700', flex: 1, textAlign: 'right' },
});
