import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

const WS_URL = API_URL.replace('/api', '').replace('https', 'wss').replace('http', 'ws');

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { roomId, roomName } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join-room', roomId));
    socket.on('new-message', (msg: any) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    fetch(`${API_URL}/chat/messages/${roomId}`)
      .then(res => res.json())
      .then(data => setMessages(data.messages || []))
      .catch(err => console.error(err));

    return () => { socket.emit('leave-room', roomId); socket.disconnect(); };
  }, [roomId]);

  const sendMessage = () => {
    if (!input.trim()) return;
    socketRef.current?.emit('chat-message', {
      senderId: user?.id,
      companyId: user?.companyId,
      roomId,
      message: input.trim(),
    });
    setInput('');
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMine = item.sender_id === user?.id;
    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        {!isMine && <Text style={styles.sender}>{item.first_name} {item.last_name}</Text>}
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{roomName || 'Chat'}</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList ref={flatListRef} data={messages} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
      <View style={styles.inputBar}>
        <TextInput style={styles.textInput} value={input} onChangeText={setInput} placeholder="Message..." placeholderTextColor="#888" />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
  listContent: { padding: 16 },
  bubble: { maxWidth: '80%', marginBottom: 12, padding: 12, borderRadius: 12 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: '#1A1A1A' },
  sender: { color: '#00D4FF', fontSize: 12, marginBottom: 4 },
  message: { color: '#FFF', fontSize: 15 },
  time: { color: '#888', fontSize: 10, marginTop: 4, textAlign: 'right' },
  inputBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#333', alignItems: 'center' },
  textInput: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF', marginRight: 10 },
  sendBtn: { backgroundColor: '#00D4FF', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  sendText: { color: '#0A0A0A', fontWeight: '600' },
});