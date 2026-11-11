import { useLang } from '../context/LanguageContext';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, AppState,
} from 'react-native';
import { CameraView as EmbeddedCamera, Camera } from 'expo-camera';
import { acquireCameraMicrophone } from '../services/cameraMicrophone';
import { highestPictureSize, MAX_VIDEO_BYTES } from '../utils/cameraSettings';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api, createEvidenceRequestKey } from '../services/api';
import { getPendingEvidence } from '../services/offlineService';
import * as Haptics from 'expo-haptics';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

const { requestCameraPermissionsAsync } = Camera;

interface UploadResponse {
  requestKey: string;
  success: boolean;
  photoId: string;
  compliance: {
    passed: boolean;
    score: number;
    issues: string[];
    suggestions: string[];
  };
  verificationHash: string;
  fileType: string;
}
type PendingCapture = Readonly<{uri:string;isVideo:boolean;fileInfo?:{name:string;mimeType?:string};fields:Readonly<Record<string,string>>}>;

const TEMPLATES = [
  { id: 'standard', label: 'Standard', desc: 'Date, Time, GPS, App name' },
  { id: 'minimal', label: 'Minimal', desc: 'Date & Time only' },
  { id: 'detailed', label: 'Detailed', desc: 'All details + Altitude, Weather' },
  { id: 'map-style', label: 'Map Style', desc: 'GPS + Google Maps link' },
];

