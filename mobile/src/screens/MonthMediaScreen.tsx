import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  ActivityIndicator, Image, Modal, Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Audio, Video } from 'expo-av';

const { width, height } = Dimensions.get('window');

type MediaItem = {
  id: string;
  type: 'photo' | 'video' | 'voice_note';
  url: string;
  taken_at: string;
  metadata?: any;
  verification_hash?: string;
  transcript?: string;
  duration?: string;
};

export default function MonthMediaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { projectId, yearMonth, projectName } = route.params;
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    fetchMedia();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const fetchMedia = async () => {
    try {
      const res: any = await api.get(`/media/project/${projectId}/month/${yearMonth}`);
      setMedia(res.media || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openMedia = (item: MediaItem) => {
    setSelectedItem(item);
    setIsModalVisible(true);
    setIsPlaying(false);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setSelectedItem(null);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.stopAsync();
    }
    if (soundRef.current) {
      soundRef.current.stopAsync();
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  };

  const playVoiceNote = async () => {
    if (!selectedItem || selectedItem.type !== 'voice_note') return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: selectedItem.url },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      // @ts-ignore – didJustFinish exists on success status
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (error) {
      console.error('Error playing voice note:', error);
      setIsPlaying(false);
    }
  };

  const togglePlayVoice = () => {
    if (isPlaying) {
      soundRef.current?.pauseAsync();
      setIsPlaying(false);
    } else {
      playVoiceNote();
    }
  };

  const renderMediaItem = ({ item }: { item: MediaItem }) => {
    const isPhoto = item.type === 'photo';
    const isVideo = item.type === 'video';
    const isVoice = item.type === 'voice_note';

    return (
      <TouchableOpacity style={styles.mediaCard} onPress={() => openMedia(item)}>
        {isPhoto && <Image source={{ uri: item.url }} style={styles.thumbnail} />}
        {isVideo && (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons name="videocam" size={32} color="#FFF" />
            <Text style={styles.thumbnailLabel}>Video</Text>
          </View>
        )}
        {isVoice && (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons name="mic" size={32} color="#FFF" />
            <Text style={styles.thumbnailLabel}>Voice Note</Text>
          </View>
        )}
        <View style={styles.mediaInfo}>
          <Text style={styles.mediaType}>{isPhoto ? '📷 Photo' : isVideo ? '🎬 Video' : '🎙️ Voice Note'}</Text>
          <Text style={styles.mediaDate}>{new Date(item.taken_at).toLocaleString()}</Text>
          {item.transcript && <Text style={styles.transcriptPreview} numberOfLines={2}>{item.transcript}</Text>}
          {item.verification_hash && <Text style={styles.hash}>🔒 {item.verification_hash}</Text>}
          {item.duration && <Text style={styles.duration}>⏱️ {item.duration}s</Text>}
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#888" />
      </TouchableOpacity>
    );
  };

  const renderModalContent = () => {
    if (!selectedItem) return null;

    if (selectedItem.type === 'photo') {
      return (
        <Image source={{ uri: selectedItem.url }} style={styles.fullscreenImage} resizeMode="contain" />
      );
    }

    if (selectedItem.type === 'video') {
      return (
        <Video
          ref={videoRef}
          source={{ uri: selectedItem.url }}
          style={styles.fullscreenVideo}
          useNativeControls
          resizeMode="contain"
          shouldPlay
          isLooping={false}
        />
      );
    }

    if (selectedItem.type === 'voice_note') {
      return (
        <View style={styles.voiceNotePlayer}>
          <TouchableOpacity style={styles.playButton} onPress={togglePlayVoice}>
            <Ionicons name={isPlaying ? 'pause-circle' : 'play-circle'} size={80} color="#00D4FF" />
          </TouchableOpacity>
          <Text style={styles.voiceNoteTranscript}>{selectedItem.transcript || 'No transcript available'}</Text>
          {selectedItem.duration && <Text style={styles.voiceNoteDuration}>Duration: {selectedItem.duration}s</Text>}
          {selectedItem.verification_hash && <Text style={styles.hash}>🔒 {selectedItem.verification_hash}</Text>}
        </View>
      );
    }

    return null;
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#00D4FF" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{projectName} - {yearMonth}</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={media}
        keyExtractor={item => item.id}
        renderItem={renderMediaItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No media for this month</Text>}
      />

      {/* Modal for viewing media */}
      <Modal visible={isModalVisible} animationType="fade" transparent={false}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.modalContent}>
            {renderModalContent()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', flex: 1, marginLeft: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  mediaCard: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  thumbnail: { width: 80, height: 80, borderRadius: 8, marginRight: 12 },
  thumbnailPlaceholder: { width: 80, height: 80, borderRadius: 8, marginRight: 12, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  thumbnailLabel: { color: '#AAA', fontSize: 10, marginTop: 4 },
  mediaInfo: { flex: 1 },
  mediaType: { color: '#00D4FF', fontSize: 14, fontWeight: '600' },
  mediaDate: { color: '#888', fontSize: 12, marginTop: 2 },
  transcriptPreview: { color: '#CCC', fontSize: 12, marginTop: 2 },
  hash: { color: '#4CAF50', fontSize: 11, marginTop: 2 },
  duration: { color: '#888', fontSize: 11, marginTop: 2 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },

  modalContainer: { flex: 1, backgroundColor: '#000' },
  closeButton: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  modalContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullscreenImage: { width: '100%', height: '80%' },
  fullscreenVideo: { width: '100%', height: '80%' },
  voiceNotePlayer: { alignItems: 'center', padding: 20 },
  playButton: { marginBottom: 20 },
  voiceNoteTranscript: { color: '#FFF', fontSize: 16, textAlign: 'center', marginBottom: 10 },
  voiceNoteDuration: { color: '#888', fontSize: 14, marginBottom: 10 },
});