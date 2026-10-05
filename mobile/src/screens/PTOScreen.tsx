import { AdaptiveModal as Modal } from '../components/AdaptiveModal';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface PTORequest { id: string; start_date: string; end_date: string; type: string; status: string; reason?: string; created_at: string; user_name?:string; user_email?:string; manager_note?:string; approved_by_name?:string; approved_at?:string; calendar_days?:number; }
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
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all'|'pending'|'approved'|'rejected'>('all');
  const [selected, setSelected] = useState<PTORequest | null>(null);
  const [decision, setDecision] = useState<'approved'|'rejected'|null>(null);
  const [managerNote, setManagerNote] = useState('');
  const [saving, setSaving] = useState(false);
  const manager=['boss','manager','admin'].includes(String(user?.role||'').toLowerCase());

  const fetchData = async () => {
    setError('');
    try {
      const [reqRes, balRes] = await Promise.all([
        api.get<{ success: boolean; requests: PTORequest[] }>(manager?'/pto-history':'/pto/mine'),
        api.get<{ success: boolean; balance: PTOBalance }>('/pto/balance'),
      ]);
      setRequests(reqRes.requests || []);
      setBalance(balRes.balance || { vacation_days: 10, sick_days: 5, personal_days: 3 });
    } catch (e: any) { console.error(e); setError(e?.message || 'PTO information could not be loaded'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmitRequest = async () => {
    if (!startDate || !endDate) { Alert.alert('Missing dates'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) { Alert.alert('Invalid date', 'Use YYYY-MM-DD format.'); return; }
    if (endDate < startDate) { Alert.alert('Invalid range', 'End date cannot be before start date.'); return; }
    try {
      await api.post('/pto', { start_date: startDate, end_date: endDate, type: leaveType, reason });
      Alert.alert('Success', 'PTO request submitted!');
      setModalVisible(false);
      setStartDate(''); setEndDate(''); setReason('');
      fetchData();
    } catch (e: any) { Alert.alert('Error', e.message || 'Failed to submit request'); }
  };

  const getStatusColor = (status: string) => status === 'approved' ? '#4CAF50' : status === 'rejected' ? '#F44336' : '#FF9800';
  const calendarDays=(request:PTORequest)=>Number(request.calendar_days||Math.max(1,Math.round((new Date(request.end_date).getTime()-new Date(request.start_date).getTime())/86400000)+1));
  const visibleRequests=requests.filter(request=>filter==='all'||request.status===filter);
  const openDecision=(request:PTORequest,status:'approved'|'rejected')=>{setSelected(request);setDecision(status);setManagerNote(request.manager_note||'');};
  const decide=async()=>{if(!selected||!decision)return;if(decision==='rejected'&&managerNote.trim().length<3){Alert.alert('Reason required','Add a reason for rejecting this request.');return;}setSaving(true);try{await api.patch(`/pto-history/${selected.id}/status`,{status:decision,managerNote:managerNote.trim()});Alert.alert('Updated',`PTO request ${decision}.`);setDecision(null);setSelected(null);setManagerNote('');await fetchData();}catch(cause:any){Alert.alert('Update failed',cause?.response?.data?.message||cause?.message||'Could not update PTO');}finally{setSaving(false);}};

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
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
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filterContent}>
        {(['all','pending','approved','rejected'] as const).map(value=><TouchableOpacity key={value} onPress={()=>setFilter(value)} style={[styles.filterBtn,filter===value&&styles.filterBtnActive]}><Text style={[styles.filterText,filter===value&&styles.filterTextActive]}>{value.toUpperCase()} ({value==='all'?requests.length:requests.filter(item=>item.status===value).length})</Text></TouchableOpacity>)}
      </ScrollView>
      <ScrollView style={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#00D4FF" />}>
        {visibleRequests.map(r => (
          <TouchableOpacity key={r.id} style={styles.requestCard} onPress={()=>setSelected(r)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.requestType}>{r.type.toUpperCase()}</Text>
              {r.user_name?<Text style={{color:'#00D4FF',fontWeight:'800',marginTop:3}}>{r.user_name}</Text>:null}
              <Text style={styles.requestDates}>{r.start_date} → {r.end_date}</Text>
              <Text style={styles.duration}>{calendarDays(r)} calendar day{calendarDays(r)===1?'':'s'}</Text>
              {r.reason ? <Text style={styles.requestReason}>{r.reason}</Text> : null}
              <Text style={styles.requestReason}>Submitted {new Date(r.created_at).toLocaleString()}</Text>
              {r.manager_note?<Text style={styles.requestReason}>Manager note: {r.manager_note}</Text>:null}
              {manager&&r.status==='pending'?<View style={{flexDirection:'row',gap:8,marginTop:10}}><TouchableOpacity onPress={()=>openDecision(r,'approved')} style={{backgroundColor:'#1F7A46',padding:8,borderRadius:8}}><Text style={{color:'#FFF',fontWeight:'800'}}>Approve</Text></TouchableOpacity><TouchableOpacity onPress={()=>openDecision(r,'rejected')} style={{backgroundColor:'#9C3541',padding:8,borderRadius:8}}><Text style={{color:'#FFF',fontWeight:'800'}}>Reject</Text></TouchableOpacity></View>:null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(r.status) }]}><Text style={styles.statusText}>{r.status}</Text></View>
          </TouchableOpacity>
        ))}
        {visibleRequests.length === 0 && <Text style={styles.emptyText}>No {filter==='all'?'':filter} PTO requests</Text>}
      </ScrollView>
      <Modal visible={modalVisible} onRequestClose={() => setModalVisible(false)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ flexGrow: 0, maxHeight: '100%' }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={Boolean(selected)&&!decision} animationType="fade" transparent onRequestClose={()=>setSelected(null)}>
        <View style={styles.modalOverlay}><ScrollView style={{ flexGrow: 0, maxHeight: '100%' }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{selected&&<>
          <Text style={styles.modalTitle}>PTO request details</Text>
          <Text style={styles.detailName}>{selected.user_name||'My request'}</Text>
          {selected.user_email?<Text style={styles.detailMuted}>{selected.user_email}</Text>:null}
          <View style={styles.detailGrid}><Text style={styles.detailLabel}>Type</Text><Text style={styles.detailValue}>{selected.type}</Text><Text style={styles.detailLabel}>Dates</Text><Text style={styles.detailValue}>{selected.start_date} → {selected.end_date}</Text><Text style={styles.detailLabel}>Duration</Text><Text style={styles.detailValue}>{calendarDays(selected)} calendar day(s)</Text><Text style={styles.detailLabel}>Status</Text><Text style={styles.detailValue}>{selected.status}</Text><Text style={styles.detailLabel}>Reason</Text><Text style={styles.detailValue}>{selected.reason||'No reason supplied'}</Text><Text style={styles.detailLabel}>Submitted</Text><Text style={styles.detailValue}>{new Date(selected.created_at).toLocaleString()}</Text>{selected.manager_note?<><Text style={styles.detailLabel}>Manager note</Text><Text style={styles.detailValue}>{selected.manager_note}</Text></>:null}{selected.approved_by_name?<><Text style={styles.detailLabel}>Decided by</Text><Text style={styles.detailValue}>{selected.approved_by_name}</Text></>:null}</View>
          <TouchableOpacity onPress={()=>setSelected(null)} style={styles.submitBtn}><Text style={styles.submitText}>Close</Text></TouchableOpacity>
        </>}</ScrollView></View>
      </Modal>
      <Modal visible={Boolean(selected)&&Boolean(decision)} animationType="fade" transparent onRequestClose={()=>!saving&&setDecision(null)}>
        <View style={styles.modalOverlay}><ScrollView style={{ flexGrow: 0, maxHeight: '100%' }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"><Text style={styles.modalTitle}>{decision==='approved'?'Approve':'Reject'} PTO request</Text><Text style={styles.detailMuted}>{selected?.user_name} · {selected?calendarDays(selected):0} day(s)</Text><Text style={styles.label}>{decision==='rejected'?'Reason (required)':'Manager note (optional)'}</Text><TextInput style={[styles.input,{minHeight:84}]} multiline value={managerNote} onChangeText={setManagerNote} placeholder="Add decision details" placeholderTextColor="#888"/><View style={styles.modalActions}><TouchableOpacity disabled={saving} onPress={()=>setDecision(null)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={decide} style={[styles.submitBtn,decision==='rejected'&&{backgroundColor:'#F44336'}]}><Text style={styles.submitText}>{saving?'Saving…':'Confirm'}</Text></TouchableOpacity></View></ScrollView></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  balanceRow: { flexDirection: 'row', padding: 16, gap: 10 },
  balanceCard: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  balanceValue: { color: '#00D4FF', fontSize: 28, fontWeight: 'bold' },
  balanceLabel: { color: '#888', fontSize: 13, marginTop: 4 },
  list: { flex: 1, paddingHorizontal: 16 },
  filters: { maxHeight: 52 },
  filterContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  filterBtn: { borderWidth: 1, borderColor: '#334155', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  filterBtnActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  filterText: { color: '#94A3B8', fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: '#071018' },
  errorText: { color: '#FF718B', paddingHorizontal: 16, paddingBottom: 8 },
  requestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  requestType: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  requestDates: { color: '#AAA', fontSize: 13, marginTop: 4 },
  duration: { color: '#67E8F9', fontSize: 11, marginTop: 3, fontWeight: '700' },
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
  detailName: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  detailMuted: { color: '#94A3B8', marginTop: 3 },
  detailGrid: { marginVertical: 18, gap: 6 },
  detailLabel: { color: '#64748B', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 7 },
  detailValue: { color: '#F8FAFC', fontSize: 14 },
});
