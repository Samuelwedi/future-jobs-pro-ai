import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

export default function MonthMediaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { projectId, yearMonth, projectName } = route.params;
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMedia();
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

  const renderMediaItem = ({ item }: { item: any }) => {
    const isPhoto = item.type === 'photo';
    const isVideo = item.type === 'video';
    const isVoice = item.type === 'voice_note';

    return (
      <View style={styles.mediaCard}>
        {isPhoto && <Image source={{ uri: item.url }} style={styles.thumbnail} />}
        {isVideo && <View style={styles.thumbnailPlaceholder}><Ionicons name="videocam" size={32} color="#FFF" /></View>}
        {isVoice && <View style={styles.thumbnailPlaceholder}><Ionicons name="mic" size={32} color="#FFF" /></View>}
        <View style={styles.mediaInfo}>
          <Text style={styles.mediaType}>{isPhoto ? '📷 Photo' : isVideo ? '🎬 Video' : '🎙️ Voice Note'}</Text>
          <Text style={styles.mediaDate}>{new Date(item.taken_at).toLocaleString()}</Text>
          {item.transcript && <Text style={styles.transcriptPreview} numberOfLines={2}>{item.transcript}</Text>}
          {item.verification_hash && <Text style={styles.hash}>🔒 {item.verification_hash}</Text>}
        </View>
        <TouchableOpacity onPress={() => { /* Open media viewer – optional */ }}>
          <MaterialIcons name="open-in-new" size={24} color="#00D4FF" />
        </TouchableOpacity>
      </View>
    );
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
  mediaInfo: { flex: 1 },
  mediaType: { color: '#00D4FF', fontSize: 14, fontWeight: '600' },
  mediaDate: { color: '#888', fontSize: 12, marginTop: 2 },
  transcriptPreview: { color: '#CCC', fontSize: 12, marginTop: 2 },
  hash: { color: '#4CAF50', fontSize: 11, marginTop: 2 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
});