import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

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

  const counts = {
    photos: media.filter(m => m.type === 'photo').length,
    videos: media.filter(m => m.type === 'video').length,
    voiceNotes: media.filter(m => m.type === 'voice_note').length,
  };

  const total = media.length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {projectName} - {yearMonth}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.totalText}>{total} total media items</Text>

        <View style={styles.foldersGrid}>
          {/* Photos Folder */}
          <TouchableOpacity
            style={[styles.folderCard, { borderColor: '#00D4FF' }]}
            onPress={() => navigation.navigate('MediaList', { projectId, yearMonth, projectName, type: 'photo', title: 'Photos' })}
          >
            <View style={[styles.folderIcon, { backgroundColor: '#00D4FF20' }]}>
              <MaterialIcons name="photo" size={40} color="#00D4FF" />
            </View>
            <Text style={styles.folderName}>Photos</Text>
            <Text style={styles.folderCount}>{counts.photos} files</Text>
          </TouchableOpacity>

          {/* Videos Folder */}
          <TouchableOpacity
            style={[styles.folderCard, { borderColor: '#FF9800' }]}
            onPress={() => navigation.navigate('MediaList', { projectId, yearMonth, projectName, type: 'video', title: 'Videos' })}
          >
            <View style={[styles.folderIcon, { backgroundColor: '#FF980020' }]}>
              <MaterialIcons name="videocam" size={40} color="#FF9800" />
            </View>
            <Text style={styles.folderName}>Videos</Text>
            <Text style={styles.folderCount}>{counts.videos} files</Text>
          </TouchableOpacity>

          {/* Voice Notes Folder */}
          <TouchableOpacity
            style={[styles.folderCard, { borderColor: '#4CAF50' }]}
            onPress={() => navigation.navigate('MediaList', { projectId, yearMonth, projectName, type: 'voice_note', title: 'Voice Notes' })}
          >
            <View style={[styles.folderIcon, { backgroundColor: '#4CAF5020' }]}>
              <MaterialIcons name="mic" size={40} color="#4CAF50" />
            </View>
            <Text style={styles.folderName}>Voice Notes</Text>
            <Text style={styles.folderCount}>{counts.voiceNotes} files</Text>
          </TouchableOpacity>
        </View>

        {total === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No media for this month</Text>
          </View>
        )}
      </ScrollView>
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
  content: { padding: 16, flexGrow: 1 },
  totalText: {
    color: '#888',
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  folderCard: {
    width: '48%',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 16,
  },
  folderIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  folderName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  folderCount: {
    color: '#888',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
  },
});