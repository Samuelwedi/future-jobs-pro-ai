import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, DeviceEventEmitter, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isSpeaking = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('lucyWakeWordEnabled')
      .then(value => setWakeWordEnabled(value === 'true'))
      .catch(() => setWakeWordEnabled(false));
  }, []);

  const changeWakeWordPreference = async (enabled: boolean) => {
    setWakeWordEnabled(enabled);
    await AsyncStorage.setItem('lucyWakeWordEnabled', String(enabled));
    DeviceEventEmitter.emit('lucyWakeWordPreferenceChanged', enabled);
    Alert.alert(
      enabled ? 'Hey Lucy enabled' : 'Hey Lucy disabled',
      enabled
        ? 'Listening stays on this device only and requires a signed development or store build.'
        : 'Background wake-word listening has stopped.',
    );
  };

  // Auto-record from Home screen
  useEffect(() => {
    if (route.params?.autoRecord) {
      const timer = setTimeout(() => startRecording(), 500);
      return () => clearTimeout(timer);
    }
  }, [route.params?.autoRecord]);

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
    if (isSpeaking.current) Speech.stop();
    isSpeaking.current = true;
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.9,
      onDone: () => { isSpeaking.current = false; },
      onError: () => { isSpeaking.current = false; },
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
        '/voice/process',
        uri,
        { userId: user?.id || '', projectId: '00000000-0000-0000-0000-000000000000' },
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
        <Text style={styles.headerTitle}>Ask Lucy</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.wakeWordRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.wakeWordTitle}>Hey Lucy</Text>
          <Text style={styles.wakeWordCaption}>Opt-in on-device wake word. Microphone use is always visible.</Text>
        </View>
        <Switch value={wakeWordEnabled} onValueChange={changeWakeWordPreference} />
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
  wakeWordRow: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 12, padding: 14, borderRadius: 16, backgroundColor: '#121D24', borderWidth: 1, borderColor: '#214150' },
  wakeWordTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  wakeWordCaption: { color: '#AFC3CD', fontSize: 12, marginTop: 3 },
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
});
