import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

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
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [creating, setCreating] = useState(false);

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

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        setSelectedFile({ uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
      }
    } catch (err) {
      console.error('File pick error:', err);
      Alert.alert('Error', 'Could not select file');
    }
  };

  const handleCreateProject = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Project name is required');
      return;
    }
    setCreating(true);
    try {
      // First create the project
      const projectRes = await api.post<{ success: boolean; project: Project }>('/projects', {
        name: newName.trim(),
        client_name: newClientName.trim() || null,
        address: newAddress.trim() || null,
      });
      const projectId = projectRes.project.id;

      // If a file was selected, upload it using fetch (since api.post doesn't support FormData)
      if (selectedFile) {
        const token = await api.getToken(); // assuming api.getToken() exists
        const formData = new FormData();
        formData.append('file', {
          uri: selectedFile.uri,
          type: selectedFile.type,
          name: selectedFile.name,
        } as any);
        await fetch(`https://future-jobs-pro-ai-production.up.railway.app/api/projects/${projectId}/attachments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          body: formData,
        });
      }

      Alert.alert('Success', 'Project created');
      setModalVisible(false);
      setNewName('');
      setNewClientName('');
      setNewAddress('');
      setSelectedFile(null);
      fetchProjects();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const openMaps = (address: string) => {
    if (!address) return;
    const url = `http://maps.apple.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open maps');
    });
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
        <TouchableOpacity onPress={() => openMaps(item.address)} disabled={!item.address}>
          <Text style={[styles.address, !item.address && styles.addressDisabled]}>
            {item.address || 'No address'}
          </Text>
        </TouchableOpacity>
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

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="add" size={28} color="#0A0A0A" />
      </TouchableOpacity>

      {/* Create Project Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Project</Text>
            <TextInput
              style={styles.input}
              placeholder="Project Name *"
              placeholderTextColor="#888"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={styles.input}
              placeholder="Client Name (optional)"
              placeholderTextColor="#888"
              value={newClientName}
              onChangeText={setNewClientName}
            />
            <TextInput
              style={styles.input}
              placeholder="Address (optional)"
              placeholderTextColor="#888"
              value={newAddress}
              onChangeText={setNewAddress}
            />
            <TouchableOpacity style={styles.fileBtn} onPress={pickFile}>
              <MaterialIcons name="attach-file" size={24} color="#00D4FF" />
              <Text style={styles.fileBtnText}>{selectedFile ? selectedFile.name : 'Attach PDF/Word/Excel (optional)'}</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateProject}
                style={styles.submitBtn}
                disabled={creating}
              >
                <Text style={styles.submitText}>{creating ? 'Creating...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  listContent: { paddingHorizontal: 20, paddingBottom: 80 },
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
  address: { color: '#00D4FF', fontSize: 12, marginTop: 4, textDecorationLine: 'underline' },
  addressDisabled: { color: '#888', textDecorationLine: 'none' },
  emptyText: { color: '#888', fontSize: 16, textAlign: 'center', marginTop: 40 },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#00D4FF',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: {
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    padding: 12,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  fileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  fileBtnText: { color: '#00D4FF', marginLeft: 8, fontSize: 14, flex: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#888' },
  cancelText: { color: '#888' },
  submitBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#00D4FF' },
  submitText: { color: '#0A0A0A', fontWeight: '600' },
});