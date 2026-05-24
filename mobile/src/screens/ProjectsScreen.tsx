import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface Project {
  id: string;
  name: string;
  client_name: string;
  address: string;
  status: string;
  created_at: string;
}

export default function ProjectsScreen() {
  const navigation = useNavigation<any>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProjects = async () => {
    try {
      const response = await api.get<{ success: boolean; projects: Project[] }>('/projects/active');
      setProjects(response.projects || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProjects();
  };

  const renderProject = ({ item }: { item: Project }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() =>
        navigation.navigate('ProjectAlbum', {
          projectId: item.id,
          projectName: item.name,
        })
      }
    >
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{item.name}</Text>
        <Text style={styles.clientName}>{item.client_name}</Text>
        <Text style={styles.address}>{item.address || 'No address'}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#888" />
    </TouchableOpacity>
  );

  if (isLoading) {
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
        <Text style={styles.headerTitle}>Projects</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={renderProject}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No projects found</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginLeft: 16 },
  listContent: { paddingHorizontal: 20 },
  projectCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  projectInfo: { flex: 1 },
  projectName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  clientName: { color: '#888', fontSize: 14, marginTop: 4 },
  address: { color: '#888', fontSize: 12, marginTop: 4 },
  emptyText: { color: '#888', fontSize: 16, textAlign: 'center', marginTop: 40 },
});