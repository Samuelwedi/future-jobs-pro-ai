import { useLang } from '../context/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {checkOnlineStatus} from '../services/offlineService';
import { AdaptiveModal as Modal } from '../components/AdaptiveModal';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
  TextInput,  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function ProjectsScreen() {
  const { t } = useLang();
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [saving,setSaving] = useState(false);
  const [draftLoaded,setDraftLoaded] = useState(false);
  const draftKey = `project-draft:${user?.id || 'signed-out'}`;
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectAddress, setProjectAddress] = useState(''); // NEW

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res: any = await api.get('/projects');
      setProjects((res.projects || []).filter((p:any) => p.status !== 'completed'));
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

  useEffect(() => {
    let live=true;
    AsyncStorage.getItem(draftKey).then(raw=>{if(live&&raw){const d=JSON.parse(raw);setProjectName(d.name||'');setClientName(d.client||'');setProjectAddress(d.address||'');}}).catch(()=>{}).finally(()=>{if(live)setDraftLoaded(true);});
    return()=>{live=false;};
  },[draftKey]);
  useEffect(()=>{if(draftLoaded&&!editingProject)void AsyncStorage.setItem(draftKey,JSON.stringify({name:projectName,client:clientName,address:projectAddress}));},[draftLoaded,editingProject,projectName,clientName,projectAddress,draftKey]);
  const handleSaveProject = async () => {
    if(saving)return;

    if (!projectName.trim()) {
      Alert.alert(t("Error"), t("Project name is required"));
      return;
    }
    setSaving(true);
    try {
      if(!await checkOnlineStatus()) throw new Error(t("You are offline. Your project draft is kept on this device. Reconnect and tap Save."));
      const payload = {
        name: projectName.trim(),
        client_name: clientName.trim() || null,
        address: projectAddress.trim() || null, // include address
        company_id: user?.companyId,
      };
      if (editingProject) {
        await api.put(`/projects/${editingProject.id}`, payload);
        Alert.alert(t("Success"), t("Project updated"));
      } else {
        await api.post('/projects', payload);
        Alert.alert(t("Success"), t("Project created"));
      }
      setModalVisible(false);
      setProjectName('');
      setClientName('');
      setProjectAddress('');
      setEditingProject(null);
      fetchProjects();
    } catch (error: any) {
      Alert.alert(t("Project not saved"), error.response?.data?.message || error.message || t("Failed to save project"));
    } finally {setSaving(false);}
  };

  const handleDelete = (project: any) => {
    Alert.alert(t("Archive Project"), t('Archive "{name}"?', {name:project.name}), [
      { text: t("Cancel") },
      {
        text: t("Archive"),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/projects/${project.id}`);
            Alert.alert(t("Archived"), t("Project removed from active work. Its historical records are preserved."));
            fetchProjects();
          } catch (err: any) {
            Alert.alert(t("Error"), err.message);
          }
        }
      }
    ]);
  };

  const openEditModal = (project: any) => {
    setEditingProject(project);
    setProjectName(project.name);
    setClientName(project.client_name || '');
    setProjectAddress(project.address || '');
    setModalVisible(true);
  };

  const renderProject = ({ item }: { item: any }) => (
    <View style={styles.projectCard}>
      <TouchableOpacity
        style={styles.projectInfo}
        onPress={() => navigation.navigate('ProjectAlbum', { projectId: item.id, projectName: item.name })}
      >
        <Text style={styles.projectName}>{item.name}</Text>
        {item.client_name && <Text style={styles.clientName}>{item.client_name}</Text>}
        {item.address && <Text style={styles.addressText} numberOfLines={1}>{item.address}</Text>}
        <Text style={styles.status}>{item.status === 'completed' ? t('Completed') : item.status === 'archived' ? t('Archived') : !item.status || item.status === 'active' ? t('Active') : item.status}</Text>
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
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("Projects")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={projects}
        keyExtractor={item => item.id}
        renderItem={renderProject}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={<Text style={styles.emptyText}>{t("No projects yet. Tap + to create one.")}</Text>}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => { setEditingProject(null); setModalVisible(true); }}
      >
        <MaterialIcons name="add" size={28} color="#0A0A0A" />
      </TouchableOpacity>

      {/* Modal for Create/Edit */}
      <Modal visible={modalVisible} onRequestClose={() => setModalVisible(false)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>{editingProject ? t("Edit Project") : t("New Project")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("Project Name")}
                placeholderTextColor="#888"
                value={projectName}
                onChangeText={setProjectName}
              />
              <TextInput
                style={styles.input}
                placeholder={t("Client Name (optional)")}
                placeholderTextColor="#888"
                value={clientName}
                onChangeText={setClientName}
              />
              <TextInput
                style={styles.input}
                placeholder={t("Address (optional – used for directions)")}
                placeholderTextColor="#888"
                value={projectAddress}
                onChangeText={setProjectAddress}
                multiline
                numberOfLines={2}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.btnText}>{t("Cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.saveBtn]} disabled={saving} onPress={handleSaveProject}>
                  <Text style={[styles.btnText, { color: '#0A0A0A' }]}>{saving?t("Saving…"):t("Save")}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold' },
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
  addressText: { color: '#AAA', fontSize: 12, marginTop: 2 },
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
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: { backgroundColor: '#0A0A0A', borderRadius: 10, padding: 12, color: '#FFF', borderWidth: 1, borderColor: '#333', marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  cancelBtn: { borderWidth: 1, borderColor: '#888' },
  saveBtn: { backgroundColor: '#00D4FF' },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
});
