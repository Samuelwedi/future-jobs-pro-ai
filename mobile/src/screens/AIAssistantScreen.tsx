import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

interface Message { id: string; text: string; isUser: boolean; }

export default function AIAssistantScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([{ id: '0', text: 'Hi! I\'m your AI assistant. Ask me about your hours, projects, or clock‑in status.', isUser: false }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q) return;
    const userMsg: Message = { id: Date.now().toString(), text: q, isUser: true };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; answer: string }>('/assistant/query', { question: q, userId: user?.id });
      setMessages(prev => [...prev, { id: (Date.now()+1).toString(), text: res.answer, isUser: false }]);
    } catch { setMessages(prev => [...prev, { id: (Date.now()+1).toString(), text: 'Sorry, I could not process that question.', isUser: false }]); }
    finally { setLoading(false); setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100); }
  };

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[styles.bubble, item.isUser ? styles.userBubble : styles.botBubble]}>
      <Text style={styles.bubbleText}>{item.text}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Assistant</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList ref={flatListRef} data={messages} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={styles.list} onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} />
      <View style={styles.inputBar}>
        <TextInput style={styles.textInput} value={input} onChangeText={setInput} placeholder="Ask me anything..." placeholderTextColor="#888" editable={!loading} />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#0A0A0A" /> : <Ionicons name="send" size={20} color="#0A0A0A" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginLeft: 16 },
  list: { padding: 16, paddingBottom: 20 },
  bubble: { maxWidth: '80%', marginBottom: 12, padding: 12, borderRadius: 14 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  botBubble: { alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333' },
  bubbleText: { color: '#FFF', fontSize: 15 },
  inputBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#333', alignItems: 'center' },
  textInput: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF', marginRight: 10 },
  sendBtn: { backgroundColor: '#00D4FF', borderRadius: 20, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
});