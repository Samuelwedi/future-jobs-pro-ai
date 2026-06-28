import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
  TextInput, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function ProjectsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res: any = await api.get('/projects');
      setProjects(res.projects || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchProjects();
  };

  const handleSaveProject = async () => {
    if (!projectName.trim()) {
      Alert.alert('Error', 'Project name is required');
      return;
    }
    try {
      const payload = {
        name: projectName.trim(),
        client_name: clientName.trim() || null,
        company_id: user?.companyId,
      };
      if (editingProject) {
        await api.put(`/projects/${editingProject.id}`, payload);
        Alert.alert('Success', 'Project updated');
      } else {
        await api.post('/projects', payload);
        Alert.alert('Success', 'Project created');
      }
      setModalVisible(false);
      setProjectName('');
      setClientName('');
      setEditingProject(null);
      fetchProjects();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save project');
    }
  };

  const handleDelete = (project: any) => {
    Alert.alert('Delete Project', `Delete "${project.name}"?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/projects/${project.id}`);
            Alert.alert('Deleted', 'Project removed');
            fetchProjects();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        }
      }
    ]);
  };

  const openEditModal = (project: any) => {
    setEditingProject(project);
    setProjectName(project.name);
    setClientName(project.client_name || '');
    setModalVisible(true);
  };

  const renderProject = ({ item }: { item: any }) => (
    <View style={styles.projectCard}>
      <TouchableOpacity style={styles.projectInfo} onPress={() => navigation.navigate('ProjectAlbum', { projectId: item.id, projectName: item.name })}>
        <Text style={styles.projectName}>{item.name}</Text>
        {item.client_name && <Text style={styles.clientName}>{item.client_name}</Text>}
        <Text style={styles.status}>{item.status || 'active'}</Text>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
          <MaterialIcons name="edit" size={22} color="#00D4FF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
          <MaterialIcons name="delete" size={22} color="#F44336" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#00D4FF" /></View>;
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
        keyExtractor={item => item.id}
        renderItem={renderProject}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={<Text style={styles.emptyText}>No projects yet. Tap + to create one.</Text>}
      />

      <TouchableOpacity style={styles.fab} onPress={() => { setEditingProject(null); setProjectName(''); setClientName(''); setModalVisible(true); }}>
        <MaterialIcons name="add" size={28} color="#0A0A0A" />
      </TouchableOpacity>

      {/* Modal for Create/Edit */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingProject ? 'Edit Project' : 'New Project'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Project Name"
              placeholderTextColor="#888"
              value={projectName}
              onChangeText={setProjectName}
            />
            <TextInput
              style={styles.input}
              placeholder="Client Name (optional)"
              placeholderTextColor="#888"
              value={clientName}
              onChangeText={setClientName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={handleSaveProject}>
                <Text style={[styles.btnText, { color: '#0A0A0A' }]}>Save</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  list: { padding: 16 },
  projectCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  projectInfo: { flex: 1 },
  projectName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  clientName: { color: '#888', fontSize: 14, marginTop: 2 },
  status: { color: '#4CAF50', fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 6 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
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
  input: { backgroundColor: '#0A0A0A', borderRadius: 10, padding: 12, color: '#FFF', borderWidth: 1, borderColor: '#333', marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  cancelBtn: { borderWidth: 1, borderColor: '#888' },
  saveBtn: { backgroundColor: '#00D4FF' },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
});