import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Vibration, Modal, FlatList, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';

type Employee = { id: string; first_name: string; last_name: string; email: string };
type Project = { id: string; name: string };

export default function KioskScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const manager = ['boss', 'manager'].includes(String(user?.role || '').toLowerCase());
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'clock-in' | 'clock-out'>('clock-in');
  const [message, setMessage] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [newPin, setNewPin] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const selectedProject = useMemo(() => projects.find(project => project.id === projectId), [projects, projectId]);

  useEffect(() => {
    void Promise.all([
      api.get<any>('/projects').then(result => {
        const rows = result.projects || result || [];
        setProjects(rows);
        if (rows[0]) setProjectId(rows[0].id);
      }),
      manager && user?.companyId
        ? api.get<any>(`/users/company/${user.companyId}`).then(result => setEmployees(result.users || []))
        : Promise.resolve(),
    ]).catch(error => Alert.alert('Kiosk setup', error.message || 'Could not load kiosk setup'));
  }, [manager, user?.companyId]);

  const chooseProject = () => Alert.alert('Select project', 'Clock-ins will be assigned to this project.', [
    ...projects.map(project => ({ text: project.name, onPress: () => setProjectId(project.id) })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);

  const handleAction = async () => {
    if (pin.length < 4) return Alert.alert('PIN required', 'Enter a 4 to 6 digit employee PIN.');
    if (mode === 'clock-in' && !projectId) return Alert.alert('Project required', 'Select a project before clocking in.');
    setWorking(true);
    try {
      const endpoint = mode === 'clock-in' ? '/kiosk/clock-in' : '/kiosk/clock-out';
      const response = await api.post<{ message: string }>(endpoint, { pin, projectId });
      Vibration.vibrate(200);
      setMessage(response.message);
      setPin('');
    } catch (error: any) {
      Alert.alert('Kiosk action failed', error.response?.data?.message || error.message || 'Action failed');
      setPin('');
    } finally { setWorking(false); }
  };

  const savePin = async () => {
    if (!selectedEmployee) return Alert.alert('Employee required', 'Choose an employee.');
    if (!/^\d{4,6}$/.test(newPin)) return Alert.alert('Invalid PIN', 'Use 4 to 6 numbers.');
    setWorking(true);
    try {
      const result = await api.post<{ message: string }>('/kiosk/set-pin', { userId: selectedEmployee.id, pin: newPin });
      Alert.alert('PIN saved', result.message);
      setNewPin(''); setSelectedEmployee(null); setSetupOpen(false);
    } catch (error: any) {
      Alert.alert('Could not save PIN', error.response?.data?.message || error.message);
    } finally { setWorking(false); }
  };

  const renderKey = (digit: string) => <TouchableOpacity key={digit} style={styles.key} onPress={() => pin.length < 6 && setPin(value => value + digit)}><Text style={styles.keyText}>{digit}</Text></TouchableOpacity>;

  return <View style={styles.container}>
    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><MaterialIcons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
    {manager && <TouchableOpacity style={styles.setupBtn} onPress={() => setSetupOpen(true)}><MaterialIcons name="manage-accounts" size={21} color="#00D4FF" /><Text style={styles.setupText}>Employee PINs</Text></TouchableOpacity>}
    <View style={styles.header}><Text style={styles.headerTitle}>Kiosk Clock</Text><Text style={styles.headerSubtitle}>Employee PIN clock in and clock out</Text></View>
    <View style={styles.modeRow}>
      <TouchableOpacity style={[styles.modeBtn, mode === 'clock-in' && styles.modeBtnActiveIn]} onPress={() => setMode('clock-in')}><Text style={styles.modeText}>Clock In</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.modeBtn, mode === 'clock-out' && styles.modeBtnActiveOut]} onPress={() => setMode('clock-out')}><Text style={styles.modeText}>Clock Out</Text></TouchableOpacity>
    </View>
    {mode === 'clock-in' && <TouchableOpacity style={styles.projectBtn} onPress={chooseProject}><Text style={styles.projectText}>{selectedProject?.name || 'Select project'}</Text><MaterialIcons name="expand-more" size={22} color="#00D4FF" /></TouchableOpacity>}
    <View style={styles.pinDisplay}>{[0,1,2,3,4,5].map(index => <View key={index} style={[styles.pinDot, pin.length > index && styles.pinDotFilled]} />)}</View>
    {!!message && <Text style={styles.message}>{message}</Text>}
    <View style={styles.keypad}>
      {['1','2','3','4','5','6','7','8','9'].map(renderKey)}
      <TouchableOpacity style={styles.key} onPress={() => setPin(value => value.slice(0, -1))}><MaterialIcons name="backspace" size={28} color="#FFF" /></TouchableOpacity>
      {renderKey('0')}
      <TouchableOpacity disabled={working} style={[styles.key, styles.keyAction]} onPress={handleAction}>{working ? <ActivityIndicator color="#07151D" /> : <MaterialIcons name={mode === 'clock-in' ? 'login' : 'logout'} size={28} color="#07151D" />}</TouchableOpacity>
    </View>
    <Modal visible={setupOpen} animationType="slide" transparent onRequestClose={() => setSetupOpen(false)}>
      <View style={styles.modalOverlay}><View style={styles.modal}>
        <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Employee kiosk PINs</Text><Text style={styles.modalCaption}>Choose an employee, then create a private PIN.</Text></View><TouchableOpacity onPress={() => setSetupOpen(false)}><MaterialIcons name="close" size={26} color="#FFF" /></TouchableOpacity></View>
        <FlatList data={employees} keyExtractor={item => item.id} style={{ maxHeight: 320 }} renderItem={({ item }) => {
          const selected = selectedEmployee?.id === item.id;
          return <TouchableOpacity style={[styles.employee, selected && styles.employeeSelected]} onPress={() => setSelectedEmployee(item)}><View><Text style={styles.employeeName}>{item.first_name} {item.last_name}</Text><Text style={styles.employeeEmail}>{item.email}</Text></View>{selected && <MaterialIcons name="check-circle" size={23} color="#00D4FF" />}</TouchableOpacity>;
        }} ListEmptyComponent={<Text style={styles.empty}>No employees were returned for this company.</Text>} />
        <TextInput value={newPin} onChangeText={value => setNewPin(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="New 4–6 digit PIN" placeholderTextColor="#718096" style={styles.pinInput} />
        <TouchableOpacity disabled={working} style={styles.saveBtn} onPress={savePin}><Text style={styles.saveText}>{working ? 'Saving…' : `Save PIN${selectedEmployee ? ` for ${selectedEmployee.first_name}` : ''}`}</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#071018', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 }, backBtn: { position: 'absolute', top: 60, left: 20 }, setupBtn: { position: 'absolute', top: 56, right: 18, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#18566A', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }, setupText: { color: '#D8F8FF', fontWeight: '700' },
  header: { alignItems: 'center', marginBottom: 22 }, headerTitle: { color: '#FFF', fontSize: 30, fontWeight: '900' }, headerSubtitle: { color: '#8EA5B5', marginTop: 6 }, modeRow: { flexDirection: 'row', gap: 12, marginBottom: 14 }, modeBtn: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: '#29404E' }, modeBtnActiveIn: { backgroundColor: '#168A52' }, modeBtnActiveOut: { backgroundColor: '#C43D4B' }, modeText: { color: '#FFF', fontWeight: '800' },
  projectBtn: { width: 270, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#10222E', borderWidth: 1, borderColor: '#244657', borderRadius: 12, padding: 12, marginBottom: 18 }, projectText: { color: '#FFF', fontWeight: '700' }, pinDisplay: { flexDirection: 'row', gap: 14, marginBottom: 18 }, pinDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: '#567080' }, pinDotFilled: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' }, message: { color: '#61E6A2', fontWeight: '800', marginBottom: 12 }, keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 12, justifyContent: 'center' }, key: { width: 80, height: 60, borderRadius: 14, backgroundColor: '#142631', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#294452' }, keyAction: { backgroundColor: '#00D4FF' }, keyText: { color: '#FFF', fontSize: 24, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.75)', justifyContent: 'flex-end' }, modal: { backgroundColor: '#101D27', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 38, maxHeight: '82%' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }, modalTitle: { color: '#FFF', fontSize: 22, fontWeight: '900' }, modalCaption: { color: '#8EA5B5', marginTop: 4 }, employee: { padding: 14, borderRadius: 12, backgroundColor: '#172A36', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, employeeSelected: { borderWidth: 2, borderColor: '#00D4FF' }, employeeName: { color: '#FFF', fontSize: 16, fontWeight: '800' }, employeeEmail: { color: '#8EA5B5', marginTop: 3 }, empty: { color: '#FFB4B4', padding: 20, textAlign: 'center' }, pinInput: { backgroundColor: '#09131A', borderWidth: 1, borderColor: '#335163', color: '#FFF', borderRadius: 12, padding: 15, fontSize: 18, letterSpacing: 4, marginTop: 12 }, saveBtn: { backgroundColor: '#00D4FF', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 12 }, saveText: { color: '#06141C', fontWeight: '900', fontSize: 16 },
});
