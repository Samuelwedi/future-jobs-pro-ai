import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

export default function NewChatScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ success: boolean; users: any[] }>(`/users/company/${user?.companyId}`)
      .then(res => setUsers(res.users.filter((u: any) => u.id !== user?.id)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleUser = (id: string) => {
    if (isGroup) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    } else {
      setSelectedIds(prev => prev.includes(id) ? [] : [id]);
    }
  };

  const createChat = async () => {
    if (selectedIds.length === 0) return Alert.alert('Select at least one person');
    try {
      if (isGroup) {
        if (!groupName.trim()) return Alert.alert('Enter a group name');
        const res = await api.post<{ success: boolean; roomId: string }>('/chat/create-group', { name: groupName.trim(), creatorId: user?.id, memberIds: selectedIds });
        navigation.replace('Chat', { roomId: res.roomId, roomName: groupName.trim() });
      } else {
        const res = await api.post<{ success: boolean; roomId: string }>('/chat/create-direct', { userId1: user?.id, userId2: selectedIds[0] });
        const otherUser = users.find(u => u.id === selectedIds[0]);
        navigation.replace('Chat', { roomId: res.roomId, roomName: otherUser ? `${otherUser.first_name} ${otherUser.last_name}` : 'Chat' });
      }
    } catch (e) { Alert.alert('Error', 'Could not create chat'); }
  };

  const renderUser = ({ item }: { item: any }) => {
    const isSelected = selectedIds.includes(item.id);
    return (
      <TouchableOpacity style={[styles.userRow, isSelected && styles.userRowSelected]} onPress={() => toggleUser(item.id)}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{item.first_name.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.first_name} {item.last_name}</Text>
          <Text style={styles.userRole}>{item.role}</Text>
        </View>
        {isSelected && <Text style={styles.check}>✓</Text>}
      </TouchableOpacity>
    );
  };

  if (loading) return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Chat</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.toggleRow}>
        <TouchableOpacity onPress={() => { setIsGroup(false); setSelectedIds([]); }} style={[styles.toggle, !isGroup && styles.toggleActive]}>
          <Text style={[styles.toggleText, !isGroup && styles.toggleTextActive]}>Direct</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setIsGroup(true); setSelectedIds([]); }} style={[styles.toggle, isGroup && styles.toggleActive]}>
          <Text style={[styles.toggleText, isGroup && styles.toggleTextActive]}>Group</Text>
        </TouchableOpacity>
      </View>
      {isGroup && <TextInput style={styles.groupNameInput} placeholder="Group name" placeholderTextColor="#888" value={groupName} onChangeText={setGroupName} />}
      <FlatList data={users} renderItem={renderUser} keyExtractor={item => item.id} contentContainerStyle={styles.list} />
      <TouchableOpacity style={styles.createBtn} onPress={createChat}>
        <Text style={styles.createBtnText}>{isGroup ? 'Create Group' : 'Start Chat'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginLeft: 16 },
  toggleRow: { flexDirection: 'row', padding: 16, justifyContent: 'center', gap: 12 },
  toggle: { paddingHorizontal: 28, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: '#888' },
  toggleActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  toggleText: { color: '#888', fontSize: 14, fontWeight: '500' },
  toggleTextActive: { color: '#0A0A0A', fontWeight: '600' },
  groupNameInput: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14, color: '#FFF', marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
  userRowSelected: { backgroundColor: '#1A3A4A', borderRadius: 12, paddingHorizontal: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00D4FF', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#0A0A0A', fontSize: 18, fontWeight: 'bold' },
  userInfo: { flex: 1 },
  userName: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  userRole: { color: '#888', fontSize: 12, marginTop: 2 },
  check: { color: '#00D4FF', fontSize: 20, fontWeight: 'bold' },
  createBtn: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: '#00D4FF', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  createBtnText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 },
});