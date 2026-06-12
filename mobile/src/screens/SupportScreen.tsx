import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { io, Socket } from 'socket.io-client';
import { useNavigation } from '@react-navigation/native';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Message {
  id: string;
  sender_id: string;
  sender_name?: string;
  message: string;
  created_at: string;
}

export default function SupportScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!user) return;

    // Get the JWT token from the API service
    api.getToken().then((token) => {
      if (!token) return;

      const socket = io(API_BASE, {
        transports: ['websocket'],
        auth: { token },
      });
      socketRef.current = socket;

      socket.on('connect', () => socket.emit('join-room', 'support'));
      socket.on('new-message', (msg: Message) =>
        setMessages((prev) => [...prev, msg])
      );

      // Fetch existing support messages
      fetch(`${API_BASE}/api/chat/room/support`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) setMessages(data.messages);
        })
        .catch(console.error);
    });

    return () => {
      socketRef.current?.emit('leave-room', 'support');
      socketRef.current?.disconnect();
    };
  }, [user]);

  const send = () => {
    if (!input.trim() || !socketRef.current || !user) return;
    socketRef.current.emit('chat-message', {
      senderId: user.id,
      companyId: (user as any).companyId || '',
      roomId: 'support',
      message: input.trim(),
    });
    setInput('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Support</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.sender_id === user?.id ? styles.bubbleMe : styles.bubbleThem,
            ]}
          >
            <Text style={styles.sender}>
              {item.sender_name ||
                (item.sender_id === user?.id ? 'You' : 'Support')}
            </Text>
            <Text style={styles.msgText}>{item.message}</Text>
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Type your message..."
          placeholderTextColor="#888"
          value={input}
          onChangeText={setInput}
        />
        <TouchableOpacity onPress={send} style={styles.sendBtn}>
          <MaterialIcons name="send" size={24} color="#0A0A0A" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: { padding: 8, marginLeft: 4 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  bubble: { margin: 8, padding: 12, borderRadius: 12, maxWidth: '80%' },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
  },
  sender: { color: '#FFF', fontWeight: 'bold', fontSize: 12, marginBottom: 4 },
  msgText: { color: '#FFF', fontSize: 14 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  input: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#FFF',
    marginRight: 8,
  },
  sendBtn: {
    backgroundColor: '#00D4FF',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});