export default function CameraView() {
  const { t, lang } = useLang();
  const captureLock = useRef(false);
  const cameraRef = useRef<EmbeddedCamera | null>(null);
  const recording = useRef(false);
  const [microphoneOwner, setMicrophoneOwner] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [pictureSize, setPictureSize] = useState<string>();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const session = useRef(0);
  const previewActive = useRef(false);
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const projectId: string = route?.params?.projectId || '';
  const timeEntryId: string = route?.params?.timeEntryId || '';
  const scope = `${user?.id || ''}:${user?.companyId || ''}:${user?.role || ''}:${projectId}:${timeEntryId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const pendingCapture = useRef<PendingCapture | null>(null);
  const [hasPendingCapture,setHasPendingCapture] = useState(false);
  const [captureRecoveryReady,setCaptureRecoveryReady] = useState(false);
  const [captureRecoveryFailed,setCaptureRecoveryFailed] = useState(false);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const cameraIdentity = `${scope}:${mode}:${cameraAttempt}:${isFocused}:${appActive}`;
  const currentCameraIdentity = useRef(cameraIdentity);
  currentCameraIdentity.current = cameraIdentity;
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [watermarkTemplate, setWatermarkTemplate] = useState('standard');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // A session generation invalidates permission/capture promises on blur, background or scope change.
  previewActive.current = isFocused && appActive;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      previewActive.current = state === 'active' && isFocused;
      if (state !== 'active') {
        session.current++;
        cameraRef.current?.stopRecording();
      }
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, [isFocused]);

  useEffect(() => {
    session.current++;
    setCameraReady(false);
    setPictureSize(undefined);
    setIsRecording(false);
    setIsProcessing(false);
    return () => {
      session.current++;
      cameraRef.current?.stopRecording();
      recording.current = false;
    };
  }, [isFocused, appActive, scope, mode, cameraAttempt]);

  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    setMicrophoneOwner('');
    if (mode === 'video' && isFocused && appActive) {
      void acquireCameraMicrophone().then(dispose => {
        if (cancelled) { dispose(); return; }
        release = dispose;
        setMicrophoneOwner(cameraIdentity);
      }).catch(() => { if (!cancelled) setCameraFailed(true); });
    }
    return () => { cancelled = true; release?.(); };
  }, [mode, isFocused, appActive, scope, cameraAttempt]);

  useEffect(() => {
    let active=true;
    pendingCapture.current=null;
    setHasPendingCapture(false);
    setCaptureRecoveryReady(false);
    setCaptureRecoveryFailed(false);
    if(!user?.id||!projectId)return;
    // Recover the original key and metadata after leaving the screen or restarting the app.
    void getPendingEvidence(user.id,projectId).then(saved=>{
      if(!active||currentScope.current!==scope)return;
      if(saved?.fileUri){
        pendingCapture.current=Object.freeze({uri:saved.fileUri,isVideo:saved.data.fileType==='video',fileInfo:saved.fileInfo?Object.freeze({...saved.fileInfo}):undefined,fields:Object.freeze({...saved.data})});
        setHasPendingCapture(true);
      }
      setCaptureRecoveryReady(true);
    }).catch(()=>{if(active&&currentScope.current===scope)setCaptureRecoveryFailed(true);});
    return()=>{active=false;};
  },[scope]);

  useEffect(() => {
    (async () => {
      // Request camera permission
      const { status: camStatus } = await requestCameraPermissionsAsync();
      if (isMounted.current) setHasCameraPermission(camStatus === 'granted');

      void fetchLocation();
    })().catch(() => { if (isMounted.current) setHasCameraPermission(false); });
  }, []);

  const fetchLocation = async (): Promise<Location.LocationObject | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        if (isMounted.current) setCurrentLocation(loc);

        try {
          const addr = await Location.reverseGeocodeAsync(loc.coords);
          if (addr && addr[0]) {
            const parts = [
              addr[0].name,
              addr[0].street,
              addr[0].city,
              addr[0].region,
              addr[0].postalCode,
            ].filter(Boolean);
            if (isMounted.current) setAddress(parts.join(', '));
          }
        } catch (e) {
          console.warn('Reverse geocode failed:', e);
        }

        return loc;
      }
    } catch (e) {
      console.warn('Location fetch failed:', e);
    }
    return null;
  };

  const ensureLocation = async (): Promise<Location.LocationObject | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const loc = await fetchLocation();
        if (loc) return loc;
      } catch (e) {
        console.warn(`Location attempt ${attempt + 1} failed:`, e);
      }
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
    }
    return null;
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else Alert.alert(t('Info'), t('Return to the previous screen.'));
  };

  if (!projectId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('Please select a project first')}</Text>
        <TouchableOpacity style={styles.backButton} disabled={isProcessing} onPress={goBack}>
          <Text style={styles.backButtonText}>{t('Go Back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const uploadFile = async (uri: string, isVideo: boolean = false, fileInfo?: { name: string; mimeType?: string }, expectedToken?:string|null) => {
    const uploadScope=currentScope.current;
    const uploadSession=session.current;
    const isCurrent=()=>isMounted.current&&currentScope.current===uploadScope&&session.current===uploadSession&&previewActive.current;
    setIsProcessing(true);
    try {
      const token=expectedToken===undefined?await api.getToken():expectedToken;
      if(!isCurrent())return;
      let capture=pendingCapture.current;
      if(!capture){
      const requestKey=createEvidenceRequestKey();
      const loc = await ensureLocation();
      if(!isCurrent())return;
      const extraFields: Record<string, string> = {
        requestKey,
        userId: user?.id || '',
        projectId,
        template: watermarkTemplate,
      };
      if (timeEntryId) extraFields.timeEntryId = timeEntryId;
      if (loc) {
        extraFields.latitude = loc.coords.latitude.toString();
        extraFields.longitude = loc.coords.longitude.toString();
        if (loc.coords.altitude != null) extraFields.altitude = loc.coords.altitude.toString();
        if (loc.coords.heading != null) extraFields.direction = loc.coords.heading.toString();
      } else {
        console.warn('⚠️ No location available – watermark will show placeholders');
      }

      if (isVideo) extraFields.fileType = 'video';
      capture=Object.freeze({uri,isVideo,fileInfo:fileInfo?Object.freeze({...fileInfo}):undefined,fields:Object.freeze(extraFields)});
      pendingCapture.current=capture;
      setHasPendingCapture(true);
      }

      const response = await api.uploadFileWithData<UploadResponse>(
        '/photos/upload',
        capture.uri,
        capture.fields,
        'file', false, capture.fileInfo, token, user?.id
      );
      if(!isCurrent())return;
      if (!response.success || response.requestKey!==capture.fields.requestKey) throw new Error(t('Upload status is pending or unavailable. Your capture is saved on this device. Check its status before taking another.'));
      pendingCapture.current=null;
      setHasPendingCapture(false);

      const score = response?.compliance?.score;
      const hasScore = typeof score === 'number' && Number.isFinite(score);
      const passed = response?.compliance?.passed ?? false;
      const issues = response?.compliance?.issues ?? [];
      const suggestions = response?.compliance?.suggestions ?? [];

      if (isMounted.current) setLastScore(hasScore ? score : null);

      api.recordAIEvent(capture.isVideo ? 'video_taken' : 'photo_taken', {
        complianceScore: score,
        issues,
        projectId:capture.fields.projectId,
        fileType: capture.isVideo ? 'video' : 'image',
      }, capture.fields.latitude&&capture.fields.longitude ? {lat:Number(capture.fields.latitude),lng:Number(capture.fields.longitude)} : undefined).catch(() => {});

      if (!hasScore) {
        Alert.alert(t('Evidence saved'), t('Uploaded successfully. Automated assessment is unavailable.'), [{text:t('Done'),onPress:goBack}]);
      } else if (passed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t('Evidence saved'), t('Assessment score: {score}/100. Automated checks do not guarantee acceptance in a dispute.', {score:String(score)}), [
          { text: t('Take Another'), style: 'cancel' },
          { text: t('Done'), onPress: goBack },
        ]);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          t('Evidence saved — review recommended'),
          t('Score: {score}/100\n\nIssues:\n{issues}\n\nSuggestions:\n{suggestions}', {score:String(score), issues:issues.join('\n'), suggestions:suggestions.join('\n')}),
          [
            { text: t('Retake'), style: 'cancel' },
            { text: t('Done'), onPress: goBack },
          ]
        );
      }
    } catch (error: any) {
      if(!isCurrent())return;
      const queued = /upload queued for later/i.test(error.message || '');
      const unresolved=error.code==='EVIDENCE_PENDING';
      Alert.alert(t(queued ? 'Upload queued' : unresolved ? 'Check upload status' : 'Upload Failed'), t(error.message || 'Could not upload. Please check your connection.'));
    } finally {
      if (isCurrent()) setIsProcessing(false);
    }
  };

  const captureInApp = async () => {
    if (recording.current) {
      cameraRef.current?.stopRecording();
      return;
    }
    if (captureLock.current || !captureRecoveryReady) return;
    captureLock.current = true;
    const launchScope=currentScope.current;
    const launchSession=session.current;
    const isCurrent=()=>isMounted.current&&currentScope.current===launchScope&&session.current===launchSession&&previewActive.current;
    setIsProcessing(true);
    try {
    // The same capture is checked again. Never silently turn an uncertain upload into a retake.
    if(pendingCapture.current){
      const capture=pendingCapture.current;
      await uploadFile(capture.uri,capture.isVideo,capture.fileInfo);
      return;
    }
    const captureToken=await api.getToken();
    if(!isCurrent())return;
    if (hasCameraPermission !== true) {
      Alert.alert(t('Permission required'), t('Please grant camera permission.'));
      const { status } = await requestCameraPermissionsAsync();
      if(!isCurrent())return;
      setHasCameraPermission(status === 'granted');
      return; // Wait for the newly mounted preview before capturing.
    }
    if (!cameraReady || !cameraRef.current) return;

    // For video, check audio permission
    if (mode === 'video' && hasAudioPermission !== true) {
      const { status } = await requestRecordingPermissionsAsync();
      if(!isCurrent())return;
      setHasAudioPermission(status === 'granted');
      if (status !== 'granted') {
        Alert.alert(t('Audio required'), t('Microphone permission is needed for video recording.'));
        return;
      }
    }

    setIsProcessing(true);
    try {
      await Speech.stop();
      if(!isCurrent())return;
      const isVideo = mode === 'video';
      if (isVideo) {
        recording.current = true;
        setIsRecording(true);
      }
      const asset = isVideo
        ? await cameraRef.current.recordAsync({ maxDuration: 1800, maxFileSize: MAX_VIDEO_BYTES })
        : await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: false });
      recording.current = false;
      if (isCurrent()) setIsRecording(false);
      if(!isCurrent())return;

      if (asset?.uri) {
        // Validate file exists and is not empty
        try {
          const fileInfo = await FileSystem.getInfoAsync(asset.uri);
          if(!isCurrent())return;
          if (!fileInfo.exists || fileInfo.size === 0) {
            Alert.alert(t('Error'), t('The captured file is empty or corrupted. Please try again.'));
            setIsProcessing(false);
            return;
          }
          console.log(`📁 ${isVideo ? 'Video' : 'Photo'} size: ${(fileInfo.size / 1024).toFixed(2)} KB`);
        } catch (err) {
          console.warn('Could not check file:', err);
          // Continue anyway – maybe it will work
        }

        if(!isCurrent())return;
        // Preserve the camera container type (for example iOS QuickTime), rather than relabeling every video as MP4.
        await uploadFile(asset.uri, isVideo, undefined,captureToken);
      } else {
        // User cancelled
        if (isCurrent()) setIsProcessing(false);
      }
    } catch (error: any) {
      if(isCurrent())Alert.alert(t('Error'), error.message || t('Failed to launch camera.'));
      if (isCurrent()) setIsProcessing(false);
    } finally { recording.current = false; if(isCurrent())setIsRecording(false); }
    } catch (error: any) {
      if(isCurrent())Alert.alert(t('Error'), error.message || t('Failed to launch camera.'));
    } finally {
      captureLock.current = false;
      if (isCurrent()) setIsProcessing(false);
    }
  };

  const selectMode = async (nextMode: 'photo' | 'video') => {
    if (nextMode === mode || captureLock.current || hasPendingCapture) return;
    const selectionScope = currentScope.current;
    const selectionSession = session.current;
    const isCurrent = () => isMounted.current && previewActive.current && currentScope.current === selectionScope && session.current === selectionSession;
    captureLock.current = true;
    setIsProcessing(true);
    try {
      if (nextMode === 'video') {
        const permission = await requestRecordingPermissionsAsync();
        if (!isCurrent()) return;
        setHasAudioPermission(permission.granted);
        if (!permission.granted) {
          Alert.alert(t('Audio required'), t('Microphone permission is needed for video recording.'));
          return;
        }
        await Speech.stop();
        if (!isCurrent()) return;
      }
      setCameraReady(false);
      setMode(nextMode);
    } catch {
      if (isCurrent()) Alert.alert(t('Audio required'), t('Microphone permission is needed for video recording.'));
    } finally {
      captureLock.current = false;
      if (isCurrent()) setIsProcessing(false);
    }
  };

  if (hasCameraPermission === null) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color="#00D4FF" /></View>
    );
  }

  // Build preview text (metadata that will be added to the watermark)
  const now = new Date();
  const previewLines: string[] = [];
  previewLines.push('📍 ' + (address || t('Getting location...')));
  previewLines.push('🕐 ' + now.toLocaleString(lang));
  if (currentLocation) {
    const lat = currentLocation.coords.latitude.toFixed(6);
    const lng = currentLocation.coords.longitude.toFixed(6);
    previewLines.push(t('Latitude {latitude}° · Longitude {longitude}°', {latitude:lat, longitude:lng}));
  } else {
    previewLines.push(t('🛰️ Getting GPS...'));
  }
  if (watermarkTemplate === 'map-style' && currentLocation) {
    previewLines.push(`maps.google.com/?q=${currentLocation.coords.latitude},${currentLocation.coords.longitude}`);
  }
  if (watermarkTemplate === 'detailed') {
    previewLines.push(t('🌡️ Altitude: -- m   Weather: --'));
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.previewArea} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backArrow} disabled={isProcessing} onPress={goBack}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'photo' && styles.modeBtnActive]}
            disabled={isProcessing || hasPendingCapture} onPress={() => selectMode('photo')}
          >
            <Text style={[styles.modeText, mode === 'photo' && styles.modeTextActive]}>{t('📸 Photo')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'video' && styles.modeBtnActive]}
            disabled={isProcessing || hasPendingCapture} onPress={() => selectMode('video')}
          >
            <Text style={[styles.modeText, mode === 'video' && styles.modeTextActive]}>{t('🎬 Video')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cameraPreview}>
          {hasCameraPermission && isFocused && appActive && !cameraFailed && (mode === 'photo' || microphoneOwner === cameraIdentity) && (
            <EmbeddedCamera
              key={`${scope}:${mode}:${cameraAttempt}`}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back" mode={mode === 'photo' ? 'picture' : 'video'}
              autofocus="on" pictureSize={mode === 'photo' ? pictureSize : undefined}
              videoQuality="2160p" mute={mode !== 'video' || hasAudioPermission !== true}
              responsiveOrientationWhenOrientationLocked
              onCameraReady={async () => {
                if (currentCameraIdentity.current !== cameraIdentity) return;
                const readySession = session.current;
                const camera = cameraRef.current;
                try {
                  const sizes = await camera?.getAvailablePictureSizesAsync();
                  if (session.current !== readySession || camera !== cameraRef.current || !previewActive.current) return;
                  setPictureSize(highestPictureSize(sizes || []));
                } catch { /* Native camera defaults remain available if enumeration fails. */ }
                if (session.current === readySession && camera === cameraRef.current && previewActive.current) setCameraReady(true);
              }}
              onMountError={() => { if (currentCameraIdentity.current === cameraIdentity) { setCameraReady(false); setCameraFailed(true); } }}
            />
          )}
          {!hasCameraPermission && <Text style={styles.captureHint}>{t('Please grant camera permission.')}</Text>}
          {cameraFailed && <TouchableOpacity accessibilityRole="button" onPress={() => { setCameraFailed(false); setCameraAttempt(value => value + 1); }}>
            <Text style={styles.captureHint}>{t('Camera unavailable. Tap to retry.')}</Text>
          </TouchableOpacity>}
        </View>
        <View style={styles.watermarkPreview}>
          {previewLines.map((line, idx) => (
            <Text key={idx} style={styles.watermarkPreviewText}>{line}</Text>
          ))}
        </View>

        <TouchableOpacity
          style={styles.templateToggle}
          disabled={isProcessing || hasPendingCapture} onPress={() => setShowTemplatePicker(!showTemplatePicker)}
        >
          <MaterialIcons name="style" size={22} color="#FFF" />
          <Text style={styles.templateToggleText}>
            {t(TEMPLATES.find(template => template.id === watermarkTemplate)?.label || watermarkTemplate)}
          </Text>
        </TouchableOpacity>

        {showTemplatePicker && (
          <View style={styles.templatePicker}>
            <Text style={styles.pickerTitle}>{t('Watermark Style')}</Text>
            {TEMPLATES.map((template) => (
              <TouchableOpacity
                key={template.id}
                disabled={isProcessing || hasPendingCapture}
                style={[styles.templateOption, watermarkTemplate === template.id && styles.templateOptionSelected]}
                onPress={() => {
                  setWatermarkTemplate(template.id);
                  setShowTemplatePicker(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.templateOptionTitle, watermarkTemplate === template.id && styles.templateOptionTitleSelected]}>
                    {t(template.label)}
                  </Text>
                  <Text style={styles.templateOptionDesc}>{t(template.desc)}</Text>
                </View>
                {watermarkTemplate === template.id && (
                  <MaterialIcons name="check-circle" size={22} color="#00D4FF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {lastScore !== null && (
          <View style={[styles.scoreBadge, { backgroundColor: lastScore >= 70 ? '#4CAF50' : '#F44336' }]}>
            <Text style={styles.scoreText}>{lastScore}/100</Text>
          </View>
        )}

        {hasPendingCapture && <Text style={styles.captureHint}>{t('Previous capture is saved on this device. Check upload status before taking another.')}</Text>}
        {captureRecoveryFailed && <Text style={styles.captureHint}>{t('Saved captures could not be checked. Reopen this screen before taking another.')}</Text>}
        {mode === 'video' && <Text style={styles.captureHint}>{t('Video records microphone audio.')}</Text>}
      </ScrollView>

      <View style={styles.captureButtonContainer}>
        <TouchableOpacity
          style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
          accessibilityRole="button" accessibilityLabel={t(isRecording ? 'Stop recording' : hasPendingCapture ? 'Check upload status' : mode === 'video' ? 'Record video' : 'Take photo')} onPress={captureInApp}
          disabled={(isProcessing && !isRecording) || !captureRecoveryReady || (!hasPendingCapture && hasCameraPermission === true && !cameraReady)}
        >
          {isRecording ? <View style={styles.stopRecording} /> : isProcessing ? (
            <ActivityIndicator size="large" color="#0A0A0A" />
          ) : (
            <View style={styles.captureInner} />
          )}
        </TouchableOpacity>
        <Text style={styles.captureHint}>
          {isRecording ? t('Stop recording') : isProcessing ? t('Processing...') : hasPendingCapture ? t('Check upload status') : mode === 'video' ? t('Tap to record in app') : t('Tap to capture in app')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraPreview: { height: 360, overflow: 'hidden', borderRadius: 16, backgroundColor: '#161616', justifyContent: 'center', alignItems: 'center' },
  stopRecording: { width: 32, height: 32, borderRadius: 4, backgroundColor: '#E53935' },
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  previewArea: {
    flexGrow: 1,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  backArrow: { minWidth: 48, minHeight: 48, justifyContent: 'center',
    marginBottom: 20,
    padding: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 20,
  },
  modeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(0,212,255,0.3)',
    borderWidth: 1,
    borderColor: '#00D4FF',
  },
  modeText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  modeTextActive: { color: '#00D4FF' },
  watermarkPreview: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginVertical: 16,
    alignSelf: 'flex-start',
  },
  watermarkPreviewText: {
    color: '#FFF',
    fontSize: 13,
    textAlign: 'left',
    lineHeight: 20,
  },
  templateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 25,
    alignSelf: 'flex-start',
    marginVertical: 8,
  },
  templateToggleText: {
    color: '#FFF',
    fontSize: 14,
    marginHorizontal: 8,
    fontWeight: '600',
  },
  templatePicker: {
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderRadius: 14,
    padding: 12,
    marginVertical: 8,
    width: '100%',
    maxHeight: 300,
  },
  pickerTitle: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
  templateOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4 },
  templateOptionSelected: { backgroundColor: 'rgba(0,212,255,0.15)' },
  templateOptionTitle: { color: '#FFF', fontSize: 15, fontWeight: '500' },
  templateOptionTitleSelected: { color: '#00D4FF', fontWeight: '700' },
  templateOptionDesc: { color: '#AAA', fontSize: 12, marginTop: 2 },
  scoreBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginVertical: 8,
  },
  scoreText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  muteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    alignSelf: 'flex-start',
    marginVertical: 8,
  },
  muteToggleText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
  },
  captureButtonContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#0A0A0A',
  },
  captureHint: {
    color: '#FFF',
    fontSize: 13,
    opacity: 0.8,
  },
  errorText: { color: '#FFF', fontSize: 18, marginBottom: 24, textAlign: 'center' },
  backButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', backgroundColor: '#00D4FF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  backButtonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
});
