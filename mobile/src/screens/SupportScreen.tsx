import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
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

  // Agent status (human takeover)
  const [agentActive, setAgentActive] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState(false);
  // AI typing indicator
  const [aiTyping, setAiTyping] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check current agent status
    api
      .get('/support/status/support')
      .then((res: any) => setAgentActive(res.active))
      .catch(() => {});

    api.getToken().then((token) => {
      if (!token) return;
      const socket = io(API_BASE, {
        transports: ['websocket'],
        auth: { token },
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join-room', 'support');
        console.log('Connected to support room');
      });

      socket.on('new-message', (msg: Message) => {
        setMessages((prev) => [...prev, msg]);
        // If message is from AI, we can mark it as read
        if (msg.sender_id === '00000000-0000-0000-0000-000000000001') {
          // AI message – we could auto‑dismiss typing indicator
          setAiTyping(false);
        }
      });

      // Listen for agent status changes
      socket.on('agent-status', (data: { active: boolean }) => {
        setAgentActive(data.active);
      });

      // Listen for human support request notifications (optional)
      socket.on('human-requested', (data: { userId: string }) => {
        // Could show a toast or update UI
        console.log('Human support requested by user:', data.userId);
      });

      // Fetch existing support messages
      fetch(`${API_BASE}/api/chat/room/support`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) setMessages(data.messages);
        })
        .catch(console.error);

      return () => {
        socket.emit('leave-room', 'support');
        socket.disconnect();
      };
    });
  }, [user]);

  // Send a message (handles both human and AI routing)
  const send = () => {
    if (!input.trim() || !socketRef.current || !user) return;

    const messageText = input.trim();
    setInput('');

    // If a human agent is active, send directly to the room (human handles it)
    if (agentActive) {
      socketRef.current.emit('chat-message', {
        senderId: user.id,
        companyId: (user as any).companyId || '',
        roomId: 'support',
        message: messageText,
      });
    } else {
      // No human agent – AI handles it
      // First, add user message to the chat (optimistic update)
      const tempMsg: Message = {
        id: `temp-${Date.now()}`,
        sender_id: user.id,
        sender_name: user.firstName + ' ' + user.lastName,
        message: messageText,
        created_at: new Date().toISOString(),
        is_ai: false,
      };
      setMessages((prev) => [...prev, tempMsg]);

      // Emit user message so it appears in the room (optional, but we already added it)
      // We'll also send it to the chatbot endpoint
      setAiTyping(true);
      api
        .post('/chatbot/query', { question: messageText })
        .then((res: any) => {
          // Emit the AI response to the room
          socketRef.current?.emit('chat-message', {
            senderId: '00000000-0000-0000-0000-000000000001', // Lucy AI
            companyId: (user as any).companyId || '',
            roomId: 'support',
            message: res.answer,
          });
          setAiTyping(false);
        })
        .catch((err) => {
          console.error('Chatbot error:', err);
          // Fallback: send a generic error message
          socketRef.current?.emit('chat-message', {
            senderId: '00000000-0000-0000-0000-000000000001',
            companyId: (user as any).companyId || '',
            roomId: 'support',
            message: "I'm having trouble connecting. Please try again later or request human support.",
          });
          setAiTyping(false);
        });
    }
  };

  // Toggle takeover (for managers/bosses)
  const toggleTakeover = async () => {
    if (loadingAgent) return;
    setLoadingAgent(true);
    const action = agentActive ? 'leave' : 'join';
    try {
      await api.post('/support/takeover', {
        userId: user?.id,
        roomId: 'support',
        action,
      });
      setAgentActive(!agentActive);
      Alert.alert(
        'Success',
        agentActive ? 'You left support mode' : 'You are now a support agent'
      );
    } catch (err) {
      Alert.alert('Error', 'Could not change takeover status');
    } finally {
      setLoadingAgent(false);
    }
  };

  // Request human support (user escalation)
  const requestHuman = async () => {
    if (agentActive) {
      Alert.alert('Info', 'A human agent is already active.');
      return;
    }
    try {
      // Notify the server that this user needs human support
      await api.post('/support/request-human', {
        userId: user?.id,
        roomId: 'support',
      });
      // Also emit a socket event to notify agents
      socketRef.current?.emit('request-human', {
        userId: user?.id,
        userName: user?.firstName + ' ' + user?.lastName,
      });
      Alert.alert(
        'Request Sent',
        'A human support agent has been notified. They will join shortly.'
      );
    } catch (err) {
      Alert.alert('Error', 'Could not request human support. Please try again.');
    }
  };

  // Render each message
  const renderItem = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === user?.id;
    const isAI = item.sender_id === '00000000-0000-0000-0000-000000000001';
    return (
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMe : styles.bubbleThem,
          isAI && styles.bubbleAI,
        ]}
      >
        <Text style={styles.sender}>
          {item.sender_name ||
            (isMine
              ? 'You'
              : isAI
              ? 'Lucy (AI)'
              : 'Support')}
        </Text>
        <Text style={styles.msgText}>{item.message}</Text>
        <Text style={styles.time}>
          {new Date(item.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Support</Text>

        {/* Agent takeover button (managers/bosses) */}
        {(user?.role === 'boss' || user?.role === 'manager') && (
          <TouchableOpacity
            onPress={toggleTakeover}
            style={styles.takeoverBtn}
            disabled={loadingAgent}
          >
            <MaterialIcons
              name="people"
              size={24}
              color={agentActive ? '#4CAF50' : '#FFF'}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Status indicator */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {agentActive
            ? '👤 A human agent is online'
            : '🤖 Lucy (AI) is assisting you'}
        </Text>
        {!agentActive && (
          <TouchableOpacity style={styles.humanRequestBtn} onPress={requestHuman}>
            <Text style={styles.humanRequestText}>Request Human</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      {/* AI typing indicator */}
      {aiTyping && !agentActive && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>Lucy is typing...</Text>
          <ActivityIndicator size="small" color="#00D4FF" />
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={
            agentActive
              ? 'Type your message...'
              : 'Ask Lucy or request human support...'
          }
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
  takeoverBtn: { marginRight: 12, padding: 4 },

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
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
  },
  bubbleAI: { borderColor: '#00D4FF', borderWidth: 1 },
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