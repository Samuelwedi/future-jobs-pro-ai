import { TranscriptEditor } from '../components/TranscriptEditor';
import { useLang } from '../context/LanguageContext';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Platform, ScrollView, AppState, Switch, KeyboardAvoidingView,
} from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { useRecorderSession } from '../hooks/useRecorderSession';
import { appendMeter, emptyMeter, meterLevel } from '../utils/recordingMeter';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api, type VoiceSession } from '../services/api';
import { getPendingVoice, startVoiceUpload, recoverVoiceUpload, type VoiceReceipt, type VoiceOutcome } from '../services/voiceReceiptUpload';
import * as Haptics from 'expo-haptics';

interface VoiceNoteResponse {
  success: boolean;
  voiceNoteId: string;
  transcriptionStatus?: 'completed' | 'skipped' | 'edited';
  audioUrl?: string;
  transcript: string | null;
  structuredData: {
    actions: string[];
    parts: string[];
    measurements: { value: number; unit: string; context: string }[];
    issues: string[];
    nextSteps: string[];
    people: string[];
  } | null;
  clientSummary: string | null;
  tags: string[];
  duration: number | null;
}

export default function VoiceNoteScreen() {
  const { user } = useAuth();
  const route = useRoute<any>();
  return <VoiceNoteContent key={`${user?.id || ''}:${user?.companyId || ''}:${route.params?.projectId || ''}:${route.params?.timeEntryId || ''}`} />;
}

