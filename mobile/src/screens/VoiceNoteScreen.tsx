import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import * as Haptics from 'expo-haptics';

interface VoiceNoteResponse {
  success: boolean;
  voiceNoteId: string;
  transcript: string;
  structuredData: {
    actions: string[];
    parts: string[];
    measurements: { value: number; unit: string; context: string }[];
    issues: string[];
    nextSteps: string[];
    people: string[];
  };
  clientSummary: string;
  tags: string[];
  duration: number;
}

export default function VoiceNoteScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  // ---------- SAFE PARAMS ----------
  const projectId: string = route?.params?.projectId || '';
  const timeEntryId: string = route?.params?.timeEntryId || '';

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<VoiceNoteResponse | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } catch (error) {
      Alert.alert('Error', 'Could not start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (uri) {
        await processRecording(uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not stop recording');
    }
  };

  const processRecording = async (audioUri: string) => {
    setIsProcessing(true);
    try {
      const extraFields: Record<string, string> = {
        userId: user?.id || '',
        projectId,
        timeEntryId,
      };

      const response = await api.uploadFileWithData<VoiceNoteResponse>(
        '/voice/process',
        audioUri,
        extraFields,
        'audio'
      );
      setResult(response);
      api.recordAIEvent('voice_note', {
        transcript: response.transcript,
        duration: response.duration,
        projectId,
      }).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('Processing Failed', error.message || 'Could not process voice note');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else Alert.alert('Info', 'Return to previous screen.');
  };

  // ---------- Fallback when no project ----------
  if (!projectId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Please select a project first</Text>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------- Permission checks ----------
  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={styles.loadingText}>Requesting microphone permission...</Text>
      </View>
    );
  }
  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="mic-off" size={64} color="#F44336" />
        <Text style={styles.errorText}>Microphone access required</Text>
      </View>
    );
  }

  // ---------- Processing state ----------
  if (isProcessing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={styles.processingTitle}>🤖 AI is Processing</Text>
        <Text style={styles.processingText}>Transcribing and extracting information...</Text>
      </View>
    );
  }

  // ---------- Result view ----------
  if (result) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.resultContent}>
        <Text style={styles.resultTitle}>✅ Voice Note Processed</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>📧 Client Summary</Text>
          <Text style={styles.summaryText}>{result.clientSummary}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>📝 Full Transcript</Text>
          <Text style={styles.transcriptText}>{result.transcript}</Text>
        </View>

        {result.structuredData.actions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>🔧 Actions</Text>
            {result.structuredData.actions.map((a, i) => <Text key={i} style={styles.item}>• {a}</Text>)}
          </View>
        )}

        {result.structuredData.parts.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>🧰 Parts/Equipment</Text>
            <View style={styles.tagContainer}>
              {result.structuredData.parts.map((p, i) => <View key={i} style={styles.tag}><Text style={styles.tagText}>{p}</Text></View>)}
            </View>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setResult(null)}>
            <Text style={styles.secondaryButtonText}>New Note</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={goBack}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ---------- Main recording view ----------
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <MaterialIcons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Note</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.recordingArea}>
        <View style={styles.waveform}>
          {[1,2,3,4,5,6,7].map(i => (
            <View key={i} style={[styles.waveBar, { height: isRecording ? 40 + i*5 : 20, backgroundColor: isRecording ? '#00D4FF' : '#444' }]} />
          ))}
        </View>

        {isRecording && <Text style={styles.timer}>{formatDuration(recordingDuration)}</Text>}
        <Text style={styles.aiGuide}>
          {isRecording ? "🎤 Recording... Speak clearly about the work you did" : "Tap the mic and describe the work you performed"}
        </Text>
      </View>

      <View style={styles.recordButtonContainer}>
        <TouchableOpacity onPress={isRecording ? stopRecording : startRecording}>
          <View style={[styles.recordButton, { backgroundColor: isRecording ? '#F44336' : '#00D4FF' }]}>
            <MaterialIcons name={isRecording ? 'stop' : 'mic'} size={40} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.recordHint}>{isRecording ? 'Tap to Stop' : 'Tap to Record'}</Text>
      </View>
    </View>
  );
}

// ---------- Styles (same as before) ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, paddingBottom: 20 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  recordingArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  waveform: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', height: 100, marginBottom: 30 },
  waveBar: { width: 6, marginHorizontal: 4, borderRadius: 3 },
  timer: { color: '#FFF', fontSize: 48, fontWeight: 'bold', marginBottom: 20 },
  aiGuide: { color: '#888', fontSize: 16, textAlign: 'center', marginBottom: 30 },
  recordButtonContainer: { alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 50 : 30 },
  recordButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  recordHint: { color: '#888', fontSize: 14, marginTop: 15 },
  loadingText: { color: '#FFF', marginTop: 20, fontSize: 16 },
  errorText: { color: '#FFF', fontSize: 18, marginBottom: 30, textAlign: 'center' },
  backButton: { backgroundColor: '#00D4FF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  backButtonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
  processingTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 20 },
  processingText: { color: '#888', fontSize: 16, marginTop: 10 },
  resultContent: { padding: 20, paddingBottom: 40 },
  resultTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, marginBottom: 15 },
  cardLabel: { color: '#00D4FF', fontSize: 14, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  summaryText: { color: '#FFF', fontSize: 16, lineHeight: 24 },
  transcriptText: { color: '#CCC', fontSize: 14, lineHeight: 22, fontStyle: 'italic' },
  item: { color: '#CCC', fontSize: 14, marginLeft: 8, marginBottom: 4 },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: '#00D4FF20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#00D4FF40' },
  tagText: { color: '#00D4FF', fontSize: 12 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  primaryButton: { flex: 1, backgroundColor: '#00D4FF', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
  secondaryButton: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#00D4FF', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#00D4FF', fontSize: 16 },
});