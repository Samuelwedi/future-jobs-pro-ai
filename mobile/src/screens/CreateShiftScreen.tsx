import { dateLabel } from '../services/i18n';
import { useLang } from '../context/LanguageContext';
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
import { calendarDate, parseCalendarDate } from '../utils/calendarDate';
import { format } from 'date-fns';

interface Project {
  id: string;
  name: string;
  address?: string;
}

export default function CreateShiftScreen() {
  const { t, lang } = useLang();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();

  // Parse the date from the route params (now a string)
  const editing = route.params?.shift;
  const date = route.params?.date ? parseCalendarDate(route.params.date) : new Date();

  // Form fields
  const [shiftName, setShiftName] = useState(editing?.name || '');
  const [startTime, setStartTime] = useState(editing?.start_time?.slice(0,5) || '09:00');
  const [endTime, setEndTime] = useState(editing?.end_time?.slice(0,5) || '17:00');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(editing?.project_id || '');
  const [projectSearchText, setProjectSearchText] = useState(editing?.project_name || '');
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>((editing?.assigned_user_ids || [editing?.user_id]).filter(Boolean));
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
      Alert.alert(t("Error"), t("Failed to pick file"));
    }
  };

  // ---- Create shift ----
  const handleCreate = async () => {
    if (uploading) return;
    if (!selectedProjectId) { Alert.alert(t("Project required"), t("Select a project before saving this shift.")); return; }
    if (!shiftName.trim()) {
      Alert.alert(t("Required"), t("Please enter a shift name."));
      return;
    }
    if (selectedEmployeeIds.length === 0) {
      Alert.alert(t("Required"), t("Please select at least one employee."));
      return;
    }
    setUploading(true);
    try {
      let attachmentUrl: string | null = editing?.attachment_url || null;
      let attachmentType: string | null = editing?.attachment_type || null;
      if (selectedFile) {
        try {
          const uploadRes = await api.uploadFileWithData<{ url: string; type: string }>(
            '/upload',
            selectedFile.uri,
            { purpose: 'shift_attachment' },
            'file', false, {name:selectedFile.name,mimeType:selectedFile.type}
          );
          attachmentUrl = uploadRes.url;
          attachmentType = uploadRes.type || selectedFile.type;
        } catch (err) {
          console.error('File upload failed:', err);
          throw new Error(t("Attachment upload failed. Your shift has not been saved. Please retry."));
        }
      }

      const save = editing ? api.put.bind(api) : api.post.bind(api);
      const response:any = await save(editing ? `/schedule/shifts/${editing.id}` : '/schedule/shifts', {
        name: shiftName,
        date: calendarDate(date),
        startTime,
        endTime,
        notes,
        projectId: selectedProjectId,
        employeeIds: selectedEmployeeIds,
        attachmentUrl,
        attachmentType,
      });
      if (!response.success) throw new Error(t("Shift was not saved. Please retry."));
      Alert.alert(t("Saved"), t("Shift has been saved."));
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(t("Error"), err.message || t("Could not create shift."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editing ? t("Edit Shift") : t("Create Shift")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.dateLabel}>{t("Date: ")}{dateLabel(date,lang,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("Shift Name")}
        placeholderTextColor="#888"
        value={shiftName}
        onChangeText={setShiftName}
      />

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder={t("Start (HH:MM)")}
          placeholderTextColor="#888"
          value={startTime}
          onChangeText={setStartTime}
        />
        <TextInput
          style={[styles.input, { flex: 1, marginLeft: 8 }]}
          placeholder={t("End (HH:MM)")}
          placeholderTextColor="#888"
          value={endTime}
          onChangeText={setEndTime}
        />
      </View>

      {/* Project Picker */}
      <View style={styles.projectSearchContainer}>
        <TextInput
          style={styles.input}
          placeholder={t("Search project...")}
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
            <Text style={styles.noProjectsText}>{t("No projects found")}</Text>
          </View>
        )}
      </View>

      {/* Employee Selection Button */}
      <TouchableOpacity style={styles.employeeSelectBtn} onPress={openEmployeePicker}>
        <MaterialIcons name="people" size={20} color="#00D4FF" />
        <Text style={styles.employeeSelectText}>
          {selectedEmployeeIds.length === 0
            ? t("Select Employees")
            : t('Employees selected: {count}',{count:String(selectedEmployeeIds.length)})}
        </Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder={t("Notes (optional)")}
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
            {selectedFile ? t('Attached: {name}',{name:selectedFile.name}) : t("Attach file (PDF, Word, Excel)")}
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
        <Text style={styles.createBtnText}>{uploading ? t('Saving...') : editing ? t('Save shift') : t('Create Shift')}</Text>
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
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold' },
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
