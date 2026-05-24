import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  TextInput, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

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
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formRole, setFormRole] = useState('employee');
  const [tempPassword, setTempPassword] = useState('');

  const fetchMembers = async () => {
    try {
      const res = await api.get<{ success: boolean; members: Member[] }>(`/team/members/${user?.companyId}`);
      setMembers(res.members || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchMembers(); };

  const handleInvite = async () => {
    if (!formEmail || !formFirstName || !formLastName) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    try {
      const res = await api.post<{ success: boolean; tempPassword: string }>('/team/invite', {
        companyId: user?.companyId,
        email: formEmail,
        firstName: formFirstName,
        lastName: formLastName,
        role: formRole,
        invitedBy: user?.id,
      });
      setTempPassword(res.tempPassword);
      Alert.alert('Employee Invited', `Temporary password: ${res.tempPassword}\n\nGive this to the employee. They can change it after logging in.`);
      setModalVisible(false);
      setFormEmail(''); setFormFirstName(''); setFormLastName('');
      fetchMembers();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleChangeRole = (member: Member) => {
    const newRole = member.role === 'employee' ? 'manager' : 'employee';
    Alert.alert('Change Role', `Change ${member.first_name}'s role to ${newRole}?`, [
      { text: 'Cancel' },
      { text: 'Yes', onPress: async () => {
        await api.put(`/team/${member.id}/role`, { role: newRole, companyId: user?.companyId });
        fetchMembers();
      }}
    ]);
  };

  const handleRemove = (member: Member) => {
    Alert.alert('Remove Employee', `Are you sure you want to remove ${member.first_name}?`, [
      { text: 'Cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await api.delete(`/team/${member.id}`);
        fetchMembers();
      }}
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
        <TouchableOpacity onPress={() => handleChangeRole(item)}>
          <MaterialIcons name="swap-horiz" size={24} color="#00D4FF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleRemove(item)}>
          <MaterialIcons name="delete" size={24} color="#F44336" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Team</Text>
      <FlatList
        data={members}
        renderItem={renderMember}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={<Text style={styles.empty}>No team members</Text>}
      />
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="person-add" size={28} color="#0A0A0A" />
      </TouchableOpacity>

      {/* Invite Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invite Employee</Text>
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#888" value={formEmail} onChangeText={setFormEmail} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="First Name" placeholderTextColor="#888" value={formFirstName} onChangeText={setFormFirstName} />
            <TextInput style={styles.input} placeholder="Last Name" placeholderTextColor="#888" value={formLastName} onChangeText={setFormLastName} />
            <View style={styles.roleRow}>
              <TouchableOpacity style={[styles.roleBtn, formRole === 'employee' && styles.roleBtnActive]} onPress={() => setFormRole('employee')}>
                <Text style={[styles.roleBtnText, formRole === 'employee' && styles.roleBtnTextActive]}>Employee</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roleBtn, formRole === 'manager' && styles.roleBtnActive]} onPress={() => setFormRole('manager')}>
                <Text style={[styles.roleBtnText, formRole === 'manager' && styles.roleBtnTextActive]}>Manager</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleInvite} style={styles.submitBtn}>
                <Text style={styles.submitText}>Invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { color: '#FFF', fontSize: 24, fontWeight: 'bold', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
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