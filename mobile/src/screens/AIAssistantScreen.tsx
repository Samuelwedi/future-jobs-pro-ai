import LucyWorkspacePanel from '../components/LucyWorkspacePanel';
import LucySourceEvidence from '../components/LucySourceEvidence';
import type {LucyEvidence} from '../utils/lucyEvidence';
import {LucyChatRequestController, lucyRequestNotice, type LucyChatAttempt} from '../utils/lucyChatRequest';
import { useLang } from '../context/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  DeviceEventEmitter, AppState,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api, API_URL } from '../services/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RecorderSession } from '../services/RecorderSession';
import { useRecorderSession } from '../hooks/useRecorderSession';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Message {
  text: string;
  isUser: boolean;
  approvalId?: string;
  actionType?: string;
  actions?: ActionReceipt[];
  evidence?: LucyEvidence;
  requestId?: string;
}

interface ActionReceipt {
  type: string;
  title: string;
  status: 'completed' | 'information' | 'pending' | 'failed';
  summary: string;
  download?: {url:string;filename:string;label:string};
  details: Array<{ label: string; value: string | number }>;
}

const LUCY_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export default function AIAssistantScreen() {
  const {lang,t}=useLang();
  const [workspaceVisible,setWorkspaceVisible]=useState(false);
  const approvalLock=useRef(false);
  const [approvalBusy,setApprovalBusy]=useState(false);
  const safeInsets = useSafeAreaInsets();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const controllerRef = useRef(new LucyChatRequestController());
  const controller = controllerRef.current;
  const interacted = useRef(false);
  const scope = user ? JSON.stringify([user.id, user.companyId, user.role]) : '';
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const deniedScope = useRef<string|null>(null);
  controller.setScope(scope === deniedScope.current ? '' : scope);
  const [requestState, setRequestState] = useState(controller.snapshot());
  const syncRequest = () => setRequestState(controller.snapshot());
  const [messages, setMessages] = useState<Message[]>([
    { text: t("Hi! I'm Lucy. I can schedule, run payroll, and generate reports. Try me!"), isUser: false },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [conversationActive, setConversationActive] = useState(false);
  const [wakeEnabled, setWakeEnabled] = useState(true);
  const [wakeStatus, setWakeStatus] = useState('starting');
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
  const recorderRef = useRef<RecorderSession | null>(null);
  const finishRecordingRef = useRef<(recorder: RecorderSession) => void>(() => undefined);
  const { session: audioRecorder, state: recorderState, error: recorderError } = useRecorderSession(LUCY_RECORDING_OPTIONS, true);
  recorderRef.current = audioRecorder;

  useEffect(() => {
    const activeRecorder = recorderRef.current;
    if (!activeRecorder || !recorderState?.isRecording || typeof recorderState.metering !== 'number') return;
    if (recorderState.metering > -42) {
      heardSpeech.current = true;
      silenceStartedAt.current = null;
    } else if (heardSpeech.current) {
      silenceStartedAt.current ??= Date.now();
      if (Date.now() - silenceStartedAt.current > 1800) {
        finishRecordingRef.current(activeRecorder);
      }
    }
  }, [recorderState]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem('lucyWakeWordEnabled').then(value => {
      if (mounted) setWakeEnabled(value !== 'false');
    });
    const subscription = DeviceEventEmitter.addListener('lucyWakeWordStatusChanged', event => {
      if (!mounted) return;
      setWakeStatus(String(event?.status || 'off'));
      if (event?.status === 'error' && event?.message) setVoiceStatus(String(event.message));
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const toggleWakeWord = async () => {
    const enabled = !wakeEnabled;
    setWakeEnabled(enabled);
    await AsyncStorage.setItem('lucyWakeWordEnabled', String(enabled));
    DeviceEventEmitter.emit('lucyWakeWordPreferenceChanged', enabled);
    setVoiceStatus(enabled ? t("Starting foreground Hey Lucy…") : t("Hey Lucy disabled"));
  };
  const active = useRef(true);
  const generation = useRef(0);
  const startingRecording = useRef(false);
  const current = (epoch: number) => active.current && generation.current === epoch && scopeRef.current === scope;

  useEffect(() => {
    const leave = () => {
      active.current = false;
      controller.suspend();
      generation.current += 1;
      conversationActiveRef.current = false;
      for (const timer of [followUpTimer, conversationTimer, maximumRecordingTimer]) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
      }
      isSpeaking.current = false;
      try { void Speech.stop().catch(() => {}); } catch {}
      const pending = recorderRef.current;
      pending?.cancel();
      DeviceEventEmitter.emit('lucyConversationEnded');
    };
    const enter = () => {
      active.current = true;
      controller.resume(); syncRequest();
      setIsRecording(false);
      setLoading(false);
      setConversationActive(false);
      setVoiceStatus('');
    };
    if (AppState.currentState !== 'active' || !navigation.isFocused()) leave();
    else enter();
    const blur = navigation.addListener('blur', leave);
    const focus = navigation.addListener('focus', enter);
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') leave();
      else if (navigation.isFocused()) enter();
    });
    return () => { blur(); focus(); appState.remove(); leave(); };
  }, [navigation]);

  useEffect(() => {
    if (!recorderError || !active.current) return;
    if (maximumRecordingTimer.current) clearTimeout(maximumRecordingTimer.current);
    maximumRecordingTimer.current = null;
    conversationActiveRef.current = false;
    setConversationActive(false);
    setIsRecording(false);
    setVoiceStatus(t("Microphone interrupted. Tap the microphone to try again."));
  }, [recorderError]);

  const setConversation = (active: boolean) => {
    if (!current(generation.current)) return;
    conversationActiveRef.current = active;
    setConversationActive(active);
    if (conversationTimer.current) clearTimeout(conversationTimer.current);
    if (active) conversationTimer.current = setTimeout(() => {
      conversationActiveRef.current = false;
      setConversationActive(false);
      setVoiceStatus(t("Conversation ended • Say “Hey Lucy” to begin again"));
    }, 60000);
  };

  const queueFollowUp = (delay = 550) => {
    if (!conversationActiveRef.current || controller.snapshot().pending) return;
    if (followUpTimer.current) clearTimeout(followUpTimer.current);
    followUpTimer.current = setTimeout(() => {
      if (conversationActiveRef.current && !controller.snapshot().pending && !isSpeaking.current && !finishingRecording.current) void startRecording();
    }, delay);
  };

  // Authentication scope changes drop all private chat and unresolved payloads.
  useEffect(() => {
    generation.current++; interacted.current = false;
    conversationActiveRef.current = false;
    for (const timer of [followUpTimer, conversationTimer, maximumRecordingTimer]) {
      if (timer.current) clearTimeout(timer.current); timer.current = null;
    }
    try { void Speech.stop().catch(() => {}); } catch {}
    recorderRef.current?.cancel();
    setMessages([{text: t("Hi! I'm Lucy. I can schedule, run payroll, and generate reports. Try me!"), isUser: false}]);
    setInput(''); setLoading(false); setConversationActive(false); setIsRecording(false); setVoiceStatus(''); setWorkspaceVisible(false); syncRequest();
  }, [user?.id, user?.companyId, user?.role]);

  // Auto-record from Home screen
  useEffect(() => {
    if (route.params?.autoRecord) {
      let cancelled = false;
      const epoch = generation.current;
      const beginWakeConversation = async () => {
        if (cancelled || !current(epoch) || controller.snapshot().pending) return;
        setConversation(true);
        const greeting = t("I'm here. What would you like me to take care of?");
        setMessages(prev => [...prev, { text: greeting, isUser: false }]);
        await speakText(greeting);
        if (!cancelled && current(epoch)) queueFollowUp(350);
      };
      const timer = setTimeout(() => void beginWakeConversation(), 900);
      return () => { cancelled = true; clearTimeout(timer); };
    }
  }, [route.params?.autoRecord, route.params?.wakeEvent]);


  // History must not overwrite a new send, another account, or a hidden screen.
  useEffect(() => {
    if (!user) return;
    const epoch = generation.current;
    api.get('/lucy/history')
      .then((data: any) => {
        if (current(epoch) && !interacted.current && data.messages) {
          const history = [...data.messages].reverse().map((m: any) => ({
            text: m.content,
            isUser: m.role === 'user',
          }));
          setMessages(history);
        }
      })
      .catch(() => {});
  }, [user?.id, user?.companyId, user?.role]);

  // Speak Lucy's response
  const speakText = async (text: string): Promise<void> => {
    const epoch = generation.current;
    if (!current(epoch)) return;
    try {
    if (isSpeaking.current) await Speech.stop();
    if (!current(epoch)) return;
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    });
    const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
    if (!current(epoch)) return;
    const preferred = voices.find(voice =>
      /samantha|zira|ava|victoria|female|serena|karen/i.test(`${voice.name} ${voice.identifier}`)
      && voice.language.toLowerCase().startsWith(lang)
    ) || voices.find(voice => voice.language.toLowerCase().startsWith(lang));
    isSpeaking.current = true;
    const spokenText = text.replace(/[*_#`>-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1800);
    await new Promise<void>(resolve => Speech.speak(spokenText, {
      language: lang==='es'?'es-ES':lang==='fr'?'fr-CA':'en-US',
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

  const runRequest = async (attempt: LucyChatAttempt, fromVoice: boolean) => {
    const epoch = generation.current;
    setLoading(true); syncRequest();
    try {
      let outcome;
      try {
        const response = attempt.checking
          ? {data: await api.get<any>(`/lucy-v2/requests/${encodeURIComponent(attempt.payload.requestId)}`), status: 200}
          : await api.postLucyChat<any>(attempt.payload);
        if (!current(epoch)) return;
        const receipt = response.data;
        outcome = controller.receive(attempt, attempt.checking && receipt?.response ? receipt.response.body : receipt, attempt.checking && receipt?.response ? receipt.response.statusCode : response.status);
      } catch (error: any) {
        if (!current(epoch) || !controller.isCurrent(attempt)) return;
        if ([401, 403].includes(error?.response?.status)) {
          deniedScope.current = scope; controller.setScope(''); generation.current++; setMessages([]); setInput(''); setLoading(false); syncRequest();
          setConversation(false);
          setVoiceStatus(t('Your access changed. Sign in again or reopen Lucy before continuing.'));
          return;
        }
        outcome = error?.response
          ? controller.receive(attempt, error.response.data, error.response.status)
          : controller.fail(attempt);
      }
      if (outcome.kind === 'stale') return;
      const data = outcome.data;
      const completed = outcome.kind === 'completed';
      if (!completed) {
        setConversation(false);
        if (followUpTimer.current) clearTimeout(followUpTimer.current);
        followUpTimer.current = null;
        setVoiceStatus('');
      }
      if (data) {
        const botText = data?.text || (completed ? t('Lucy returned the request receipt.') : t('Lucy returned action receipts. The overall request outcome is not confirmed.'));
        const approvalId = data?.approvalId || null;
        const actions: ActionReceipt[] = Array.isArray(data?.actions) ? data.actions : [];
        const requestId = attempt.payload.requestId;
        if (!data?.ignored) setMessages(prev => [...prev.filter(item => item.isUser || item.requestId !== requestId), { text: botText, isUser: false, approvalId, actions, evidence: data.evidence, requestId }]);
        if (completed) {
          consecutiveMisses.current = 0;
          if (conversationActiveRef.current) setConversation(true);
          // Receipt checks are explicit and silent; never restart a voice turn.
          if (!attempt.checking && !data?.ignored && botText) await speakText(approvalId ? `${botText} ${t('Please approve or reject the protected action on screen.')}` : botText);
          if (!current(epoch)) return;
          if (!attempt.checking && fromVoice && data?.continueListening !== false && !approvalId && conversationActiveRef.current) queueFollowUp();
          else if (approvalId) setVoiceStatus(t("Waiting for your approval"));
        }
      }
    } finally {
      if (current(epoch)) {setLoading(controller.snapshot().busy); syncRequest();}
    }
  };
  const sendMessage = async (text: string, fromVoice = false) => {
    const epoch = generation.current;
    if (!text.trim() || !current(epoch)) return;
    const attempt = controller.begin({message: text.trim(), conversationMode: conversationActiveRef.current, channel: fromVoice ? 'voice' : 'text', language: lang});
    if (!attempt) return;
    interacted.current = true;
    setMessages(prev => [...prev, {text: text.trim(), isUser: true}]);
    await runRequest(attempt, fromVoice);
  };
  const checkPrevious = () => {
    if (!current(generation.current)) return;
    const attempt = controller.check(); if (attempt) void runRequest(attempt, false);
  };
  const startNew = () => {
    const requestId = controller.snapshot().requestId;
    if (!requestId || controller.snapshot().busy) return;
    Alert.alert(t('Start a new request?'), t('The previous request may already have changed records. Starting a new request does not cancel it and could duplicate its actions. Review your records first.'), [
      {text: t('Keep previous request'), style: 'cancel'},
      {text: t('Start a new request'), style: 'destructive', onPress: () => {if (controller.startNewAfterWarning(requestId)) syncRequest();}},
    ]);
  };

  const downloadAction=async(item:NonNullable<ActionReceipt['download']>)=>{
    try{
      if(!item.url.startsWith('/lucy-v2/timesheet-excel?'))throw new Error(t("Unsupported report link"));
      const token=await api.getToken();
      const name=item.filename.replace(/[^a-zA-Z0-9_.-]/g,'_');
      const result=await FileSystem.downloadAsync(`${API_URL}${item.url}`,`${FileSystem.cacheDirectory}${name}`,{headers:{Authorization:`Bearer ${token}`}});
      if(result.status!==200)throw new Error(t("Report could not be downloaded"));
      if(await Sharing.isAvailableAsync())await Sharing.shareAsync(result.uri,{mimeType:'application/vnd.ms-excel'});
      else Alert.alert(t("Report downloaded"),result.uri);
    }catch(e:any){Alert.alert(t("Report"),e.message);}
  };
  const handleSend = () => {
    if (!input.trim() || controller.snapshot().pending || !current(generation.current)) return;
    void sendMessage(input);
    setInput('');
  };

  // ----- Voice recording with metering-based silence detection -----
  const finishRecording = async (activeRecording: RecorderSession | null) => {
    const epoch = generation.current;
    if (!current(epoch) || !activeRecording || finishingRecording.current) return;
    finishingRecording.current = true;
    if (maximumRecordingTimer.current) clearTimeout(maximumRecordingTimer.current);
    setIsRecording(false);
    setVoiceStatus(t("Processing your request…"));
    try {
      const uri = await activeRecording.stop();
      if (!current(epoch) || !uri) return;
      const transcript = await transcribeAudio(uri);
      if (!current(epoch)) return;
      const endConversation = /^(thanks|thank you|that's all|that is all|goodbye|stop listening|cancel)$/i.test(transcript.trim());
      if (endConversation) {
        setConversation(false);
        const closing = t("Of course. I’ll be here when you need me.");
        setMessages(prev => [...prev, { text: closing, isUser: false }]);
        await speakText(closing);
      } else if (transcript) {
        setConversation(true);
        await sendMessage(transcript, true);
      } else if (conversationActiveRef.current) {
        consecutiveMisses.current += 1;
        if (consecutiveMisses.current < 2) {
          setVoiceStatus(t("Still listening…"));
          queueFollowUp(500);
        } else {
          setConversation(false);
          setVoiceStatus(t("Conversation paused • Say “Hey Lucy” when ready"));
        }
      }
    } catch (err) {
      if (current(epoch)) Alert.alert(t('Error'), t("Failed to process recording."));
    } finally {
      finishingRecording.current = false;
      heardSpeech.current = false;
      silenceStartedAt.current = null;
      if (current(epoch)) setVoiceStatus('');
    }
  };
  finishRecordingRef.current = (activeRecording) => {
    void finishRecording(activeRecording);
  };

  const startRecording = async () => {
    const epoch = generation.current;
    if (!current(epoch) || startingRecording.current || finishingRecording.current || recorderRef.current?.isRecording) return;
    if (controller.snapshot().pending) return;
    startingRecording.current = true;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!current(epoch)) return;
      if (!permission.granted) {
        Alert.alert(t('Permission required'), t("Please grant microphone access."));
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      if (!current(epoch)) return;

      const started = await audioRecorder.start();
      if (!current(epoch)) { audioRecorder.cancel(); return; }
      if (!started) return;
      setIsRecording(true);
      setVoiceStatus(t("Listening… speak now"));
      heardSpeech.current = false;
      silenceStartedAt.current = null;
      maximumRecordingTimer.current = setTimeout(() => void finishRecording(audioRecorder), 15000);
    } catch (err) {
      if (current(epoch)) Alert.alert(t('Error'), t("Could not start recording. Please check microphone permissions."));
    } finally {
      startingRecording.current = false;
    }
  };

  const stopRecording = async () => {
    await finishRecording(audioRecorder);
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
        Alert.alert(t("Server Error"), t("Voice processing failed. Please try again later."));
      } else {
        Alert.alert(t('Error'), t("Failed to transcribe audio."));
      }
      return '';
    }
  };

  const handleApprove = async (approvalId: string) => {
    if(approvalLock.current)return;
    approvalLock.current=true;setApprovalBusy(true);
    const epoch = generation.current;
    try {
      const response = await api.post<any>(`/approvals/${approvalId}/approve`);
      if (!current(epoch)) return;
      const action = response?.action as ActionReceipt | undefined;
      const confirmation = action?.summary || t("The approved action was completed.");
      setMessages(prev => [...prev.map(msg => msg.approvalId === approvalId ? { ...msg, approvalId: undefined } : msg), { text: confirmation, isUser: false, actions: action ? [action] : [] }]);
      await speakText(confirmation);
      if (conversationActiveRef.current) queueFollowUp();
    } catch (err) {
      if (current(epoch)) Alert.alert(t('Error'), t("Could not approve."));
    } finally {approvalLock.current=false;if(current(epoch))setApprovalBusy(false);}
  };

  const handleReject = async (approvalId: string) => {
    if(approvalLock.current)return;
    approvalLock.current=true;setApprovalBusy(true);
    const epoch = generation.current;
    try {
      await api.post(`/approvals/${approvalId}/reject`);
      if (!current(epoch)) return;
      Alert.alert(t('Rejected'), t("Action cancelled."));
      speakText(t("Action rejected."));
      setMessages(prev => prev.map(msg =>
        msg.approvalId === approvalId ? { ...msg, approvalId: undefined } : msg
      ));
    } catch (err) {
      if (current(epoch)) Alert.alert(t('Error'), t("Could not reject."));
    } finally {approvalLock.current=false;if(current(epoch))setApprovalBusy(false);}
  };

  return (
    <KeyboardAvoidingView keyboardVerticalOffset={safeInsets.top} style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerIdentity}><Text style={styles.headerTitle}>Lucy</Text><Text style={[styles.sessionStatus, (conversationActive||wakeStatus==='listening') && styles.sessionStatusLive]}>{conversationActive ? t("CONVERSATION LIVE") : wakeEnabled&&wakeStatus==='listening' ? t("HEY LUCY LISTENING") : wakeEnabled ? t("HEY LUCY STARTING") : t("READY")}</Text></View>
        <TouchableOpacity onPress={toggleWakeWord} accessibilityRole="switch" accessibilityState={{checked:wakeEnabled}} style={[styles.wakeToggle,wakeEnabled&&styles.wakeToggleOn]}><MaterialIcons name={wakeEnabled?'hearing':'hearing-disabled'} size={19} color={wakeEnabled?'#071018':'#94A3B8'}/></TouchableOpacity>
      </View>
      <TouchableOpacity accessibilityRole="button" onPress={()=>setWorkspaceVisible(true)} style={{paddingHorizontal:20,paddingVertical:12}}><Text style={{color:'#67E8F9',fontSize:16}}>{lang==='es'?'Preferencias e investigación':lang==='fr'?'Préférences et recherche':'Preferences & research'}</Text></TouchableOpacity>
      <LucyWorkspacePanel visible={workspaceVisible} onClose={()=>setWorkspaceVisible(false)}/>
      <FlatList
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
                  disabled={approvalBusy} onPress={() => handleApprove(item.approvalId!)}
                >
                  <Text style={styles.approvalBtnText}>{t("✅ Approve")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approvalBtn, styles.rejectBtn]}
                  disabled={approvalBusy} onPress={() => handleReject(item.approvalId!)}
                >
                  <Text style={styles.approvalBtnText}>{t("❌ Reject")}</Text>
                </TouchableOpacity>
              </View>
            )}
            {!item.isUser && item.actions?.map((action: ActionReceipt, actionIndex: number) => (
              <View key={`${action.type}-${actionIndex}`} style={[styles.actionCard, action.status === 'failed' && styles.actionFailed]}>
                <View style={styles.actionHeader}><MaterialIcons name={action.status === 'completed' ? 'check-circle' : action.status === 'pending' ? 'schedule' : action.status === 'failed' ? 'error' : 'insights'} size={19} color={action.status === 'failed' ? '#FF6B6B' : '#67E8F9'} /><Text style={styles.actionTitle}>{action.title}</Text><Text style={styles.actionStatus}>{t(action.status)}</Text></View>
                <Text style={styles.actionSummary}>{action.summary}</Text>
                {action.download&&<TouchableOpacity onPress={()=>void downloadAction(action.download!)}><Text style={{color:"#67E8F9",paddingVertical:12}}>{action.download.label}</Text></TouchableOpacity>}
                {action.status==='pending'&&<TouchableOpacity disabled={loading || requestState.pending} onPress={()=>void sendMessage('yes, run it')}><Text style={{color:"#67E8F9",paddingVertical:12}}>{t("Create draft payroll")}</Text></TouchableOpacity>}
                {action.details?.map((detail: { label: string; value: string | number }, detailIndex: number) => <View key={detailIndex} style={styles.detailRow}><Text style={styles.detailLabel}>{detail.label}</Text><Text style={styles.detailValue}>{String(detail.value)}</Text></View>)}
              </View>
            ))}
            {!item.isUser && <View style={{marginHorizontal: 12}}><LucySourceEvidence evidence={item.evidence} language={lang}/></View>}
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      {requestState.pending && <View style={styles.requestNotice}>
        <Text accessibilityLiveRegion="polite" style={styles.requestNoticeText}>{t(lucyRequestNotice(requestState))}</Text>
        <View style={styles.requestButtons}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled: !requestState.canCheck}} disabled={!requestState.canCheck} style={[styles.requestButton, !requestState.canCheck && styles.requestButtonDisabled]} onPress={checkPrevious}><Text style={styles.requestButtonText}>{t('Check previous request')}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled: requestState.busy}} disabled={requestState.busy} style={[styles.requestButton, requestState.busy && styles.requestButtonDisabled]} onPress={startNew}><Text style={styles.requestButtonText}>{t('Start a new request…')}</Text></TouchableOpacity>
        </View>
      </View>}
      {loading && <ActivityIndicator color="#00D4FF" style={{ padding: 8 }} />}
      {!!voiceStatus && <Text style={styles.voiceStatus}>{voiceStatus}</Text>}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={t("Type a command...")}
          placeholderTextColor="#888"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity accessibilityLabel={t(isRecording ? 'Stop recording' : 'Talk to Lucy')} disabled={!isRecording && requestState.pending} onPress={isRecording ? stopRecording : startRecording} style={styles.micBtn}>
          <MaterialIcons name={isRecording ? 'stop' : 'mic'} size={28} color={isRecording ? '#F44336' : '#00D4FF'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSend} disabled={loading || requestState.pending || !input.trim()}>
          <MaterialIcons name="send" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  requestNotice: {marginHorizontal: 12, padding: 12, borderRadius: 12, backgroundColor: '#302619', borderWidth: 1, borderColor: '#8A6839'},
  requestNoticeText: {color: '#FFE0A3', fontSize: 14},
  requestButtons: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
  requestButton: {minHeight: 44, justifyContent: 'center', paddingHorizontal: 10},
  requestButtonDisabled: {opacity: 0.45},
  requestButtonText: {color: '#67E8F9', fontWeight: '600'},
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', padding: 8, marginLeft: 4 },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  headerIdentity: { alignItems: 'center' },
  sessionStatus: { color: '#64748B', fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 2 },
  sessionStatusLive: { color: '#67E8F9' },
  wakeToggle: { width: 40, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  wakeToggleOn: { backgroundColor: '#67E8F9', borderColor: '#67E8F9' },
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
