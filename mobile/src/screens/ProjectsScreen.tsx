import { useLang } from '../context/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {checkOnlineStatus} from '../services/offlineService';
import { AdaptiveModal as Modal } from '../components/AdaptiveModal';
import React, { useState, useEffect, useRef } from 'react';
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
  const { user } = useAuth();
  // Remount account-owned state when identity, company, or permissions change.
  return <ProjectsContent key={`${user?.id}:${user?.companyId}:${user?.role}`} />;
}

function ProjectsContent() {
  const { t } = useLang();
  const { user } = useAuth();
  const canManage = !!user?.id && ['boss', 'manager', 'admin'].includes(user.role);
  const mounted = useRef(true);
  const requestId = useRef(0);
  const saveLock = useRef(false);
  const draftWrites = useRef(Promise.resolve());
  const [loadError, setLoadError] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const createDraft = useRef({name: '', client: '', address: ''});
  const navigation = useNavigation<any>();
  const [projects, setProjects] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const archiveView = useRef(false);
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
    mounted.current = true;
    void fetchProjects();
    return () => { mounted.current = false; requestId.current++; };
  }, []);

  const fetchProjects = async () => {
    const request = ++requestId.current;
    try {
      if (!user?.id) { setProjects([]); return; }
      const archived = archiveView.current;
      const res: any = await api.get(archived ? '/projects?archived=true' : '/projects');
      if (!mounted.current || request !== requestId.current) return;
      if (!Array.isArray(res.projects)) throw new Error('Invalid projects response');
      setProjects(res.projects.filter((p:any) => Boolean(p.archived_at) === archived));
      setLoadError(false);
    } catch {
      if (mounted.current && request === requestId.current) setLoadError(true);
    } finally {
      if (mounted.current && request === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const changeArchiveView = (archived: boolean) => {
    if (!mounted.current || saveLock.current || archiveView.current === archived) return;
    archiveView.current = archived;
    requestId.current++;
    setShowArchived(archived);
    setProjects([]);
    setLoading(true);
    void fetchProjects();
  };

  const onRefresh = () => {
    setRefreshing(true);
    void fetchProjects();
  };

  useEffect(() => {
    let live = true;
    if (!canManage) return;
    AsyncStorage.getItem(draftKey).then(raw => {
      if (!live) return;
      const d = raw ? JSON.parse(raw) : {};
      if (!d || typeof d !== 'object' || ['name', 'client', 'address'].some(k => d[k] != null && typeof d[k] !== 'string')) throw new Error('Invalid draft');
      createDraft.current = {name: d.name || '', client: d.client || '', address: d.address || ''};
      setProjectName(createDraft.current.name);
      setClientName(createDraft.current.client);
      setProjectAddress(createDraft.current.address);
      setDraftLoaded(true);
    }).catch(() => { if (live) setDraftError(true); });
    return () => { live = false; };
  }, [draftKey, canManage]);

  const changeCreateField = (field: 'name' | 'client' | 'address', value: string) => {
    if (editingProject || !draftLoaded || !canManage) return;
    const draft = {...createDraft.current, [field]: value};
    createDraft.current = draft;
    // Persist only explicit input, never a blank initialization or edit-project form.
    draftWrites.current = draftWrites.current.then(() => AsyncStorage.setItem(draftKey, JSON.stringify(draft))).catch(() => {
      if (mounted.current) setDraftError(true);
    });
  };
  const openCreateModal = () => {
    if (!mounted.current || !canManage || !draftLoaded || saveLock.current) return;
    setEditingProject(null);
    setProjectName(createDraft.current.name);
    setClientName(createDraft.current.client);
    setProjectAddress(createDraft.current.address);
    setModalVisible(true);
  };
  const handleSaveProject = async () => {
    if (!mounted.current || !canManage || saveLock.current || (!editingProject && !draftLoaded)) return;

    if (!projectName.trim()) {
      Alert.alert(t('Error'), t('Project name is required'));
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      if(!await checkOnlineStatus()) throw new Error(t("You are offline. Your project draft is kept on this device. Reconnect and tap Save."));
      if (!mounted.current || !canManage) return;
      const payload = {
        name: projectName.trim(),
        client_name: clientName.trim() || null,
        address: projectAddress.trim() || null, // include address
        company_id: user?.companyId,
      };
      if (editingProject) {
        await api.put(`/projects/${editingProject.id}`, payload);
        if (!mounted.current) return;
        Alert.alert(t('Success'), t('Project updated'));
      } else {
        await api.post('/projects', payload);
        if (!mounted.current) return;
        Alert.alert(t('Success'), t('Project created'));
        // A successful create consumes only the submitted create draft.
        createDraft.current = {name: '', client: '', address: ''};
        const emptyDraft = JSON.stringify(createDraft.current);
        draftWrites.current = draftWrites.current.then(() => AsyncStorage.setItem(draftKey, emptyDraft)).catch(() => {
          if (mounted.current) setDraftError(true);
        });
        await draftWrites.current;
        if (!mounted.current) return;
      }
      setModalVisible(false);
      setProjectName('');
      setClientName('');
      setProjectAddress('');
      setEditingProject(null);
      fetchProjects();
    } catch (error: any) {
      if (!mounted.current) return;
      Alert.alert(t('Project not saved'), error.response?.data?.message || error.message || t("Failed to save project"));
    } finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  };

  const changeProjectArchive = async (project: any, archived: boolean) => {
    if (!mounted.current || !canManage || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const response = await api.setProjectArchived<{success:boolean}>(project.id, archived);
      if (!mounted.current) return;
      if (!response.success) throw new Error(t('Project change was not confirmed. Refresh before trying again.'));
      Alert.alert(t(archived ? 'Archived' : 'Project restored'), t('Project records and completion status were preserved.'));
      await fetchProjects();
    } catch (error: any) {
      if (mounted.current) Alert.alert(t('Project change not confirmed'), [error.response?.data?.message || error.message, t('Project change was not confirmed. Refresh before trying again.')].filter(Boolean).join('\n'));
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const handleDelete = (project: any) => {
    if (!mounted.current || !canManage || saveLock.current) return;
    Alert.alert(t('Archive Project'), t('Archive {name}? You can restore it later. Records and completion status are kept.', {name: project.name}), [
      { text: t('Cancel') },
      { text: t('Archive'), onPress: () => changeProjectArchive(project, true) },
    ]);
  };
  const handleRestore = (project: any) => {
    if (!mounted.current || !canManage || saveLock.current) return;
    Alert.alert(t('Restore project'), t('Restore {name} to the project list?', {name: project.name}), [
      { text: t('Cancel') },
      { text: t('Restore'), onPress: () => changeProjectArchive(project, false) },
    ]);
  };

  const openEditModal = (project: any) => {
    if (!mounted.current || !canManage || saveLock.current) return;
    setEditingProject(project);
    setProjectName(project.name);
    setClientName(project.client_name || '');
    setProjectAddress(project.address || '');
    setModalVisible(true);
  };

  const openProjectFiles = (project: any) => {
    if (!mounted.current || !user?.id || !user.companyId) return;
    navigation.navigate('ProjectFiles', { projectId: project.id, projectName: project.name, ownerId: user.id, companyId: user.companyId });
  };

  const renderProject = ({ item }: { item: any }) => (
    <View style={styles.projectCard}>
      <View style={styles.projectMain}>
      <TouchableOpacity
        style={styles.projectInfo}
        onPress={() => navigation.navigate('ProjectAlbum', { projectId: item.id, projectName: item.name })}
      >
        <Text style={styles.projectName}>{item.name}</Text>
        {item.client_name && <Text style={styles.clientName}>{item.client_name}</Text>}
        {item.address && <Text style={styles.addressText} numberOfLines={1}>{item.address}</Text>}
        <Text style={styles.status}>{item.archived_at ? t('Archived') + ' · ' : ''}{item.status || 'active'}</Text>
      </TouchableOpacity>
      {canManage && <View style={styles.actions}>
        {item.archived_at ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Restore project")} disabled={saving} onPress={() => handleRestore(item)} style={styles.actionBtn}>
          <MaterialIcons name="restore" size={22} color="#00D4FF" />
        </TouchableOpacity> : <>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Edit Project")} disabled={saving} onPress={() => openEditModal(item)} style={styles.actionBtn}>
          <MaterialIcons name="edit" size={22} color="#00D4FF" />
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Archive Project")} disabled={saving} onPress={() => handleDelete(item)} style={styles.actionBtn}>
          <MaterialIcons name="delete" size={22} color="#F44336" />
        </TouchableOpacity>
      </>}
      </View>}
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('View files for {name}', {name: item.name})}
        style={styles.filesButton}
        onPress={() => openProjectFiles(item)}>
        <MaterialIcons name="folder-open" size={20} color="#00D4FF" />
        <Text style={styles.filesText}>{t('Project files')}</Text>
      </TouchableOpacity>
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

      <View style={{flexDirection:'row',paddingHorizontal:16,gap:12}}>
        {[false,true].map(archived => <TouchableOpacity key={String(archived)} accessibilityRole="button" accessibilityState={{selected:showArchived===archived}} disabled={saving} onPress={() => changeArchiveView(archived)} style={{padding:14}}>
          <Text style={{color:showArchived===archived?'#00D4FF':'#AAA'}}>{t(archived?'Archived projects':'Unarchived projects')}</Text>
        </TouchableOpacity>)}
      </View>
      {loadError && <View accessibilityRole="alert" style={styles.notice}>
        <Text style={styles.noticeText}>{t('Could not load projects. Check your connection and try again.')}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={onRefresh} disabled={refreshing} style={styles.emptyButton}>
          <Text style={styles.primaryText}>{t('Try again')}</Text>
        </TouchableOpacity>
      </View>}
      {canManage && draftError && <Text accessibilityRole="alert" style={styles.noticeText}>{t('Your project draft could not be loaded or saved. It has not been deleted. Please reopen this screen before creating a project.')}</Text>}
      <FlatList
        data={projects}
        keyExtractor={item => item.id}
        renderItem={renderProject}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={loadError ? null : <View style={styles.notice}>
          <Text style={styles.emptyText}>{t(showArchived ? 'No archived projects' : 'No unarchived projects yet')}</Text>
          <Text style={styles.noticeText}>{showArchived ? t('Archived projects keep their records and can be restored by a manager.') : canManage
            ? t('Create a project to organize work, photos, and records.')
            : t('Your manager creates projects. Ask them to add a project for your team.')}</Text>
          {canManage && !showArchived && <TouchableOpacity accessibilityRole="button" disabled={!draftLoaded} style={styles.emptyButton} onPress={openCreateModal}>
            <Text style={styles.primaryText}>{t('Create first project')}</Text>
          </TouchableOpacity>}
        </View>}
      />

      {canManage && !showArchived && <TouchableOpacity
        accessibilityRole="button" accessibilityLabel={t("New Project")} disabled={!draftLoaded}
        style={styles.fab}
        onPress={openCreateModal}
      >
        <MaterialIcons name="add" size={28} color="#0A0A0A" />
      </TouchableOpacity>}

      {/* Modal for Create/Edit */}
      <Modal visible={modalVisible && canManage} onRequestClose={() => setModalVisible(false)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>{t(editingProject ? 'Edit Project' : 'New Project')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("Project Name")}
                placeholderTextColor="#888"
                value={projectName}
                editable={!saving}
                onChangeText={value => { setProjectName(value); changeCreateField('name', value); }}
              />
              <TextInput
                style={styles.input}
                placeholder={t("Client Name (optional)")}
                placeholderTextColor="#888"
                value={clientName}
                editable={!saving}
                onChangeText={value => { setClientName(value); changeCreateField('client', value); }}
              />
              <TextInput
                style={styles.input}
                placeholder={t("Address (optional – used for directions)")}
                placeholderTextColor="#888"
                value={projectAddress}
                editable={!saving}
                onChangeText={value => { setProjectAddress(value); changeCreateField('address', value); }}
                multiline
                numberOfLines={2}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.btnText}>{t("Cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.saveBtn]} disabled={saving} onPress={handleSaveProject}>
                  <Text style={[styles.btnText, { color: '#0A0A0A' }]}>{t(saving ? 'Saving…' : 'Save')}</Text>
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
  notice: { padding: 16, alignItems: 'center' },
  noticeText: { color: '#BBB', textAlign: 'center', lineHeight: 22, padding: 8 },
  emptyButton: { backgroundColor: '#00D4FF', borderRadius: 10, minHeight: 48, padding: 14, marginTop: 12 },
  primaryText: { color: '#0A0A0A', fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  list: { padding: 16 },
  projectCard: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  projectMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filesButton: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 48, marginTop: 8 },
  filesText: { color: '#00D4FF', fontWeight: '600' },
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
