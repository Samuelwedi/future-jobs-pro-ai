import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator,
  Image, Modal, SafeAreaView, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Audio, Video, ResizeMode } from 'expo-av';   // ✅ correct import

export default function MonthMediaTypeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { projectId, yearMonth, projectName, mediaType } = route.params || {};
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    if (projectId && yearMonth && mediaType) {
      fetchMedia();
    } else {
      setLoading(false);
    }
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const fetchMedia = async () => {
    try {
      const res: any = await api.get(`/media/project/${projectId}/month/${yearMonth}`);
      const mediaItems = res.media || [];
      const filtered = mediaItems.filter((item: any) => item && item.type === mediaType);
      setMedia(filtered);
    } catch (e) {
      console.error('Fetch error:', e);
      Alert.alert('Error', 'Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAudio = async (url: string) => {
    if (!url) {
      Alert.alert('Audio Not Available', 'This voice note does not have an audio file.');
      return;
    }
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setIsPlaying(false);
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (error) {
      Alert.alert('Error', 'Could not play audio');
    }
  };

  const handleStopAudio = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPlaying(false);
    }
  };

  const renderMediaItem = ({ item }: { item: any }) => {
    if (!item || !item.type) return null;

    const isPhoto = item.type === 'photo';
    const isVideo = item.type === 'video';
    const isVoice = item.type === 'voice_note';
    const hasAudio = isVoice && item.url && item.url !== 'null' && item.url !== '';

    return (
      <TouchableOpacity
        style={styles.mediaCard}
        onPress={() => {
          if (isVoice) {
            if (hasAudio) {
              if (isPlaying) {
                handleStopAudio();
              } else {
                handlePlayAudio(item.url);
              }
            } else {
              Alert.alert('Audio Not Available', 'This voice note does not have an audio file.');
            }
            return;
          }
          setSelectedMedia(item);
        }}
      >
        {isPhoto && (
          <Image source={{ uri: item.url }} style={styles.thumbnail} />
        )}
        {isVideo && (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons name="videocam" size={32} color="#FFF" />
            <Text style={styles.thumbnailLabel}>Video</Text>
          </View>
        )}
        {isVoice && (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons
              name={isPlaying ? 'pause-circle' : hasAudio ? 'play-circle' : 'alert-circle'}
              size={32}
              color={hasAudio ? '#00D4FF' : '#888'}
            />
            <Text style={[styles.thumbnailLabel, !hasAudio && { color: '#888' }]}>
              {isPlaying ? 'Playing...' : hasAudio ? 'Tap to Play' : 'No Audio'}
            </Text>
          </View>
        )}
        <View style={styles.mediaInfo}>
          <Text style={styles.mediaType}>
            {isPhoto ? '📷 Photo' : isVideo ? '🎬 Video' : '🎙️ Voice Note'}
          </Text>
          <Text style={styles.mediaDate}>
            {item.taken_at ? new Date(item.taken_at).toLocaleString() : 'Unknown date'}
          </Text>
          {item.transcript && (
            <Text style={styles.transcriptPreview} numberOfLines={2}>
              {item.transcript}
            </Text>
          )}
          {item.verification_hash && (
            <Text style={styles.hash}>🔒 {item.verification_hash}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setSelectedMedia(item)}
          style={styles.openBtn}
        >
          <MaterialIcons name="open-in-new" size={24} color="#00D4FF" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const closeModal = () => {
    setSelectedMedia(null);
    setVideoLoading(false);
    setVideoError(false);
    if (soundRef.current) {
      soundRef.current.stopAsync();
      soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPlaying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  const typeLabels: Record<string, string> = {
    photo: 'Photos',
    video: 'Videos',
    voice_note: 'Voice Notes',
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {projectName || 'Project'} - {yearMonth || ''} - {typeLabels[mediaType || ''] || mediaType || 'Media'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={media}
        keyExtractor={(item, index) => (item && item.id ? `${item.id}-${item.type}` : `item-${index}`)}
        renderItem={renderMediaItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No {typeLabels[mediaType || ''] || 'media'} for this month</Text>
        }
      />

      <Modal
        visible={!!selectedMedia}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <TouchableOpacity style={styles.closeModalBtn} onPress={closeModal}>
            <Ionicons name="arrow-back" size={28} color="#FFF" />
          </TouchableOpacity>

          {selectedMedia && (
            <View style={styles.modalContent}>
              {selectedMedia.type === 'photo' && (
                <Image
                  source={{ uri: selectedMedia.url }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              )}

              {selectedMedia.type === 'video' && (
                <View style={styles.videoContainer}>
                  {videoLoading && (
                    <ActivityIndicator size="large" color="#00D4FF" style={styles.videoLoading} />
                  )}
                  {videoError ? (
                    <View style={styles.videoErrorContainer}>
                      <Ionicons name="alert-circle" size={48} color="#F44336" />
                      <Text style={styles.videoErrorText}>Could not load video</Text>
                      <TouchableOpacity onPress={() => { setVideoError(false); setVideoLoading(true); }}>
                        <Text style={{ color: '#00D4FF', marginTop: 8 }}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Video
                      ref={videoRef}
                      source={{ uri: selectedMedia.url }}
                      style={styles.fullVideo}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={true}
                      useNativeControls={true}
                      isLooping={false}
                      onLoadStart={() => setVideoLoading(true)}
                      onLoad={() => setVideoLoading(false)}
                      onError={(error: any) => {
                        setVideoLoading(false);
                        setVideoError(true);
                        console.error('Video error:', error);
                      }}
                    />
                  )}
                </View>
              )}

              {selectedMedia.type === 'voice_note' && (
                <View style={styles.voicePlayer}>
                  {selectedMedia.url && selectedMedia.url !== 'null' ? (
                    <>
                      <TouchableOpacity
                        style={styles.playBtn}
                        onPress={() => {
                          if (isPlaying) {
                            handleStopAudio();
                          } else {
                            handlePlayAudio(selectedMedia.url);
                          }
                        }}
                      >
                        <Ionicons
                          name={isPlaying ? 'pause-circle' : 'play-circle'}
                          size={64}
                          color="#00D4FF"
                        />
                      </TouchableOpacity>
                      <Text style={styles.voiceTranscript}>
                        {selectedMedia.transcript || 'No transcript available'}
                      </Text>
                      {selectedMedia.duration && (
                        <Text style={styles.voiceDuration}>
                          Duration: {selectedMedia.duration}s
                        </Text>
                      )}
                    </>
                  ) : (
                    <View style={styles.noAudioContainer}>
                      <Ionicons name="alert-circle" size={64} color="#888" />
                      <Text style={styles.noAudioText}>Audio file not available</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.modalMeta}>
                <Text style={styles.modalDate}>
                  {selectedMedia.taken_at ? new Date(selectedMedia.taken_at).toLocaleString() : 'Unknown date'}
                </Text>
                {selectedMedia.verification_hash && (
                  <Text style={styles.modalHash}>
                    🔒 {selectedMedia.verification_hash}
                  </Text>
                )}
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 12,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  mediaCard: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  thumbnailPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailLabel: {
    color: '#FFF',
    fontSize: 10,
    marginTop: 4,
  },
  mediaInfo: { flex: 1 },
  mediaType: { color: '#00D4FF', fontSize: 14, fontWeight: '600' },
  mediaDate: { color: '#888', fontSize: 12, marginTop: 2 },
  transcriptPreview: { color: '#CCC', fontSize: 12, marginTop: 2 },
  hash: { color: '#4CAF50', fontSize: 11, marginTop: 2 },
  openBtn: { padding: 8 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    paddingTop: 60,
  },
  closeModalBtn: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  modalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
  videoContainer: {
    width: '100%',
    height: '80%',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullVideo: {
    width: '100%',
    height: '100%',
  },
  videoLoading: {
    position: 'absolute',
  },
  videoErrorContainer: {
    alignItems: 'center',
  },
  videoErrorText: {
    color: '#F44336',
    marginTop: 8,
  },
  voicePlayer: {
    alignItems: 'center',
    padding: 20,
  },
  playBtn: {
    marginBottom: 20,
  },
  voiceTranscript: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  voiceDuration: {
    color: '#888',
    fontSize: 14,
  },
  noAudioContainer: {
    alignItems: 'center',
    padding: 20,
  },
  noAudioText: {
    color: '#888',
    fontSize: 18,
    marginTop: 12,
  },
  modalMeta: {
    marginTop: 16,
    alignItems: 'center',
  },
  modalDate: {
    color: '#AAA',
    fontSize: 14,
  },
  modalHash: {
    color: '#4CAF50',
    fontSize: 13,
    marginTop: 4,
  },
});