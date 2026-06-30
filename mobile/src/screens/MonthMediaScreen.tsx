import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

export default function MonthMediaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { projectId, yearMonth, projectName } = route.params || {};
  const [counts, setCounts] = useState({ photos: 0, videos: 0, voice_notes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId && yearMonth) {
      fetchCounts();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchCounts = async () => {
    try {
      console.log('📱 [MonthMedia] Fetching counts for:', { projectId, yearMonth });
      const res: any = await api.get(`/media/project/${projectId}/month/${yearMonth}`);
      const mediaItems = res.media || [];
      const photos = mediaItems.filter((m: any) => m && m.type === 'photo').length;
      const videos = mediaItems.filter((m: any) => m && m.type === 'video').length;
      const voice_notes = mediaItems.filter((m: any) => m && m.type === 'voice_note').length;
      setCounts({ photos, videos, voice_notes });
    } catch (e) {
      console.error('📱 [MonthMedia] Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  const folders = [
    { type: 'photo', label: 'Photos', icon: 'photo-library', count: counts.photos, color: '#00D4FF' },
    { type: 'video', label: 'Videos', icon: 'videocam', count: counts.videos, color: '#FF9800' },
    { type: 'voice_note', label: 'Voice Notes', icon: 'mic', count: counts.voice_notes, color: '#4CAF50' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {projectName || 'Project'} - {yearMonth || ''}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.folderGrid}>
        {folders.map((folder) => (
          <TouchableOpacity
            key={folder.type}
            style={[styles.folderCard, { borderColor: folder.color }]}
            onPress={() => {
              console.log(`📱 [MonthMedia] Navigating to ${folder.type} with params:`, { projectId, yearMonth, projectName, mediaType: folder.type });
              navigation.navigate('MonthMediaType', {
                projectId,
                yearMonth,
                projectName,
                mediaType: folder.type,
              });
            }}
          >
            <MaterialIcons name={folder.icon as any} size={40} color={folder.color} />
            <Text style={styles.folderLabel}>{folder.label}</Text>
            <Text style={styles.folderCount}>{folder.count} items</Text>
          </TouchableOpacity>
        ))}
      </View>
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
  folderGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    alignContent: 'flex-start',
    padding: 16,
  },
  folderCard: {
    width: '45%',
    aspectRatio: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
    padding: 16,
  },
  folderLabel: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
  },
  folderCount: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
});