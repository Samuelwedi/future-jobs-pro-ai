import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

export default function FoldersScreen() {
  const navigation = useNavigation<any>();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjectsWithRetry();
  }, []);

  const fetchProjectsWithRetry = async (retryCount = 0) => {
    try {
      setError(null);
      const res: any = await api.get('/media/projects');
      setProjects(res.projects || []);
    } catch (e: any) {
      console.error('Fetch projects error:', e);
      if (retryCount < 2) {
        // Retry after 2 seconds
        setTimeout(() => {
          fetchProjectsWithRetry(retryCount + 1);
        }, 2000);
      } else {
        setError('Could not load projects. Please check your connection.');
        Alert.alert('Error', 'Could not load projects. Please check your connection.');
      }
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

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => { setLoading(true); fetchProjectsWithRetry(0); }} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Media Folders</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={projects}
        keyExtractor={(item) => item.project_id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.projectCard}
            onPress={() => navigation.navigate('ProjectMedia', {
              projectId: item.project_id,
              projectName: item.project_name,
            })}
          >
            <MaterialIcons name="folder" size={32} color="#00D4FF" />
            <View style={styles.projectInfo}>
              <Text style={styles.projectName}>{item.project_name}</Text>
              <Text style={styles.projectSub}>Tap to view months</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#888" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No media found</Text>}
      />
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
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  projectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  projectSub: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: '#00D4FF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#0A0A0A',
    fontSize: 16,
    fontWeight: '600',
  },
});