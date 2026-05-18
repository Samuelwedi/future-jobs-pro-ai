import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { CameraView as ExpoCamera, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useRoute, useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import * as Haptics from 'expo-haptics';

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
}

export default function CameraView() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const projectId: string = route?.params?.projectId || '';
  const timeEntryId: string = route?.params?.timeEntryId || '';

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission]);

  useEffect(() => {
    (async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        setCurrentLocation(loc);
      } catch (e) { /* proceed without GPS */ }
    })();
  }, []);

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

  const takePhoto = async () => {
    if (!cameraRef.current || isTakingPicture) return;
    setIsTakingPicture(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, exif: true });
      const response = await api.uploadFile<UploadResponse>('/photos/upload', photo.uri, 'photo');

      const score = response?.compliance?.score ?? 0;
      const passed = response?.compliance?.passed ?? false;
      const issues = response?.compliance?.issues ?? [];
      const suggestions = response?.compliance?.suggestions ?? [];

      api.recordAIEvent('photo_taken', {
        complianceScore: score,
        issues,
        projectId,
      }, currentLocation ? { lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude } : undefined).catch(() => {});

      if (passed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('✅ Photo Approved', `Compliance Score: ${score}/100\n\nThis photo will hold up in any dispute.`, [
          { text: 'Take Another', style: 'cancel' },
          { text: 'Done', onPress: goBack },
        ]);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          '⚠️ Photo Needs Improvement',
          `Score: ${score}/100\n\nIssues:\n• ${issues.join('\n• ')}\n\nSuggestions:\n• ${suggestions.join('\n• ')}`,
          [
            { text: 'Retake', style: 'cancel' },
            { text: 'Upload Anyway', style: 'destructive', onPress: goBack },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'Could not upload photo. Please check your connection.');
    } finally {
      setIsTakingPicture(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color="#00D4FF" /></View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Camera permission denied</Text>
        <TouchableOpacity style={styles.backButton} onPress={goBack}><Text style={styles.backButtonText}>Go Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoCamera ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.captureButtonContainer}>
          <TouchableOpacity style={styles.captureButton} onPress={takePhoto} disabled={isTakingPicture}>
            <View style={[styles.captureInner, isTakingPicture && styles.captureInnerDisabled]} />
          </TouchableOpacity>
        </View>
      </ExpoCamera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  camera: { flex: 1 },
  captureButtonContainer: { position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' },
  captureButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#0A0A0A' },
  captureInnerDisabled: { backgroundColor: '#AAA' },
  errorText: { color: '#FFF', fontSize: 18, marginBottom: 24, textAlign: 'center' },
  backButton: { backgroundColor: '#00D4FF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  backButtonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
});