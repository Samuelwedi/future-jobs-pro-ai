import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

interface Message {
  text: string;
  isUser: boolean;
}

export default function AIAssistantScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hi! I'm Lucy. I can schedule, run payroll, and generate reports. Try me!", isUser: false },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load conversation history (same as web)
  useEffect(() => {
    if (!user) return;
    api.get(`/lucy/history`)
      .then((data: any) => {
        if (data.messages) {
          const history = data.messages.map((m: any) => ({
            text: m.content,
            isUser: m.role === 'user',
          }));
          setMessages(prev => [...prev, ...history]);
        }
      })
      .catch(() => {});
  }, [user]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setMessages(prev => [...prev, { text: userMessage, isUser: true }]);
    setInput('');
    setLoading(true);

    try {
      const data = await api.post<any>('/lucy', { message: userMessage });
      const botText = data?.[0]?.text || "I'm not sure how to respond to that.";
      setMessages(prev => [...prev, { text: botText, isUser: false }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { text: 'Sorry, Lucy is taking a break.', isUser: false }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ask Lucy</Text>
      </View>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.isUser ? styles.bubbleMe : styles.bubbleThem]}>
            {!item.isUser && (
              <View style={styles.avatar}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#00D4FF" />
              </View>
            )}
            <Text style={styles.msgText}>{item.text}</Text>
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      {loading && <ActivityIndicator color="#00D4FF" style={{ padding: 8 }} />}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Type a command..."
          placeholderTextColor="#888"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={sendMessage} disabled={loading || !input.trim()}>
          <MaterialIcons name="send" size={28} color="#00D4FF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  bubble: { margin: 8, padding: 12, borderRadius: 12, maxWidth: '80%' },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333', flexDirection: 'row', alignItems: 'center' },
  avatar: { marginRight: 8 },
  msgText: { color: '#FFF', fontSize: 15 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#333' },
  input: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF', fontSize: 16, marginRight: 12 },
});