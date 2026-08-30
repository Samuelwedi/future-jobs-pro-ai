import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  has_pin: boolean;
};

type Project = { id: string; name: string };

export default function KioskScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const role = String((user as any)?.role || '').toLowerCase();
  const isManager = ['boss', 'manager', 'admin'].includes(role);
  const companyId = String((user as any)?.companyId || (user as any)?.company_id || '');

  const [tab, setTab] = useState<'clock' | 'manage'>(isManager ? 'manage' : 'clock');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'clock-in' | 'clock-out'>('clock-in');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [newPin, setNewPin] = useState('');
  const [kioskEnabled, setKioskEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const employeeName = useMemo(
    () => selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}`.trim() : '',
    [selectedEmployee]
  );

  const loadSetup = async () => {
    setLoading(true);
    try {
      const projectResponse = await api.get<any>('/projects');
      const projectRows = Array.isArray(projectResponse)
        ? projectResponse
        : projectResponse?.projects || [];
      setProjects(projectRows);
      if (!projectId && projectRows[0]?.id) setProjectId(projectRows[0].id);

      if (isManager) {
        const userResponse = await api.get<{ users: Employee[] }>('/kiosk/users');
        setEmployees(userResponse.users || []);
      }
      if (companyId) {
        const status = await api.get<any>(`/kiosk/status/${companyId}`);
        setKioskEnabled(Boolean(status?.kiosk_enabled));
      }
    } catch (cause: any) {
      Alert.alert('Kiosk setup', cause?.response?.data?.message || cause?.message || 'Could not load kiosk setup.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSetup(); }, [isManager, companyId]);

  const setEnabled = async (enabled: boolean) => {
    setKioskEnabled(enabled);
    try {
      await api.post('/kiosk/toggle', { enabled });
    } catch (cause: any) {
      setKioskEnabled(!enabled);
      Alert.alert('Kiosk', cause?.response?.data?.message || 'Could not update kiosk availability.');
    }
  };

  const savePin = async () => {
    if (!selectedEmployee) return Alert.alert('Select employee', 'Choose an employee first.');
    if (!/^\d{4,6}$/.test(newPin)) return Alert.alert('Invalid PIN', 'Enter 4 to 6 digits.');
    setLoading(true);
    try {
      await api.post('/kiosk/set-pin', { userId: selectedEmployee.id, pin: newPin });
      setEmployees(current => current.map(item => item.id === selectedEmployee.id ? { ...item, has_pin: true } : item));
      setSelectedEmployee(current => current ? { ...current, has_pin: true } : current);
      setNewPin('');
      Alert.alert('PIN saved', `${employeeName} can now use the kiosk.`);
    } catch (cause: any) {
      Alert.alert('PIN not saved', cause?.response?.data?.message || cause?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClock = async () => {
    if (!/^\d{4,6}$/.test(pin)) return Alert.alert('PIN required', 'Enter your 4 to 6 digit PIN.');
    if (mode === 'clock-in' && !projectId) return Alert.alert('Project required', 'Select a project before clocking in.');
    setLoading(true);
    try {
      const endpoint = mode === 'clock-in' ? '/kiosk/clock-in' : '/kiosk/clock-out';
      const response = await api.post<{ message: string }>(endpoint, { pin, projectId });
      Vibration.vibrate(150);
      setPin('');
      Alert.alert(mode === 'clock-in' ? 'Clocked in' : 'Clocked out', response.message);
    } catch (cause: any) {
      setPin('');
      Alert.alert('Kiosk action failed', cause?.response?.data?.message || cause?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderKey = (digit: string) => (
    <TouchableOpacity key={digit} style={styles.key} onPress={() => pin.length < 6 && setPin(current => current + digit)}>
      <Text style={styles.keyText}>{digit}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><MaterialIcons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
        <View style={styles.headerCopy}><Text style={styles.title}>Kiosk</Text><Text style={styles.subtitle}>Secure crew clock and PIN control</Text></View>
        {loading ? <ActivityIndicator color="#22D3EE" /> : <View style={{ width: 24 }} />}
      </View>

      {isManager ? (
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'manage' && styles.tabActive]} onPress={() => setTab('manage')}><Text style={styles.tabText}>PIN management</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'clock' && styles.tabActive]} onPress={() => setTab('clock')}><Text style={styles.tabText}>Kiosk clock</Text></TouchableOpacity>
        </View>
      ) : null}

      {tab === 'manage' && isManager ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.settingCard}>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Kiosk availability</Text><Text style={styles.muted}>Allow employees to clock in and out using their private PIN.</Text></View>
            <Switch value={kioskEnabled} onValueChange={setEnabled} trackColor={{ true: '#155E75' }} thumbColor={kioskEnabled ? '#22D3EE' : '#64748B'} />
          </View>
          <Text style={styles.sectionLabel}>EMPLOYEES</Text>
          {employees.map(employee => {
            const selected = selectedEmployee?.id === employee.id;
            return (
              <TouchableOpacity key={employee.id} style={[styles.employeeCard, selected && styles.selectedCard]} onPress={() => { setSelectedEmployee(employee); setNewPin(''); }}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{employee.first_name?.[0]}{employee.last_name?.[0]}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.employeeName}>{employee.first_name} {employee.last_name}</Text><Text style={styles.muted}>{employee.role}</Text></View>
                <View style={[styles.badge, employee.has_pin && styles.badgeReady]}><Text style={styles.badgeText}>{employee.has_pin ? 'PIN READY' : 'NO PIN'}</Text></View>
              </TouchableOpacity>
            );
          })}
          {selectedEmployee ? (
            <View style={styles.editor}>
              <Text style={styles.cardTitle}>{selectedEmployee.has_pin ? 'Replace' : 'Create'} PIN for {employeeName}</Text>
              <TextInput value={newPin} onChangeText={value => setNewPin(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="4–6 digit PIN" placeholderTextColor="#64748B" style={styles.pinInput} />
              <TouchableOpacity style={styles.primaryButton} onPress={savePin} disabled={loading}><MaterialIcons name="lock" size={18} color="#06131B" /><Text style={styles.primaryText}>Save private PIN</Text></TouchableOpacity>
              <Text style={styles.privacy}>For security, existing PIN digits are never displayed.</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.clockContent}>
          <View style={styles.modeRow}>
            <TouchableOpacity style={[styles.mode, mode === 'clock-in' && styles.clockIn]} onPress={() => setMode('clock-in')}><Text style={styles.modeText}>Clock in</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.mode, mode === 'clock-out' && styles.clockOut]} onPress={() => setMode('clock-out')}><Text style={styles.modeText}>Clock out</Text></TouchableOpacity>
          </View>
          {mode === 'clock-in' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectStrip}>{projects.map(project => <TouchableOpacity key={project.id} style={[styles.projectChip, projectId === project.id && styles.projectSelected]} onPress={() => setProjectId(project.id)}><Text style={styles.projectText}>{project.name}</Text></TouchableOpacity>)}</ScrollView> : null}
          <View style={styles.dots}>{[0,1,2,3,4,5].map(index => <View key={index} style={[styles.dot, pin.length > index && styles.dotFilled]} />)}</View>
          <View style={styles.keypad}>{['1','2','3','4','5','6','7','8','9'].map(renderKey)}<TouchableOpacity style={styles.key} onPress={() => setPin(current => current.slice(0, -1))}><MaterialIcons name="backspace" size={25} color="#FFF" /></TouchableOpacity>{renderKey('0')}<TouchableOpacity style={[styles.key, styles.actionKey]} onPress={handleClock}><MaterialIcons name={mode === 'clock-in' ? 'login' : 'logout'} size={27} color="#06131B" /></TouchableOpacity></View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111F' },
  header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1E3144' },
  headerCopy: { flex: 1, marginLeft: 14 }, title: { color: '#FFF', fontSize: 22, fontWeight: '900' }, subtitle: { color: '#8FA0B5', fontSize: 11, marginTop: 2 },
  tabs: { flexDirection: 'row', padding: 8, gap: 8 }, tab: { flex: 1, padding: 11, alignItems: 'center', borderRadius: 12, backgroundColor: '#101E2D' }, tabActive: { backgroundColor: '#164E63', borderWidth: 1, borderColor: '#22D3EE' }, tabText: { color: '#E2E8F0', fontWeight: '800', fontSize: 12 },
  content: { padding: 16, paddingBottom: 50 }, settingCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: '#101E2D', borderWidth: 1, borderColor: '#263B50' }, cardTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' }, muted: { color: '#8FA0B5', fontSize: 11, marginTop: 3 }, sectionLabel: { color: '#64748B', fontSize: 10, letterSpacing: 1.4, fontWeight: '900', marginTop: 22, marginBottom: 9 },
  employeeCard: { flexDirection: 'row', alignItems: 'center', padding: 13, marginBottom: 8, borderRadius: 14, backgroundColor: '#101E2D', borderWidth: 1, borderColor: '#263B50' }, selectedCard: { borderColor: '#22D3EE', backgroundColor: '#0E2A38' }, avatar: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#23364A', alignItems: 'center', justifyContent: 'center', marginRight: 11 }, avatarText: { color: '#67E8F9', fontWeight: '900' }, employeeName: { color: '#F8FAFC', fontWeight: '700' }, badge: { backgroundColor: '#3F1D27', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 }, badgeReady: { backgroundColor: '#123B32' }, badgeText: { color: '#D6E4F0', fontSize: 9, fontWeight: '900' },
  editor: { marginTop: 14, padding: 16, borderRadius: 16, backgroundColor: '#17112B', borderWidth: 1, borderColor: '#5B21B6' }, pinInput: { marginTop: 12, backgroundColor: '#0B1624', color: '#FFF', fontSize: 20, letterSpacing: 8, borderRadius: 12, borderWidth: 1, borderColor: '#334B61', paddingHorizontal: 15, paddingVertical: 12 }, primaryButton: { marginTop: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 13, borderRadius: 12, backgroundColor: '#22D3EE' }, primaryText: { color: '#06131B', fontWeight: '900' }, privacy: { color: '#7F8EA3', fontSize: 10, textAlign: 'center', marginTop: 9 },
  clockContent: { padding: 18, paddingBottom: 45, alignItems: 'center' }, modeRow: { flexDirection: 'row', gap: 10, width: '100%' }, mode: { flex: 1, padding: 13, alignItems: 'center', borderRadius: 14, backgroundColor: '#172536' }, clockIn: { backgroundColor: '#166534' }, clockOut: { backgroundColor: '#991B1B' }, modeText: { color: '#FFF', fontWeight: '900' }, projectStrip: { marginTop: 16, maxHeight: 48, alignSelf: 'stretch' }, projectChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, backgroundColor: '#101E2D', borderWidth: 1, borderColor: '#263B50', marginRight: 8 }, projectSelected: { borderColor: '#22D3EE', backgroundColor: '#164E63' }, projectText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700' }, dots: { flexDirection: 'row', gap: 13, marginVertical: 24 }, dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#64748B' }, dotFilled: { backgroundColor: '#22D3EE', borderColor: '#22D3EE' }, keypad: { width: 280, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }, key: { width: 80, height: 61, borderRadius: 15, backgroundColor: '#101E2D', borderWidth: 1, borderColor: '#263B50', alignItems: 'center', justifyContent: 'center' }, keyText: { color: '#FFF', fontSize: 23, fontWeight: '800' }, actionKey: { backgroundColor: '#22D3EE', borderColor: '#22D3EE' },
});
