import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import * as Haptics from 'expo-haptics';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

interface UploadResponse {
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

const TEMPLATES = [
  { id: 'standard', label: 'Standard', desc: 'Date, Time, GPS, App name' },
  { id: 'minimal', label: 'Minimal', desc: 'Date & Time only' },
  { id: 'detailed', label: 'Detailed', desc: 'All details + Altitude, Weather' },
  { id: 'map-style', label: 'Map Style', desc: 'GPS + Google Maps link' },
];

export default function CameraView() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const projectId: string = route?.params?.projectId || '';
  const timeEntryId: string = route?.params?.timeEntryId || '';

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [watermarkTemplate, setWatermarkTemplate] = useState('standard');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [muteAudio, setMuteAudio] = useState(false);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    (async () => {
      // Request camera permission
      const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
      setHasCameraPermission(camStatus === 'granted');

      // Request microphone permission (only needed for video)
      if (Platform.OS !== 'web') {
        const { status: audioStatus } = await Audio.requestPermissionsAsync();
        setHasAudioPermission(audioStatus === 'granted');
      }

      fetchLocation();
    })();
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
    if (currentLocation) return currentLocation;
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
    else Alert.alert('Info', 'Return to the previous screen.');
  };

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

  const uploadFile = async (uri: string, isVideo: boolean = false) => {
    setIsProcessing(true);
    try {
      const loc = await ensureLocation();

      const extraFields: Record<string, string> = {
        userId: user?.id || '',
        projectId,
        template: watermarkTemplate,
      };
      if (timeEntryId) extraFields.timeEntryId = timeEntryId;
      if (loc) {
        extraFields.latitude = loc.coords.latitude.toString();
        extraFields.longitude = loc.coords.longitude.toString();
        if (loc.coords.altitude) extraFields.altitude = loc.coords.altitude.toString();
        if (loc.coords.heading) extraFields.direction = loc.coords.heading.toString();
        if (address) extraFields.address = address;
      } else {
        console.warn('⚠️ No location available – watermark will show placeholders');
      }

      if (isVideo) extraFields.fileType = 'video';

      const response = await api.uploadFileWithData<UploadResponse>(
        '/photos/upload',
        uri,
        extraFields,
        'file'
      );

      const score = response?.compliance?.score ?? 0;
      const passed = response?.compliance?.passed ?? false;
      const issues = response?.compliance?.issues ?? [];
      const suggestions = response?.compliance?.suggestions ?? [];

      if (isMounted.current) setLastScore(score);

      api.recordAIEvent(isVideo ? 'video_taken' : 'photo_taken', {
        complianceScore: score,
        issues,
        projectId,
        fileType: isVideo ? 'video' : 'image',
      }, loc ? { lat: loc.coords.latitude, lng: loc.coords.longitude } : undefined).catch(() => {});

      if (passed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(`✅ ${isVideo ? 'Video' : 'Photo'} Approved`, `Compliance Score: ${score}/100\n\nThis will hold up in any dispute.`, [
          { text: 'Take Another', style: 'cancel' },
          { text: 'Done', onPress: goBack },
        ]);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          `⚠️ ${isVideo ? 'Video' : 'Photo'} Needs Improvement`,
          `Score: ${score}/100\n\nIssues:\n• ${issues.join('\n• ')}\n\nSuggestions:\n• ${suggestions.join('\n• ')}`,
          [
            { text: 'Retake', style: 'cancel' },
            { text: 'Upload Anyway', style: 'destructive', onPress: goBack },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'Could not upload. Please check your connection.');
    } finally {
      if (isMounted.current) setIsProcessing(false);
    }
  };

  const launchNativeCamera = async () => {
    if (hasCameraPermission === false) {
      Alert.alert('Permission required', 'Please grant camera permission.');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setHasCameraPermission(status === 'granted');
      if (status !== 'granted') return;
    }

    // For video, check audio permission
    if (mode === 'video' && hasAudioPermission === false) {
      const { status } = await Audio.requestPermissionsAsync();
      setHasAudioPermission(status === 'granted');
      if (status !== 'granted') {
        Alert.alert('Audio required', 'Microphone permission is needed for video recording.');
        return;
      }
    }

    setIsProcessing(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: mode === 'photo' 
          ? ImagePicker.MediaTypeOptions.Images 
          : ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.9,
        videoMaxDuration: 1800, // 30 minutes max
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const isVideo = asset.type === 'video';
        await uploadFile(asset.uri, isVideo);
      } else {
        // User cancelled – do nothing
        if (isMounted.current) setIsProcessing(false);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to launch camera.');
      if (isMounted.current) setIsProcessing(false);
    } finally {
      // We'll set isProcessing false inside uploadFile or here if cancelled
      if (!isMounted.current) return;
      // If the upload hasn't started, reset processing flag
      // But uploadFile will set it false on completion.
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
  previewLines.push('📍 ' + (address || 'Getting location...'));
  previewLines.push('🕐 ' + now.toLocaleString());
  if (currentLocation) {
    const lat = currentLocation.coords.latitude.toFixed(6);
    const lng = currentLocation.coords.longitude.toFixed(6);
    previewLines.push(`🛰️ ${lat}°N, ${lng}°W`);
  } else {
    previewLines.push('🛰️ Getting GPS...');
  }
  if (watermarkTemplate === 'map-style' && currentLocation) {
    previewLines.push(`maps.google.com/?q=${currentLocation.coords.latitude},${currentLocation.coords.longitude}`);
  }
  if (watermarkTemplate === 'detailed') {
    previewLines.push('🌡️ Altitude: -- m   Weather: --');
  }

  return (
    <View style={styles.container}>
      <View style={styles.previewArea}>
        <TouchableOpacity style={styles.backArrow} onPress={goBack}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'photo' && styles.modeBtnActive]}
            onPress={() => setMode('photo')}
          >
            <Text style={[styles.modeText, mode === 'photo' && styles.modeTextActive]}>📸 Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'video' && styles.modeBtnActive]}
            onPress={() => setMode('video')}
          >
            <Text style={[styles.modeText, mode === 'video' && styles.modeTextActive]}>🎬 Video</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.watermarkPreview}>
          {previewLines.map((line, idx) => (
            <Text key={idx} style={styles.watermarkPreviewText}>{line}</Text>
          ))}
        </View>

        <TouchableOpacity
          style={styles.templateToggle}
          onPress={() => setShowTemplatePicker(!showTemplatePicker)}
        >
          <MaterialIcons name="style" size={22} color="#FFF" />
          <Text style={styles.templateToggleText}>
            {TEMPLATES.find(t => t.id === watermarkTemplate)?.label || watermarkTemplate}
          </Text>
        </TouchableOpacity>

        {showTemplatePicker && (
          <View style={styles.templatePicker}>
            <Text style={styles.pickerTitle}>Watermark Style</Text>
            {TEMPLATES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.templateOption, watermarkTemplate === t.id && styles.templateOptionSelected]}
                onPress={() => {
                  setWatermarkTemplate(t.id);
                  setShowTemplatePicker(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.templateOptionTitle, watermarkTemplate === t.id && styles.templateOptionTitleSelected]}>
                    {t.label}
                  </Text>
                  <Text style={styles.templateOptionDesc}>{t.desc}</Text>
                </View>
                {watermarkTemplate === t.id && (
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

        {mode === 'video' && (
          <TouchableOpacity
            style={styles.muteToggle}
            onPress={() => setMuteAudio(!muteAudio)}
          >
            <MaterialIcons
              name={muteAudio ? 'mic-off' : 'mic'}
              size={24}
              color="#FFF"
            />
            <Text style={styles.muteToggleText}>
              {muteAudio ? 'Muted' : 'Audio'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.captureButtonContainer}>
        <TouchableOpacity
          style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
          onPress={launchNativeCamera}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="large" color="#0A0A0A" />
          ) : (
            <View style={styles.captureInner} />
          )}
        </TouchableOpacity>
        <Text style={styles.captureHint}>
          {isProcessing ? 'Processing...' : mode === 'video' ? 'Tap to Record (native app)' : 'Tap to Capture (native app)'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  previewArea: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  backArrow: {
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
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
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
  backButton: { backgroundColor: '#00D4FF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  backButtonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
});