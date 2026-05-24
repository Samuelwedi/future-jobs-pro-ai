import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, RefreshControl, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface PTORequest { id: string; start_date: string; end_date: string; type: string; status: string; reason?: string; created_at: string; }
interface PTOBalance { vacation_days: number; sick_days: number; personal_days: number; }

export default function PTOScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [requests, setRequests] = useState<PTORequest[]>([]);
  const [balance, setBalance] = useState<PTOBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('vacation');
  const [reason, setReason] = useState('');

  const fetchData = async () => {
    try {
      const [reqRes, balRes] = await Promise.all([
        api.get<{ success: boolean; requests: PTORequest[] }>(`/pto/user/${user?.id}`),
        api.get<{ success: boolean; balance: PTOBalance }>(`/pto/balance/${user?.id}`),
      ]);
      setRequests(reqRes.requests || []);
      setBalance(balRes.balance || { vacation_days: 10, sick_days: 5, personal_days: 3 });
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmitRequest = async () => {
    if (!startDate || !endDate) { Alert.alert('Missing dates'); return; }
    try {
      await api.post('/pto/request', { userId: user?.id, companyId: user?.companyId, startDate, endDate, type: leaveType, reason });
      Alert.alert('Success', 'PTO request submitted!');
      setModalVisible(false);
      setStartDate(''); setEndDate(''); setReason('');
      fetchData();
    } catch (e: any) { Alert.alert('Error', e.message || 'Failed to submit request'); }
  };

  const getStatusColor = (status: string) => status === 'approved' ? '#4CAF50' : status === 'rejected' ? '#F44336' : '#FF9800';

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Time Off</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)}>
          <MaterialIcons name="add-circle" size={32} color="#00D4FF" />
        </TouchableOpacity>
      </View>
      {balance && (
        <View style={styles.balanceRow}>
          <View style={styles.balanceCard}><Text style={styles.balanceValue}>{balance.vacation_days}</Text><Text style={styles.balanceLabel}>Vacation</Text></View>
          <View style={styles.balanceCard}><Text style={styles.balanceValue}>{balance.sick_days}</Text><Text style={styles.balanceLabel}>Sick</Text></View>
          <View style={styles.balanceCard}><Text style={styles.balanceValue}>{balance.personal_days}</Text><Text style={styles.balanceLabel}>Personal</Text></View>
        </View>
      )}
      <ScrollView style={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#00D4FF" />}>
        {requests.map(r => (
          <View key={r.id} style={styles.requestCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.requestType}>{r.type.toUpperCase()}</Text>
              <Text style={styles.requestDates}>{r.start_date} → {r.end_date}</Text>
              {r.reason ? <Text style={styles.requestReason}>{r.reason}</Text> : null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(r.status) }]}><Text style={styles.statusText}>{r.status}</Text></View>
          </View>
        ))}
        {requests.length === 0 && <Text style={styles.emptyText}>No PTO requests yet</Text>}
      </ScrollView>
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Request Time Off</Text>
            <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2025-07-01" placeholderTextColor="#888" />
            <Text style={styles.label}>End Date (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2025-07-03" placeholderTextColor="#888" />
            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {['vacation','sick','personal'].map(t => (
                <TouchableOpacity key={t} onPress={() => setLeaveType(t)} style={[styles.typeBtn, leaveType === t && styles.typeBtnActive]}>
                  <Text style={[styles.typeBtnText, leaveType === t && styles.typeBtnTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Reason (optional)</Text>
            <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Family vacation..." placeholderTextColor="#888" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleSubmitRequest} style={styles.submitBtn}><Text style={styles.submitText}>Submit</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  balanceRow: { flexDirection: 'row', padding: 16, gap: 10 },
  balanceCard: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  balanceValue: { color: '#00D4FF', fontSize: 28, fontWeight: 'bold' },
  balanceLabel: { color: '#888', fontSize: 13, marginTop: 4 },
  list: { flex: 1, paddingHorizontal: 16 },
  requestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  requestType: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  requestDates: { color: '#AAA', fontSize: 13, marginTop: 4 },
  requestReason: { color: '#888', fontSize: 12, marginTop: 4 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  statusText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  label: { color: '#888', fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#0A0A0A', borderRadius: 10, padding: 12, color: '#FFF', borderWidth: 1, borderColor: '#333' },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  typeBtnText: { color: '#888', fontWeight: '500' },
  typeBtnTextActive: { color: '#0A0A0A', fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 24 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#888' },
  cancelText: { color: '#888' },
  submitBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#00D4FF' },
  submitText: { color: '#0A0A0A', fontWeight: '600' },
});