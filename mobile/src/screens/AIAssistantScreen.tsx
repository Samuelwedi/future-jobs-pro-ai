import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

interface Message {
  text: string;
  isUser: boolean;
  approvalId?: string;
  actionType?: string;
}

export default function AIAssistantScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hi, I'm Lucy. I remember your workspace conversation and can help prepare actions, with approval before anything sensitive changes.", isUser: false },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [wakeStatus, setWakeStatus] = useState<'off' | 'starting' | 'listening' | 'detected' | 'error'>('off');
  const [wakeError, setWakeError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const isSpeaking = useRef(false);
  const lastAutoRecordEvent = useRef<string>('');
  const wakeCommandActive = useRef(false);

  const resumeWakeListening = () => {
    if (!wakeCommandActive.current) return;
    wakeCommandActive.current = false;
    if (wakeWordEnabled) DeviceEventEmitter.emit('lucyWakeWordPreferenceChanged', true);
  };

  useEffect(() => {
    AsyncStorage.getItem('lucyWakeWordEnabled').then(value => setWakeWordEnabled(value === 'true'));
    const listener = DeviceEventEmitter.addListener('lucyWakeWordStatusChanged', event => {
      setWakeStatus(event?.status || 'off');
      setWakeError(event?.status === 'error' ? event?.message || 'Hey Lucy could not start.' : null);
    });
    return () => listener.remove();
  }, []);

  const toggleWakeWord = async () => {
    const next = !wakeWordEnabled;
    setWakeWordEnabled(next);
    await AsyncStorage.setItem('lucyWakeWordEnabled', String(next));
    DeviceEventEmitter.emit('lucyWakeWordPreferenceChanged', next);
    Alert.alert(
      next ? 'Hey Lucy enabled' : 'Hey Lucy paused',
      next
        ? 'Lucy will listen for your wake phrase while Future Jobs Pro AI is open. Your audio stays on-device until the phrase is detected.'
        : 'Wake-word listening has been turned off.',
    );
  };

  // Auto-record from Home screen
  useEffect(() => {
    const eventKey = route.params?.wakeEvent ? String(route.params.wakeEvent) : (route.params?.autoRecord ? 'manual' : '');
    if (eventKey && eventKey !== lastAutoRecordEvent.current) {
      lastAutoRecordEvent.current = eventKey;
      wakeCommandActive.current = Boolean(route.params?.wakeEvent);
      const timer = setTimeout(() => startRecording(), 500);
      return () => clearTimeout(timer);
    }
  }, [route.params?.autoRecord, route.params?.wakeEvent]);

  // Load conversation history
  useEffect(() => {
    if (!user) return;
    api.get('/lucy/history')
      .then((data: any) => {
        if (data.messages) {
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
  const speakText = (text: string) => {
    if (!voiceReplies) {
      resumeWakeListening();
      return;
    }
    if (isSpeaking.current) Speech.stop();
    isSpeaking.current = true;
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.9,
      onDone: () => { isSpeaking.current = false; resumeWakeListening(); },
      onError: () => { isSpeaking.current = false; resumeWakeListening(); },
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { text: text.trim(), isUser: true }]);
    setLoading(true);
    try {
      const data = await api.post<any>('/lucy', { message: text.trim() });
      const botText = data?.text || data?.[0]?.text || "I'm not sure how to respond to that.";
      const approvalId = data?.approvalId || null;
      setMessages(prev => [...prev, { text: botText, isUser: false, approvalId }]);
      speakText(botText);
      if (approvalId) {
        setTimeout(() => speakText('Please check your phone to approve or reject.'), 1500);
      }
    } catch (err: any) {
      const errorMsg = 'Sorry, Lucy is taking a break.';
      setMessages(prev => [...prev, { text: errorMsg, isUser: false }]);
      speakText(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  // ----- Voice Recording with higher gain -----
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please grant microphone access.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Higher gain for better sensitivity
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
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
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (uri) {
        const transcript = await transcribeAudio(uri);
        if (transcript) {
          sendMessage(transcript);
        } else {
          Alert.alert('No speech detected', 'Please try again.');
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to process recording.');
    }
  };

  const transcribeAudio = async (uri: string): Promise<string> => {
    try {
      const response = await api.uploadFileWithData<{ transcript: string }>(
        '/voice/assistant-transcribe',
        uri,
        {},
        'audio'
      );
      return response.transcript || '';
    } catch (err: any) {
      console.error('Transcription error:', err);
      if (err.response?.status === 500) {
        Alert.alert('Server Error', 'Voice processing failed. Please try again later.');
      } else {
        Alert.alert('Error', 'Failed to transcribe audio.');
      }
      return '';
    }
  };

  const handleApprove = async (approvalId: string) => {
    try {
      await api.post(`/approvals/${approvalId}/approve`);
      Alert.alert('Approved', 'Action executed.');
      speakText('Action approved.');
      setMessages(prev => prev.map(msg =>
        msg.approvalId === approvalId ? { ...msg, approvalId: undefined } : msg
      ));
    } catch (err) {
      Alert.alert('Error', 'Could not approve.');
    }
  };

  const handleReject = async (approvalId: string) => {
    try {
      await api.post(`/approvals/${approvalId}/reject`);
      Alert.alert('Rejected', 'Action cancelled.');
      speakText('Action rejected.');
      setMessages(prev => prev.map(msg =>
        msg.approvalId === approvalId ? { ...msg, approvalId: undefined } : msg
      ));
    } catch (err) {
      Alert.alert('Error', 'Could not reject.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <View style={styles.lucyOrb}><MaterialIcons name="auto-awesome" size={18} color="#07111F" /></View>
          <View><Text style={styles.headerTitle}>Lucy</Text><Text style={styles.headerMeta}>Memory on • {wakeStatus === 'listening' ? 'Hey Lucy listening' : wakeStatus === 'detected' ? 'Wake phrase detected' : wakeStatus === 'error' ? 'Hey Lucy needs attention' : wakeWordEnabled ? 'Hey Lucy starting' : 'Hey Lucy off'}</Text></View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity accessibilityLabel="Toggle Hey Lucy" onPress={toggleWakeWord} style={[styles.voiceToggle, wakeWordEnabled && styles.wakeToggleActive]}>
            <MaterialIcons name="hearing" size={20} color={wakeWordEnabled ? '#A7F3D0' : '#64748B'} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Toggle spoken replies" onPress={() => setVoiceReplies(current => !current)} style={styles.voiceToggle}>
            <MaterialIcons name={voiceReplies ? 'volume-up' : 'volume-off'} size={21} color={voiceReplies ? '#67E8F9' : '#64748B'} />
          </TouchableOpacity>
        </View>
      </View>
      {wakeError ? (
        <TouchableOpacity style={styles.wakeError} onPress={toggleWakeWord}>
          <MaterialIcons name="error-outline" size={18} color="#FCA5A5" />
          <Text style={styles.wakeErrorText}>{wakeError} Tap to turn off and try again.</Text>
        </TouchableOpacity>
      ) : null}
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
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      {messages.length <= 2 && !loading && (
        <View style={styles.promptArea}>
          <Text style={styles.promptLabel}>TRY A WORKSPACE COMMAND</Text>
          <View style={styles.promptRow}>
            {['What needs attention today?', 'Summarize my active job', 'Prepare a schedule update'].map(prompt => (
              <TouchableOpacity key={prompt} style={styles.promptChip} onPress={() => sendMessage(prompt)}>
                <Text style={styles.promptText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {loading && <View style={styles.thinking}><ActivityIndicator color="#C4B5FD" size="small" /><Text style={styles.thinkingText}>Lucy is reasoning across your workspace…</Text></View>}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask Lucy about your workspace…"
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
  container: { flex: 1, backgroundColor: '#07111F' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#07111F',
    borderBottomWidth: 1,
    borderBottomColor: '#17283A',
  },
  backButton: { padding: 8, marginLeft: 4 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lucyOrb: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C4B5FD' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  headerMeta: { color: '#8FA0B5', fontSize: 10, marginTop: 2 },
  voiceToggle: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111E2D' },
  headerActions: { flexDirection: 'row', gap: 7 },
  wakeToggleActive: { backgroundColor: '#113A32', borderWidth: 1, borderColor: '#256B59' },
  wakeError: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#3B1118', borderBottomWidth: 1, borderBottomColor: '#7F1D1D' },
  wakeErrorText: { color: '#FECACA', fontSize: 11, flex: 1 },
  bubble: { margin: 8, padding: 12, borderRadius: 12, maxWidth: '80%' },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#0E7490' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#17112B', borderWidth: 1, borderColor: '#4C1D95', flexDirection: 'row', alignItems: 'center' },
  avatar: { marginRight: 8 },
  msgText: { color: '#FFF', fontSize: 15 },
  approvalRow: { flexDirection: 'row', marginTop: 4, marginLeft: 8, gap: 12 },
  approvalBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#555' },
  approveBtn: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  rejectBtn: { backgroundColor: '#F44336', borderColor: '#F44336' },
  approvalBtnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  promptArea: { paddingHorizontal: 12, paddingBottom: 10 },
  promptLabel: { color: '#64748B', fontSize: 9, letterSpacing: 1.2, fontWeight: '900', marginBottom: 7 },
  promptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  promptChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: '#111E2D', borderWidth: 1, borderColor: '#263A50' },
  promptText: { color: '#C8D4E2', fontSize: 11, fontWeight: '600' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  thinkingText: { color: '#A99BC2', fontSize: 11 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: Platform.OS === 'ios' ? 22 : 12, borderTopWidth: 1, borderTopColor: '#17283A', backgroundColor: '#091421' },
  input: { flex: 1, backgroundColor: '#111E2D', borderRadius: 18, borderWidth: 1, borderColor: '#263A50', paddingHorizontal: 16, paddingVertical: 11, color: '#FFF', fontSize: 15, marginRight: 10 },
  micBtn: { padding: 4, marginRight: 8 },
});
