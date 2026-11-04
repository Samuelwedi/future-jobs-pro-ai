import { AdaptiveModal as Modal } from '../components/AdaptiveModal';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  TextInput,  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

interface Member {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  needs_password_change: boolean;
  last_login: string;
}

export default function TeamScreen() {
  const { user, refreshUser } = useAuth();
  const navigation = useNavigation();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formRole, setFormRole] = useState('employee');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);
  const role = String(user?.role || '').toLowerCase();
  const canManage = ['boss', 'manager', 'admin'].includes(role);
  const canChangeRoles = ['boss', 'admin'].includes(role);
  const runMutation = async (work: () => Promise<void>) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true);
    try { await work(); }
    catch (cause: any) { Alert.alert('Action failed', cause?.response?.data?.message || cause?.message || 'Please try again'); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const fetchMembers = async () => {
    setError('');
    try {
      const res = await api.get<{ success: boolean; members: Member[] }>(`/team/members/${user?.companyId}`);
      setMembers(res.members || []);
    } catch { setError('Could not load your team. Pull down to try again.'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchMembers(); };

  const handleInvite = async () => {
    if (!canManage || mutationLock.current) return;
    if (!formEmail.trim() || !formFirstName.trim() || !formLastName.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    await runMutation(async () => {
      const res = await api.post<{ success: boolean; tempPassword: string; emailSent: boolean }>('/team/invite', {
        companyId: user?.companyId,
        email: formEmail.trim().toLowerCase(),
        firstName: formFirstName.trim(),
        lastName: formLastName.trim(),
        role: canChangeRoles ? formRole : 'employee',
        invitedBy: user?.id,
      });
      Alert.alert('Employee created', `${res.emailSent ? 'The email provider accepted the invitation.' : 'The account was created, but invitation email delivery failed.'}\n\nTemporary password: ${res.tempPassword}\n\nShare this securely. The employee must change it after signing in.`);
      setModalVisible(false);
      setFormEmail(''); setFormFirstName(''); setFormLastName('');
      await fetchMembers();
    });
  };

  const handleChangeRole = (member: Member) => {
    if (!canChangeRoles || busy) return;
    const newRole = member.role === 'employee' ? 'manager' : 'employee';
    Alert.alert('Change Role', `Change ${member.first_name}'s role to ${newRole}?`, [
      { text: 'Cancel' },
      { text: 'Yes', onPress: () => runMutation(async () => {
        await api.put(`/team/${member.id}/role`, { role: newRole, companyId: user?.companyId });
        await fetchMembers();
      })}
    ]);
  };

  const handleTransferOwnership = (member: Member) => {
    if (role !== 'boss' || busy) return;
    Alert.alert(
      'Make this manager the Boss?',
      `${member.first_name} ${member.last_name} will become the company owner. Your account will become a manager.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Final confirmation',
            'This transfers company-wide Boss permissions. You will need to sign in again so your permissions refresh.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Transfer ownership',
                style: 'destructive',
                onPress: () => runMutation(async () => {
                    const response = await api.post<{ success: boolean; message: string }>(
                      `/team/${member.id}/transfer-ownership`,
                      { confirmation: 'TRANSFER OWNERSHIP' },
                    );
                    Alert.alert('Ownership transferred', `${response.message}. Sign in again if prompted to refresh your access.`);
                    const refreshed = await refreshUser().catch(() => null);
                    if (refreshed) await fetchMembers();
                }),
              },
            ],
          ),
        },
      ],
    );
  };

  const handleRemove = (member: Member) => {
    if (!canManage || busy) return;
    Alert.alert('Remove Employee', `Are you sure you want to remove ${member.first_name}?`, [
      { text: 'Cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => runMutation(async () => {
        await api.delete(`/team/${member.id}`);
        await fetchMembers();
      })}
    ]);
  };

  const renderMember = ({ item }: { item: Member }) => (
    <View style={styles.memberCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.memberName}>{item.first_name} {item.last_name}</Text>
        <Text style={styles.memberEmail}>{item.email}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Text style={[styles.roleBadge, item.role === 'boss' && styles.roleBoss, item.role === 'manager' && styles.roleManager]}>{item.role}</Text>
          {item.needs_password_change && <Text style={styles.needsPwBadge}>Needs Password</Text>}
        </View>
      </View>
      <View style={styles.actions}>
        {canChangeRoles && item.id !== user?.id && item.role !== 'boss' && <TouchableOpacity disabled={busy} accessibilityLabel="Change role" onPress={() => handleChangeRole(item)}>
          <MaterialIcons name="swap-horiz" size={24} color="#00D4FF" />
        </TouchableOpacity>}
        {role === 'boss' && item.role === 'manager' && <TouchableOpacity disabled={busy}
          accessibilityLabel={`Make ${item.first_name} the company Boss`}
          onPress={() => handleTransferOwnership(item)}
        >
          <MaterialIcons name="workspace-premium" size={24} color="#FFD54F" />
        </TouchableOpacity>}
        {canManage && item.id !== user?.id && item.role !== 'boss' && <TouchableOpacity disabled={busy} accessibilityLabel="Remove employee" onPress={() => handleRemove(item)}>
          <MaterialIcons name="delete" size={24} color="#F44336" />
        </TouchableOpacity>}
      </View>
    </View>
  );

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team</Text>
        <View style={{ width: 40 }} />
      </View>
      {error ? <Text accessibilityRole="alert" style={{color:'#FDA4AF',padding:16}}>{error}</Text> : null}
      <FlatList
        data={members}
        renderItem={renderMember}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={!error ? <Text style={styles.empty}>No team members</Text> : null}
      />
      {canManage && <TouchableOpacity disabled={busy} accessibilityLabel="Invite employee" style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="person-add" size={28} color="#0A0A0A" />
      </TouchableOpacity>}

      <Modal visible={modalVisible} onRequestClose={() => !busy && setModalVisible(false)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ flexGrow: 0, maxHeight: '100%' }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.modalTitle}>Invite Employee</Text>
            <TextInput editable={!busy} style={styles.input} maxLength={254} keyboardType="email-address" placeholder="Email" placeholderTextColor="#888" value={formEmail} onChangeText={setFormEmail} autoCapitalize="none" />
            <TextInput editable={!busy} style={styles.input} maxLength={200} placeholder="First Name" placeholderTextColor="#888" value={formFirstName} onChangeText={setFormFirstName} />
            <TextInput editable={!busy} style={styles.input} maxLength={200} placeholder="Last Name" placeholderTextColor="#888" value={formLastName} onChangeText={setFormLastName} />
            <View style={styles.roleRow}>
              <TouchableOpacity disabled={busy} style={[styles.roleBtn, formRole === 'employee' && styles.roleBtnActive]} onPress={() => setFormRole('employee')}>
                <Text style={[styles.roleBtnText, formRole === 'employee' && styles.roleBtnTextActive]}>Employee</Text>
              </TouchableOpacity>
              {canChangeRoles && <TouchableOpacity disabled={busy} style={[styles.roleBtn, formRole === 'manager' && styles.roleBtnActive]} onPress={() => setFormRole('manager')}>
                <Text style={[styles.roleBtnText, formRole === 'manager' && styles.roleBtnTextActive]}>Manager</Text>
              </TouchableOpacity>}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity disabled={busy} onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={busy} onPress={handleInvite} style={styles.submitBtn}>
                <Text style={styles.submitText}>{busy ? 'Inviting…' : 'Invite'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', padding: 8, marginLeft: 4 },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  list: { paddingHorizontal: 20 },
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  memberName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  memberEmail: { color: '#888', fontSize: 13, marginTop: 2 },
  roleBadge: { backgroundColor: '#00D4FF20', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, color: '#00D4FF', fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  roleBoss: { backgroundColor: '#E91E6320', color: '#E91E63' },
  roleManager: { backgroundColor: '#FF980020', color: '#FF9800' },
  needsPwBadge: { backgroundColor: '#F4433620', color: '#F44336', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: 16 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#00D4FF', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: { backgroundColor: '#0A0A0A', borderRadius: 10, padding: 12, color: '#FFF', borderWidth: 1, borderColor: '#333', marginBottom: 12 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  roleBtnActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  roleBtnText: { color: '#888', fontWeight: '500' },
  roleBtnTextActive: { color: '#0A0A0A', fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#888' },
  cancelText: { color: '#888' },
  submitBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#00D4FF' },
  submitText: { color: '#0A0A0A', fontWeight: '600' },
});
