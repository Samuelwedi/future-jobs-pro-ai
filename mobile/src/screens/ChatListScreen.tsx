import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface Room {
  id: string;
  name: string | null;
  is_group: boolean;
  other_user_name?: string;
}

export default function ChatListScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRooms = async () => {
    try {
      const res = await api.get<{ success: boolean; rooms: Room[] }>(`/chat/rooms/${user?.id}`);
      setRooms(res.rooms || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadRooms(); }, []));

  const onRefresh = () => { setRefreshing(true); loadRooms(); };

  const renderRoom = ({ item }: { item: Room }) => {
    const title = item.is_group ? (item.name || 'Unnamed Group') : (item.other_user_name || 'Unknown User');
    return (
      <TouchableOpacity
        style={styles.roomCard}
        onPress={() => navigation.navigate('Chat', { roomId: item.id, roomName: title })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.is_group ? '#' : title.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.roomInfo}>
          <Text style={styles.roomName}>{title}</Text>
          <Text style={styles.roomSubtitle}>{item.is_group ? 'Group' : 'Direct message'}</Text>
        </View>
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
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={rooms}
        renderItem={renderRoom}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4FF" />}
        ListEmptyComponent={<Text style={styles.emptyText}>No conversations yet</Text>}
      />
      <TouchableOpacity style={styles.newChatBtn} onPress={() => navigation.navigate('NewChat')}>
        <Text style={styles.newChatBtnText}>+ New Chat</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginLeft: 16 },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  roomCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#00D4FF', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#0A0A0A', fontSize: 20, fontWeight: 'bold' },
  roomInfo: { flex: 1 },
  roomName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  roomSubtitle: { color: '#888', fontSize: 13, marginTop: 3 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  newChatBtn: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#00D4FF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30, elevation: 5 },
  newChatBtnText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 },
});