function VoiceNoteContent() {
 const { t, lang } = useLang();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const projectId: string = route?.params?.projectId || '';
  const timeEntryId: string = route?.params?.timeEntryId || '';

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  // isRecording includes a paused, unfinished note so Stop still saves that note.
  const [isPaused, setIsPaused] = useState(false);
  const [meterHistory, setMeterHistory] = useState(emptyMeter);
  const [meterAvailable, setMeterAvailable] = useState(false);
  const { session: audioRecorder, state: recorderState, error: recorderError } = useRecorderSession(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }, true,
  );
  const [transcribe, setTranscribe] = useState(true);
  const recordingMode = useRef(true);
  const recordingSession = useRef<VoiceSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<VoiceNoteResponse | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const generation = useRef(0);
  const focused = useRef(true);
  const current = (epoch: number) => mounted.current && focused.current && generation.current === epoch;
  // retryUri is only a stopped source that has not been durably prepared yet.
  // Once a receipt exists, all recovery goes through its immutable saved phase.
  const [retryUri, setRetryUri] = useState<string | null>(null);
  const [savedReceipt, setSavedReceipt] = useState<VoiceReceipt | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(true);
  const [receiptLoadError, setReceiptLoadError] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const loadPending = async () => {
    const epoch = generation.current, sequence = ++loadSequence.current;
    const active = () => current(epoch) && loadSequence.current === sequence;
    if (!active()) return;
    setReceiptLoading(true);
    try {
      if (!user?.id || !user.companyId || !projectId) throw new Error('Sign in and select the original project.');
      const session = await api.captureVoiceSession(user.id, user.companyId);
      if (!active()) return;
      const pending = await getPendingVoice(session.ownerId, session.companyId, projectId, timeEntryId || null);
      api.assertVoiceSession(session);
      if (!active()) return;
      setSavedReceipt(pending || null);
      if (pending) { recordingMode.current = pending.mode === 'audio-transcribed'; setRetryUri(null); }
      setReceiptLoadError(null);
    } catch (error: any) {
      if (active()) setReceiptLoadError(error.message || t('Saved recording records could not be read.'));
    } finally { if (active()) setReceiptLoading(false); }
  };

  useEffect(() => { void loadPending(); }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
      const { status } = await requestRecordingPermissionsAsync();
      if (!mounted.current) return;
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      } else {
        Alert.alert(t("Permission Denied"), t("Microphone access is required to record voice notes."));
      }
      } catch {
        if (mounted.current) {
          setHasPermission(false);
          Alert.alert(t("Audio unavailable"), t("Could not initialize the microphone. Please reopen this screen."));
        }
      }
    })();
    return () => {
      mounted.current = false;
      generation.current += 1;
      audioRecorder.cancel();
    };
  }, []);

  useEffect(() => {
    const leave = () => {
      focused.current = false;
      generation.current += 1;
      audioRecorder.cancel();
      setIsRecording(false);
      setIsPaused(false);
      setMeterHistory(emptyMeter());
      setMeterAvailable(false);
      setRecordingDuration(0);
      setIsProcessing(false);
      setResult(null);
    };
    const enter = () => { focused.current = true; void loadPending(); };
    const blur = navigation.addListener('blur', leave);
    const focus = navigation.addListener('focus', enter);
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') leave();
      else if (navigation.isFocused()) enter();
    });
    return () => { blur(); focus(); appState.remove(); };
  }, [navigation, audioRecorder]);

  useEffect(() => {
    if (!isRecording || !focused.current) return;
    if (recorderError || (recorderState && (recorderState.mediaServicesDidReset ||
        (!recorderState.isRecording && !audioRecorder.isPaused)))) {
      audioRecorder.cancel();
      setIsRecording(false);
      setIsPaused(false);
      setMeterHistory(emptyMeter());
      setMeterAvailable(false);
      setRecordingDuration(0);
      Alert.alert(t("Recording interrupted"), t("The recording stopped unexpectedly. Please record your note again."));
      return;
    }
    if (!recorderState || !audioRecorder.hasRecording) return;
    // Native duration excludes pauses, unlike wall-clock elapsed time.
    if (Number.isFinite(recorderState.durationMillis)) {
      setRecordingDuration(Math.max(0, Math.floor(recorderState.durationMillis / 1000)));
    }
    if (!recorderState.isRecording || audioRecorder.isPaused) return;
    setMeterAvailable(meterLevel(recorderState.metering) !== null);
    setMeterHistory(previous => appendMeter(previous, recorderState.metering));
    // Only fresh native polls should update the meter, not a local pause/start render.
  }, [recorderState, recorderError]);

  const togglePause = () => {
    if (!current(generation.current) || busy.current || !audioRecorder.hasRecording) return;
    busy.current = true;
    try {
      if (audioRecorder.isPaused) {
        if (audioRecorder.resume()) setIsPaused(false);
      } else if (audioRecorder.pause()) {
        setIsPaused(true);
      }
    } catch {
      setIsRecording(false);
      setIsPaused(false);
      setMeterHistory(emptyMeter());
      setMeterAvailable(false);
      setRecordingDuration(0);
      Alert.alert(t("Recording interrupted"), t("The recording stopped unexpectedly. Please record your note again."));
    } finally {
      busy.current = false;
    }
  };

  const startRecording = async () => {
    const epoch = generation.current;
    if (!current(epoch) || busy.current || audioRecorder.hasRecording || receiptLoading || receiptLoadError || savedReceipt || retryUri) return;
    if (!hasPermission) {
      Alert.alert(t("Permission Required"), t("Please grant microphone permission in settings."));
      return;
    }
    busy.current = true;
    recordingMode.current = transcribe;
    try {
      if (!user?.id || !user.companyId) throw new Error('Sign in before recording.');
      const session = await api.captureVoiceSession(user.id, user.companyId);
      if (!current(epoch)) return;
      const pending = await getPendingVoice(session.ownerId, session.companyId, projectId, timeEntryId || null);
      api.assertVoiceSession(session);
      if (!current(epoch)) return;
      if (pending) { setSavedReceipt(pending); return; }
      recordingSession.current = session;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      api.assertVoiceSession(session);
      if (!current(epoch)) return;
      const started = await audioRecorder.start();
      if (!current(epoch)) { audioRecorder.cancel(); return; }
      api.assertVoiceSession(session);
      if (!started) return;
      setRetryUri(null);
      setIsRecording(true);
      setIsPaused(false);
      setMeterHistory(emptyMeter());
      setMeterAvailable(false);
      setRecordingDuration(0);
    } catch (error: any) {
      console.error('Start recording error:', error);
      audioRecorder.cancel();
      if (current(epoch)) Alert.alert(t("Error"), t('Could not start recording: {error}', {error:error.message}));
    } finally {
      busy.current = false;
    }
  };

  const stopRecording = async () => {
    const epoch = generation.current;
    if (!current(epoch) || !audioRecorder.hasRecording || busy.current) return;
    busy.current = true;
    setIsRecording(false);
    setIsPaused(false);
    setMeterHistory(emptyMeter());
    setMeterAvailable(false);
    setRecordingDuration(0);
    try {
      const uri = await audioRecorder.stop();
      if (!current(epoch)) return;
      if (uri) {
        await processRecording(uri);
      } else {
        Alert.alert(t("Error"), t("No audio file was created."));
      }
    } catch (error: any) {
      if (current(epoch)) Alert.alert(t("Error"), t('Could not stop recording: {error}', {error:error.message}));
    } finally {
      busy.current = false;
    }
  };

  const showOutcome = (outcome: VoiceOutcome) => {
    if (outcome.state === 'completed') {
      setSavedReceipt(null); setRetryUri(null); setReceiptLoadError(null);
      // A strict saved acknowledgment is final even if its transcript is empty.
      // Never convert saved evidence into another processing attempt.
      setResult(outcome.response);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      setSavedReceipt(outcome.receipt); setRetryUri(null);
      recordingMode.current = outcome.receipt.mode === 'audio-transcribed';
      Alert.alert(t(outcome.state === 'prepared' ? 'Recording saved on this device' : 'Save not confirmed'),
        t(outcome.state === 'prepared' ? 'Your recording is saved locally. Send it when you are online.' : 'Your recording has not been confirmed. Check its status; it will not be uploaded again.'));
    }
  };

  const processRecording = async (audioUri: string) => {
    const epoch = generation.current, session = recordingSession.current;
    if (!current(epoch) || !session) return;
    const active = () => current(epoch);
    setResult(null); setRetryUri(audioUri); setIsProcessing(true);
    try {
      api.assertVoiceSession(session);
      const outcome = await startVoiceUpload(session, projectId, timeEntryId || null,
        recordingMode.current ? 'audio-transcribed' : 'audio-only', audioUri, active, prepared => {
          if (!active()) return;
          setSavedReceipt(prepared); setRetryUri(null);
        });
      api.assertVoiceSession(session);
      if (!active()) return;
      showOutcome(outcome);
    } catch (error: any) {
      if (!active()) return;
      await loadPending();
      if (!active()) return;
      Alert.alert(t('Recording needs attention'), error.message || t('Could not save recording.'));
    } finally {
      if (active()) setIsProcessing(false);
    }
  };

  const recoverRecording = async () => {
    const epoch = generation.current;
    if (!current(epoch) || busy.current || receiptLoading || receiptLoadError || !savedReceipt || !user?.id || !user.companyId) return;
    busy.current = true; setIsProcessing(true);
    const active = () => current(epoch);
    try {
      const session = await api.captureVoiceSession(user.id, user.companyId);
      if (!active()) return;
      const outcome = await recoverVoiceUpload(session, projectId, timeEntryId || null, active);
      api.assertVoiceSession(session);
      if (!active()) return;
      showOutcome(outcome);
    } catch (error: any) {
      if (!active()) return;
      await loadPending();
      if (active()) Alert.alert(t('Recording needs attention'), error.message || t('Could not check recording status.'));
    } finally { busy.current = false; if (active()) setIsProcessing(false); }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else Alert.alert(t('Info'), t("Return to previous screen."));
  };

  if (!projectId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t("Please select a project first")}</Text>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Text style={styles.backButtonText}>{t("Go Back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Saved-note recovery does not require microphone permission or a local file
  // after submission. A failed storage read blocks starting a replacement note.
  if (receiptLoading || receiptLoadError || savedReceipt) {
    return <View style={styles.center}>
      <Text style={styles.resultTitle}>{t(isProcessing ? 'Saving or checking recording...' : receiptLoading ? 'Checking saved recordings...' : receiptLoadError ? 'Recording needs attention' : 'Saved recording')}</Text>
      {!!savedReceipt && <Text style={styles.processingText}>{t(savedReceipt.mode === 'audio-only' ? 'Audio only. No AI processing.' : 'Transcription and summary enabled.')}</Text>}
      <Text style={styles.processingText}>{receiptLoadError || t(isProcessing ? 'Wait for saved status to be confirmed.' : receiptLoading ? 'Checking saved recordings...' : savedReceipt?.phase === 'prepared'
        ? 'Saved on this device and not submitted. Send when online.'
        : 'Save not confirmed. Check status before recording another note. This will not upload again.')}</Text>
      {(receiptLoading || isProcessing) && <ActivityIndicator size="large" color="#00D4FF" />}
      {!receiptLoading && <TouchableOpacity accessibilityRole="button" disabled={isProcessing} style={styles.backButton}
        onPress={receiptLoadError ? () => { void loadPending(); } : recoverRecording}>
        <Text style={styles.backButtonText}>{t(isProcessing ? 'Saving or checking recording...' : receiptLoadError ? 'Reload saved recordings' : savedReceipt?.phase === 'prepared' ? 'Send saved recording' : 'Check recording status')}</Text>
      </TouchableOpacity>}
      <TouchableOpacity accessibilityRole="button" style={styles.backButton} onPress={goBack}><Text style={styles.backButtonText}>{t('Go Back')}</Text></TouchableOpacity>
    </View>;
  }

  if (isProcessing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={styles.processingTitle}>{t(recordingMode.current ? "🤖 AI is Processing" : "Saving audio...")}</Text>
        <Text style={styles.processingText}>{t(recordingMode.current ? "Transcribing and extracting information..." : "Saving without transcription or AI processing.")}</Text>
      </View>
    );
  }

  if (result) {
    return (
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} contentContainerStyle={styles.resultContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.resultTitle}>{t(result.transcriptionStatus === 'skipped' ? "Audio note saved" : "✅ Voice Note Processed")}</Text>
        {result.transcriptionStatus === 'skipped' ? <View style={styles.card}>
          <Text style={styles.summaryText}>{t("Audio saved in the project album. No transcript or AI summary was created.")}</Text>
        </View> : <>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("📧 Client Summary")}</Text>
          <Text style={styles.summaryText}>{result.transcriptionStatus === 'edited' ? t("Transcript edited. Previous AI summary and extracted details were cleared.") : result.clientSummary}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("📝 Full Transcript")}</Text>
          <TranscriptEditor key={result.voiceNoteId} noteId={result.voiceNoteId} transcript={result.transcript || ''} audioUrl={result.audioUrl}
            onReconcile={() => setResult(previous => previous ? {...previous, clientSummary:null, structuredData:null, tags:[]} : previous)}
            onSaved={saved => setResult(previous => previous && previous.voiceNoteId === saved.voiceNoteId ? {...previous, ...saved} : previous)} />
        </View>
        </>}
        {!!result.structuredData?.actions?.length && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t("🔧 Actions")}</Text>
            {result.structuredData.actions.map((a, i) => <Text key={i} style={styles.item}>• {a}</Text>)}
          </View>
        )}
        {!!result.structuredData?.parts?.length && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t("🧰 Parts/Equipment")}</Text>
            <View style={styles.tagContainer}>
              {result.structuredData.parts.map((p, i) => <View key={i} style={styles.tag}><Text style={styles.tagText}>{p}</Text></View>)}
            </View>
          </View>
        )}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setResult(null)}>
            <Text style={styles.secondaryButtonText}>{t("New Note")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={goBack}>
            <Text style={styles.primaryButtonText}>{t("Done")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={styles.loadingText}>{t("Requesting microphone permission...")}</Text>
      </View>
    );
  }
  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="mic-off" size={64} color="#F44336" />
        <Text style={styles.errorText}>{t("Microphone access required")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <MaterialIcons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("Voice Note")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.transcriptionOption}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("Transcribe and summarize")}</Text>
          <Text style={styles.recordHint}>{t("Turn off to save audio only, without AI processing.")}</Text>
        </View>
        <Switch accessibilityLabel={t("Transcribe and summarize")} value={transcribe}
          disabled={isRecording || isProcessing || !!retryUri || receiptLoading || !!receiptLoadError || !!savedReceipt}
          onValueChange={value => { if (!busy.current && !audioRecorder.hasRecording && !retryUri && !receiptLoading && !receiptLoadError && !savedReceipt) setTranscribe(value); }} />
      </View>
      <View style={styles.recordingArea}>
        <View style={styles.waveform} accessible={false} importantForAccessibility="no-hide-descendants">
          {meterHistory.map((level, i) => (
            <View key={i} style={[styles.waveBar, { height: 4 + level * 76, backgroundColor: isRecording && !isPaused ? '#00D4FF' : '#444' }]} />
          ))}
        </View>
        {isRecording && <Text style={styles.timer}>{formatDuration(recordingDuration)}</Text>}
        {isRecording && !isPaused && !meterAvailable && <Text style={styles.recordHint}>{t("Audio level unavailable")}</Text>}
        <Text style={styles.aiGuide}>
          {isPaused ? t("Recording paused") : isRecording ? t("🎤 Recording... Speak clearly about the work you did") : t("Tap the mic and describe the work you performed")}
        </Text>
      </View>

      <View style={styles.recordButtonContainer}>
        {retryUri && !isRecording && <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={() => {
          if (busy.current) return;
          busy.current = true;
          void processRecording(retryUri).finally(() => { busy.current = false; });
        }}><Text style={styles.secondaryButtonText}>{t("Save local recording")}</Text></TouchableOpacity>}
        {isRecording && <TouchableOpacity accessibilityRole="button"
          accessibilityLabel={t(isPaused ? "Resume recording" : "Pause recording")}
          style={styles.pauseButton} onPress={togglePause}>
          <MaterialIcons name={isPaused ? 'play-arrow' : 'pause'} size={24} color="#00D4FF" />
          <Text style={styles.secondaryButtonText}>{t(isPaused ? "Resume recording" : "Pause recording")}</Text>
        </TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t(isRecording ? "Stop recording" : "Tap to Record")} disabled={!isRecording && (!!retryUri || !!savedReceipt || receiptLoading || !!receiptLoadError)} onPress={isRecording ? stopRecording : startRecording}>
          <View style={[styles.recordButton, { backgroundColor: isRecording ? '#F44336' : '#00D4FF' }]}>
            <MaterialIcons name={isRecording ? 'stop' : 'mic'} size={40} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.recordHint}>{isRecording ? t("Tap to Stop") : t("Tap to Record")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 18, fontWeight: '600' },
  transcriptionOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  recordingArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  waveform: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', height: 100, marginBottom: 30 },
  waveBar: { width: 5, marginHorizontal: 2, borderRadius: 3 },
  timer: { color: '#FFF', fontSize: 48, fontWeight: 'bold', marginBottom: 20 },
  aiGuide: { color: '#888', fontSize: 16, textAlign: 'center', marginBottom: 30 },
  recordButtonContainer: { alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 50 : 30 },
  pauseButton: { minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  recordButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  recordHint: { color: '#888', fontSize: 14, marginTop: 15 },
  loadingText: { color: '#FFF', marginTop: 20, fontSize: 16 },
  errorText: { color: '#FFF', fontSize: 18, marginBottom: 30, textAlign: 'center' },
  backButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', backgroundColor: '#00D4FF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
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
