import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';
import { ProjectFile, projectFileUrl, readProjectFiles } from '../utils/projectFiles';

type FileState = { scope: string; request: number; status: 'loading' | 'ready' | 'error'; files: ProjectFile[]; isSessionCurrent?: () => boolean };

export default function ProjectFilesScreen() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const focused = useIsFocused();
  const params = route.params;
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const validRoute = !!user?.id && !!user.companyId && !!projectId
    && params?.ownerId === user.id && params?.companyId === user.companyId;
  const scope = JSON.stringify([user?.id, user?.companyId, user?.role, projectId]);
  const currentScope = useRef<string | null>(null);
  currentScope.current = focused && validRoute ? scope : null;
  const focusActive = useRef(false);
  const sequence = useRef(0);
  const openLock = useRef<symbol | null>(null);
  const [opening, setOpening] = useState(false);
  const [state, setState] = useState<FileState | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!user || !focusActive.current || currentScope.current !== scope) return;
    const request = ++sequence.current;
    const current = () => focusActive.current && currentScope.current === scope && sequence.current === request;
    openLock.current = null;
    setOpening(false);
    // Clear old links while access is being checked again, including failed refreshes.
    setState({ scope, request, status: 'loading', files: [] });
    try {
      const response = await api.getProjectFiles(projectId, { id: user.id, companyId: user.companyId, role: user.role }, current);
      if (!current() || !response.isSessionCurrent()) return;
      const files = readProjectFiles(response.data, projectId, user.companyId);
      setState({ scope, request, status: 'ready', files, isSessionCurrent: response.isSessionCurrent });
    } catch {
      if (current()) setState({ scope, request, status: 'error', files: [] });
    }
  }, [scope, projectId, user?.id, user?.companyId, user?.role, validRoute]);

  useFocusEffect(useCallback(() => {
    focusActive.current = true;
    void fetchFiles();
    return () => {
      focusActive.current = false;
      sequence.current++;
      openLock.current = null;
    };
  }, [fetchFiles]));

  const openFile = async (file: ProjectFile) => {
    const request = state?.request;
    const current = () => focusActive.current && currentScope.current === scope && request === sequence.current && state?.isSessionCurrent?.() === true;
    if (!current() || state?.status !== 'ready' || state.scope !== scope || !state.files.includes(file) || openLock.current) return;
    const url = projectFileUrl(file.url);
    if (!url) return;
    const operation = Symbol('open project file');
    openLock.current = operation;
    setOpening(true);
    try {
      await Linking.openURL(url);
    } catch {
      if (current()) Alert.alert(t('Error'), t('Could not open attachment. Refresh and try again.'));
    } finally {
      if (openLock.current === operation) {
        openLock.current = null;
        if (current()) setOpening(false);
      }
    }
  };

  const visibleState = validRoute && focused && state?.scope === scope && state.request === sequence.current
    && (state.status !== 'ready' || state.isSessionCurrent?.() === true) ? state : null;
  const loading = !visibleState || visibleState.status === 'loading';
  return <View style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Go back')} style={styles.back} onPress={() => navigation.goBack()}>
        <MaterialIcons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>
      <View style={styles.heading}>
        <Text style={styles.title}>{t('Project files')}</Text>
        {validRoute && typeof params?.projectName === 'string' && <Text style={styles.projectName}>{params.projectName}</Text>}
      </View>
    </View>
    {!validRoute ? <View style={styles.notice}>
      <Text style={styles.description}>{t('Reopen this project from Projects to view its files.')}</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => navigation.navigate('Projects')}>
        <Text style={styles.buttonText}>{t('Projects')}</Text>
      </TouchableOpacity>
    </View> : <>
      <Text style={styles.readOnly}>{t('Read-only files')}</Text>
      <Text style={styles.description}>{t('Files linked directly to this project appear here. Check the shift or timesheet for its attachments.')}</Text>
      {loading ? <ActivityIndicator accessibilityLabel={t('Loading project files')} size="large" color="#00D4FF" style={styles.notice} />
        : visibleState?.status === 'error' ? <View style={styles.notice}>
          <Text accessibilityRole="alert" style={styles.description}>{t('Could not load project files. Check your connection and access, then try again.')}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={fetchFiles}>
            <Text style={styles.buttonText}>{t('Try again')}</Text>
          </TouchableOpacity>
        </View> : <FlatList
          data={visibleState?.files || []}
          keyExtractor={file => file.id}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={fetchFiles}
          ListEmptyComponent={<View style={styles.notice}>
            <MaterialIcons name="folder-open" size={48} color="#888" />
            <Text style={styles.emptyTitle}>{t('No saved project files found')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={fetchFiles}>
              <Text style={styles.buttonText}>{t('Refresh files')}</Text>
            </TouchableOpacity>
          </View>}
          renderItem={({ item }) => <View style={styles.file}>
            <MaterialIcons name="insert-drive-file" size={24} color="#00D4FF" />
            <View style={styles.fileInfo}>
              <Text style={styles.fileName}>{item.name}</Text>
              {item.url ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Open {name}', { name: item.name })} disabled={opening} style={styles.open} onPress={() => openFile(item)}>
                <Text style={styles.openText}>{t('Open file')}</Text>
              </TouchableOpacity> : <Text style={styles.unavailable}>{t('File link unavailable')}</Text>}
            </View>
          </View>}
        />}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  back: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
  heading: { flex: 1 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  projectName: { color: '#BBB', fontSize: 16, marginTop: 4 },
  readOnly: { color: '#00D4FF', paddingHorizontal: 20, fontWeight: '600' },
  description: { color: '#BBB', lineHeight: 22, padding: 20 },
  notice: { alignItems: 'center', padding: 16 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#00D4FF', borderRadius: 10 },
  buttonText: { color: '#0A0A0A', fontWeight: '600' },
  list: { padding: 16, flexGrow: 1 },
  emptyTitle: { color: '#FFF', textAlign: 'center', marginVertical: 16, fontSize: 17 },
  file: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#1A1A1A', borderRadius: 12, marginBottom: 12 },
  fileInfo: { flex: 1 },
  fileName: { color: '#FFF', fontSize: 16 },
  open: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 20 },
  openText: { color: '#00D4FF', fontWeight: '600' },
  unavailable: { color: '#AAA', marginTop: 12 },
});
