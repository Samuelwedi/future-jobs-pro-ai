import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

const NUM_COLUMNS = 3;
const SPACING = 4;
const ITEM_SIZE = (350 - SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

interface Photo {
  id: string;
  s3_key: string;
  taken_at: string;
  compliance_score: number;
  taken_by?: string;
}

export default function ProjectAlbumScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // ---------- SAFE PARAMS (prevents "Cannot read property 'projectId' of undefined") ----------
  const projectId: string = route?.params?.projectId || '';
  const projectName: string = route?.params?.projectName || 'Project Album';

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  const fetchPhotos = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ success: boolean; photos: Photo[] }>(
        `/photos/project/${projectId}`
      );
      // Keep only Cloudinary URLs (skip old local paths)
      const cloudPhotos = (res.photos || []).filter(p => p.s3_key?.startsWith('http'));
      setPhotos(cloudPhotos);
    } catch (e) {
      console.error('Failed to load album', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchPhotos(); }, [projectId]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchPhotos();
  };

  const renderPhoto = ({ item }: { item: Photo }) => (
    <TouchableOpacity onPress={() => setSelectedPhoto(item)}>
      <Image source={{ uri: item.s3_key }} style={styles.photoThumb} resizeMode="cover" />
      {item.compliance_score !== undefined && (
        <View
          style={[
            styles.scoreBadge,
            item.compliance_score >= 70 ? styles.scorePass : styles.scoreFail,
          ]}
        >
          <Text style={styles.scoreText}>{item.compliance_score}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // ---------- Fallback when no projectId ----------
  if (loading) {
    return (
      <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />
    );
  }

  if (!projectId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Project Album</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyState}>
          <MaterialIcons name="photo-library" size={64} color="#888" />
          <Text style={styles.emptyText}>No project selected</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.headerTitle}>{projectName}</Text>
          <Text style={styles.headerSubtitle}>
            {photos.length} photo{photos.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={photos}
        renderItem={renderPhoto}
        keyExtractor={item => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={styles.grid}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No photos yet. Take some new photos!</Text>
        }
      />

      {/* Full‑screen photo modal */}
      <Modal visible={!!selectedPhoto} animationType="fade" transparent>
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedPhoto(null)}>
            <MaterialIcons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          {selectedPhoto && (
            <Image
              source={{ uri: selectedPhoto.s3_key }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          {selectedPhoto?.taken_by && (
            <Text style={styles.fullscreenBy}>Taken by: {selectedPhoto.taken_by}</Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 2 },
  grid: { padding: SPACING },
  photoThumb: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: SPACING / 2,
    borderRadius: 6,
  },
  scoreBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  scorePass: { backgroundColor: '#4CAF50' },
  scoreFail: { backgroundColor: '#F44336' },
  scoreText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: '#888', fontSize: 18, marginTop: 16, marginBottom: 24 },
  backBtn: {
    backgroundColor: '#00D4FF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backBtnText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 60, right: 20, zIndex: 10 },
  fullscreenImage: { width: '100%', height: '80%' },
  fullscreenBy: { color: '#888', fontSize: 14, marginTop: 12 },
});