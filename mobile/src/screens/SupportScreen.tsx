import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
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
  is_ai?: boolean;
}

export default function SupportScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const [agentActive, setAgentActive] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [humanRequested, setHumanRequested] = useState(false);
  const [ticketRoom, setTicketRoom] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    api.getToken().then((token) => {
      if (!token) return;
      const socket = io(API_BASE, {
        transports: ['websocket'],
        auth: { token },
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        // Start in a temporary room – we'll switch when a ticket is created
        socket.emit('join-room', 'support-waiting');
        console.log('Connected to support');
      });

      socket.on('new-message', (msg: Message) => {
        setMessages((prev) => [...prev, msg]);
        if (msg.sender_id === '00000000-0000-0000-0000-000000000001') {
          setAiTyping(false);
        }
        if (msg.sender_id !== user?.id && msg.sender_id !== '00000000-0000-0000-0000-000000000001') {
          setAgentActive(true);
        }
      });

      // Agent joined the ticket room
      socket.on('agent-joined', (data: { ticketId: string }) => {
        setAgentActive(true);
        Alert.alert('Agent Joined', 'A support agent is now assisting you.');
      });

      return () => {
        if (ticketRoom) socket.emit('leave-room', ticketRoom);
        socket.disconnect();
      };
    });
  }, [user]);

  const send = () => {
    if (!input.trim() || !socketRef.current || !user) return;
    const messageText = input.trim();
    setInput('');

    // Determine which room to send to
    const room = ticketRoom || 'support-waiting';

    if (agentActive) {
      // Send directly to the ticket room (agent is there)
      socketRef.current.emit('chat-message', {
        senderId: user.id,
        companyId: (user as any).companyId || '',
        roomId: room,
        message: messageText,
      });
    } else {
      // Optimistic UI
      const tempMsg: Message = {
        id: `temp-${Date.now()}`,
        sender_id: user.id,
        sender_name: user.first_name + ' ' + user.last_name,
        message: messageText,
        created_at: new Date().toISOString(),
        is_ai: false,
      };
      setMessages((prev) => [...prev, tempMsg]);

      // Check for human request
      const humanKeywords = ['human', 'agent', 'talk to someone', 'real person', 'support agent'];
      if (humanKeywords.some(keyword => messageText.toLowerCase().includes(keyword))) {
        requestHumanSupport();
        socketRef.current?.emit('chat-message', {
          senderId: '00000000-0000-0000-0000-000000000001',
          companyId: (user as any).companyId || '',
          roomId: room,
          message: "I've notified our support team. They'll join shortly.",
        });
        return;
      }

      // AI response
      setAiTyping(true);
      api.post('/chatbot/query', { question: messageText })
        .then((res: any) => {
          socketRef.current?.emit('chat-message', {
            senderId: '00000000-0000-0000-0000-000000000001',
            companyId: (user as any).companyId || '',
            roomId: room,
            message: res.answer,
          });
          setAiTyping(false);
        })
        .catch(() => {
          socketRef.current?.emit('chat-message', {
            senderId: '00000000-0000-0000-0000-000000000001',
            companyId: (user as any).companyId || '',
            roomId: room,
            message: "I'm having trouble. Please try again or request a human.",
          });
          setAiTyping(false);
        });
    }
  };

  const requestHumanSupport = async () => {
    if (humanRequested) {
      Alert.alert('Already Requested', 'A support agent has been notified.');
      return;
    }
    try {
      const res = await api.post<{ ticketId: string }>('/support/request-human', {
        userId: user?.id,
        companyId: user?.companyId,
        userName: user?.first_name + ' ' + user?.last_name,
      });
      const ticketId = res.ticketId;
      const roomId = `support-ticket-${ticketId}`;
      setTicketRoom(roomId);

      // Leave waiting room and join ticket room
      socketRef.current?.emit('leave-room', 'support-waiting');
      socketRef.current?.emit('join-room', roomId);

      setHumanRequested(true);
      Alert.alert('Request Sent', 'Our support team has been notified. They will join shortly.');
    } catch (err) {
      Alert.alert('Error', 'Could not reach support. Please try again.');
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === user?.id;
    const isAI = item.sender_id === '00000000-0000-0000-0000-000000000001';
    const isAgent = !isMine && !isAI;
    return (
      <View style={[styles.bubble, isMine ? styles.bubbleMe : styles.bubbleThem, isAI && styles.bubbleAI, isAgent && styles.bubbleAgent]}>
        <Text style={styles.sender}>
          {item.sender_name || (isMine ? 'You' : isAI ? 'Lucy (AI)' : 'Support Agent')}
        </Text>
        <Text style={styles.msgText}>{item.message}</Text>
        <Text style={styles.time}>
          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {agentActive
            ? '👤 A support agent is online'
            : humanRequested
            ? '⏳ Agent will join shortly'
            : '🤖 Lucy (AI) is assisting you'}
        </Text>
        {!agentActive && !humanRequested && (
          <TouchableOpacity style={styles.humanRequestBtn} onPress={requestHumanSupport}>
            <Text style={styles.humanRequestText}>Request Human</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      {aiTyping && !agentActive && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>Lucy is typing...</Text>
          <ActivityIndicator size="small" color="#00D4FF" />
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={agentActive ? 'Type your message...' : 'Ask Lucy or request a human'}
          placeholderTextColor="#888"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
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

  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statusText: {
    color: '#00D4FF',
    fontSize: 14,
    fontWeight: '500',
  },
  humanRequestBtn: {
    backgroundColor: '#F44336',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  humanRequestText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  listContent: { padding: 16, paddingBottom: 8 },

  bubble: { marginBottom: 12, padding: 12, borderRadius: 12, maxWidth: '80%' },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333' },
  bubbleAI: { borderColor: '#00D4FF', borderWidth: 1 },
  bubbleAgent: { borderColor: '#4CAF50', borderWidth: 1 },

  sender: { color: '#FFF', fontWeight: 'bold', fontSize: 12, marginBottom: 4 },
  msgText: { color: '#FFF', fontSize: 14 },
  time: { color: '#888', fontSize: 10, marginTop: 4, textAlign: 'right' },

  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  typingText: {
    color: '#888',
    fontSize: 14,
    marginRight: 10,
  },

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