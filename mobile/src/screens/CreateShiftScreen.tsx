import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { format, parseISO } from 'date-fns';

interface Project {
  id: string;
  name: string;
  address?: string;
}

export default function CreateShiftScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();

  // Parse the date from the route params (now a string)
  const date = route.params?.date ? new Date(route.params.date) : new Date();

  // Form fields
  const [shiftName, setShiftName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectSearchText, setProjectSearchText] = useState('');
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // ---- Fetch projects ----
  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get<{ success: boolean; projects: Project[] }>('/projects');
      setProjects(res.projects || []);
    } catch (e) { console.error(e); }
  };

  // ---- Filter projects for search ----
  useEffect(() => {
    if (projectSearchText.trim().length > 0) {
      const filtered = projects.filter(p =>
        p.name.toLowerCase().includes(projectSearchText.toLowerCase())
      );
      setFilteredProjects(filtered);
      setShowProjectDropdown(true);
    } else {
      setFilteredProjects(projects);
      setShowProjectDropdown(false);
    }
  }, [projectSearchText, projects]);

  // ---- Callback for employee selection ----
  const handleEmployeeSelect = (ids: string[]) => {
    setSelectedEmployeeIds(ids);
  };

  const openEmployeePicker = () => {
    navigation.navigate('SelectEmployees', {
      selectedIds: selectedEmployeeIds,
      onSelect: handleEmployeeSelect,
    });
  };

  // ---- Pick file ----
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/msword', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/octet-stream',
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  // ---- Create shift ----
  const handleCreate = async () => {
    if (!shiftName.trim()) {
      Alert.alert('Required', 'Please enter a shift name.');
      return;
    }
    if (selectedEmployeeIds.length === 0) {
      Alert.alert('Required', 'Please select at least one employee.');
      return;
    }
    setUploading(true);
    try {
      let attachmentUrl: string | null = null;
      let attachmentType: string | null = null;
      if (selectedFile) {
        try {
          const formData = new FormData();
          formData.append('file', {
            uri: selectedFile.uri,
            name: selectedFile.name,
            type: selectedFile.type,
          } as any);
          formData.append('purpose', 'shift_attachment');
          const uploadRes = await api.uploadFileWithData<{ url: string; type: string }>(
            '/upload',
            selectedFile.uri,
            { purpose: 'shift_attachment' },
            'file'
          );
          attachmentUrl = uploadRes.url;
          attachmentType = uploadRes.type || selectedFile.type;
        } catch (err) {
          console.error('File upload failed:', err);
          Alert.alert('Warning', 'Could not upload file, continuing without attachment.');
        }
      }

      await api.post('/schedule/shifts', {
        name: shiftName,
        date: format(date, 'yyyy-MM-dd'),
        startTime,
        endTime,
        notes,
        projectId: selectedProjectId,
        employeeIds: selectedEmployeeIds,
        attachmentUrl,
        attachmentType,
      });
      Alert.alert('✅ Created', 'Shift has been added.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not create shift.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Shift</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.dateLabel}>Date: {format(date, 'EEE, MMM d, yyyy')}</Text>

      <TextInput
        style={styles.input}
        placeholder="Shift Name"
        placeholderTextColor="#888"
        value={shiftName}
        onChangeText={setShiftName}
      />

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Start (HH:MM)"
          placeholderTextColor="#888"
          value={startTime}
          onChangeText={setStartTime}
        />
        <TextInput
          style={[styles.input, { flex: 1, marginLeft: 8 }]}
          placeholder="End (HH:MM)"
          placeholderTextColor="#888"
          value={endTime}
          onChangeText={setEndTime}
        />
      </View>

      {/* Project Picker */}
      <View style={styles.projectSearchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Search project..."
          placeholderTextColor="#888"
          value={projectSearchText}
          onChangeText={setProjectSearchText}
          onFocus={() => setShowProjectDropdown(true)}
        />
        {showProjectDropdown && filteredProjects.length > 0 && (
          <View style={styles.projectDropdown}>
            {filteredProjects.map(proj => (
              <TouchableOpacity
                key={proj.id}
                style={[
                  styles.projectItem,
                  selectedProjectId === proj.id && styles.projectItemActive
                ]}
                onPress={() => {
                  setSelectedProjectId(proj.id);
                  setProjectSearchText(proj.name);
                  setShowProjectDropdown(false);
                }}
              >
                <Text style={[styles.projectItemText, selectedProjectId === proj.id && styles.projectItemTextActive]}>
                  {proj.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {showProjectDropdown && projectSearchText.length > 0 && filteredProjects.length === 0 && (
          <View style={styles.projectDropdown}>
            <Text style={styles.noProjectsText}>No projects found</Text>
          </View>
        )}
      </View>

      {/* Employee Selection Button */}
      <TouchableOpacity style={styles.employeeSelectBtn} onPress={openEmployeePicker}>
        <MaterialIcons name="people" size={20} color="#00D4FF" />
        <Text style={styles.employeeSelectText}>
          {selectedEmployeeIds.length === 0
            ? 'Select Employees'
            : `${selectedEmployeeIds.length} employee${selectedEmployeeIds.length > 1 ? 's' : ''} selected`}
        </Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="Notes (optional)"
        placeholderTextColor="#888"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
      />

      {/* File Attachment */}
      <View style={styles.attachmentSection}>
        <TouchableOpacity style={styles.attachBtn} onPress={pickFile}>
          <MaterialIcons name="attach-file" size={20} color="#00D4FF" />
          <Text style={styles.attachBtnText}>
            {selectedFile ? `Attached: ${selectedFile.name}` : 'Attach file (PDF, Word, Excel)'}
          </Text>
        </TouchableOpacity>
        {selectedFile && (
          <TouchableOpacity onPress={() => setSelectedFile(null)} style={styles.removeAttach}>
            <MaterialIcons name="close" size={18} color="#F44336" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.createBtn}
        onPress={handleCreate}
        disabled={uploading}
      >
        <Text style={styles.createBtnText}>{uploading ? 'Creating...' : 'Create Shift'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  dateLabel: { color: '#AAA', fontSize: 16, margin: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  row: { flexDirection: 'row', marginHorizontal: 16 },
  projectSearchContainer: { marginHorizontal: 16, marginBottom: 12 },
  projectDropdown: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: 150,
    marginTop: -8,
    paddingVertical: 4,
  },
  projectItem: { paddingVertical: 10, paddingHorizontal: 14 },
  projectItemActive: { backgroundColor: '#00D4FF20' },
  projectItemText: { color: '#FFF', fontSize: 14 },
  projectItemTextActive: { color: '#00D4FF', fontWeight: '600' },
  noProjectsText: { color: '#888', padding: 12, textAlign: 'center' },
  employeeSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  employeeSelectText: { color: '#00D4FF', marginLeft: 8, fontSize: 14, flex: 1 },
  attachmentSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  attachBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
    gap: 8,
  },
  attachBtnText: { color: '#AAA', fontSize: 14, flex: 1 },
  removeAttach: { padding: 8 },
  createBtn: {
    backgroundColor: '#00D4FF',
    borderRadius: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  createBtnText: { color: '#0A0A0A', fontSize: 18, fontWeight: 'bold' },
});