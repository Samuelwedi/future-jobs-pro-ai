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
    { text: "Hi! I'm Lucy. I can schedule, run payroll, and generate reports. Try me!", isUser: false },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const isSpeaking = useRef(false);
  const finishingRecording = useRef(false);
  const heardSpeech = useRef(false);
  const silenceStartedAt = useRef<number | null>(null);
  const maximumRecordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-record from Home screen
  useEffect(() => {
    if (route.params?.autoRecord) {
      let cancelled = false;
      const beginWakeConversation = async () => {
        setMessages(prev => [...prev, { text: "I'm listening. What can I do for you?", isUser: false }]);
        await speakText("I'm listening. What can I do for you?");
        if (!cancelled) setTimeout(() => { if (!cancelled) void startRecording(); }, 350);
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
  const speakText = async (text: string): Promise<void> => {
    if (isSpeaking.current) Speech.stop();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
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
      await speakText(approvalId ? `${botText} Please approve or reject the action on screen.` : botText);
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
  const finishRecording = async (activeRecording: Audio.Recording | null) => {
    if (!activeRecording || finishingRecording.current) return;
    finishingRecording.current = true;
    if (maximumRecordingTimer.current) clearTimeout(maximumRecordingTimer.current);
    setIsRecording(false);
    setVoiceStatus('Processing your request…');
    try {
      activeRecording.setOnRecordingStatusUpdate(null);
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();
      setRecording(null);
      if (!uri) throw new Error('Recording file was not created');
      const transcript = await transcribeAudio(uri);
      if (transcript) await sendMessage(transcript);
      else setMessages(prev => [...prev, { text: "I didn't catch that. Tap the microphone and try again.", isUser: false }]);
    } catch (err) {
      Alert.alert('Error', 'Failed to process recording.');
    } finally {
      finishingRecording.current = false;
      heardSpeech.current = false;
      silenceStartedAt.current = null;
      setVoiceStatus('');
    }
  };

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
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = async () => {
    await finishRecording(recording);
  };

  const transcribeAudio = async (uri: string): Promise<string> => {
    try {
      const response = await api.uploadFileWithData<{ transcript: string }>(
        '/voice/assistant-transcribe',
        uri,
        { userId: user?.id || '', projectId: '00000000-0000-0000-0000-000000000000' },
        'audio'
      );
      return response.transcript || '';
    } catch (err: any) {
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
        <Text style={styles.headerTitle}>Ask Lucy</Text>
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
});
