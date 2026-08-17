import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';

interface SupportMessage {
  id: string;
  senderType: 'customer' | 'agent' | 'lucy';
  senderName: string;
  message: string;
  createdAt: string;
}

interface ActiveTicket {
  id: string;
  status: string;
  assignedAgentId?: string | null;
}

export default function SupportScreen() {
  const navigation = useNavigation<any>();
  const listRef = useRef<FlatList<SupportMessage>>(null);
  const [ticket, setTicket] = useState<ActiveTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [agentActive, setAgentActive] = useState(false);
  const [error, setError] = useState('');

  const loadMessages = useCallback(async (ticketId: string, quiet = false) => {
    try {
      const response = await api.get<any>(`/support/tickets/${ticketId}/messages`);
      setMessages(response.messages || []);
      setAgentActive(Boolean(response.agentActive));
      setTicket((current) => current ? { ...current, status: response.status || current.status } : current);
      setError('');
    } catch (requestError: any) {
      if (!quiet) setError(requestError?.response?.data?.message || 'Support messages could not be loaded.');
    }
  }, []);

  const loadActiveTicket = useCallback(async () => {
    try {
      const response = await api.get<any>('/support/active');
      const active = response.ticket || null;
      setTicket(active);
      if (active?.id) await loadMessages(active.id);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Support is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [loadMessages]);

  useEffect(() => { void loadActiveTicket(); }, [loadActiveTicket]);

  useEffect(() => {
    if (!ticket?.id || ticket.status !== 'open') return;
    const timer = setInterval(() => void loadMessages(ticket.id, true), 6000);
    return () => clearInterval(timer);
  }, [ticket?.id, ticket?.status, loadMessages]);

  const requestAgent = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const response = await api.post<any>('/support/request-human', {
        lucySummary: 'Customer requested help from the Future Jobs Pro AI mobile app.',
        lucyMessages: [],
      });
      const nextTicket = { id: response.ticketId, status: 'open' };
      setTicket(nextTicket);
      await loadMessages(nextTicket.id);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'We could not open a support request.');
    } finally {
      setRequesting(false);
    }
  };

  const send = async () => {
    const message = input.trim();
    if (!message || !ticket?.id || sending) return;
    setSending(true);
    try {
      const response = await api.post<any>(`/support/tickets/${ticket.id}/messages`, { message });
      if (response.message) setMessages((current) => [...current, response.message]);
      setInput('');
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Your message was not sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={23} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Customer care</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: agentActive ? '#34D399' : '#FBBF24' }]} />
            <Text style={styles.headerMeta}>{agentActive ? 'Agent connected' : ticket ? 'Request in queue' : 'Lucy + human support'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('AIAssistant')} style={styles.lucyButton}>
          <MaterialIcons name="auto-awesome" size={21} color="#C4B5FD" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#67E8F9" /><Text style={styles.loadingText}>Opening support workspace…</Text></View>
      ) : !ticket ? (
        <View style={styles.emptyState}>
          <View style={styles.supportMark}><MaterialIcons name="support-agent" size={38} color="#07111F" /></View>
          <Text style={styles.emptyTitle}>Help when you need it</Text>
          <Text style={styles.emptyText}>Lucy can resolve common questions. When you need a person, create a private ticket for a Future Jobs Pro AI support agent.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('AIAssistant')}>
            <MaterialIcons name="auto-awesome" size={20} color="#07111F" /><Text style={styles.primaryButtonText}>Ask Lucy first</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={requestAgent} disabled={requesting}>
            {requesting ? <ActivityIndicator color="#67E8F9" /> : <MaterialIcons name="headset-mic" size={20} color="#67E8F9" />}
            <Text style={styles.secondaryButtonText}>Request a support agent</Text>
          </TouchableOpacity>
          {Boolean(error) && <Text style={styles.errorText}>{error}</Text>}
        </View>
      ) : (
        <>
          <View style={styles.ticketStrip}>
            <View><Text style={styles.ticketEyebrow}>PRIVATE SUPPORT TICKET</Text><Text style={styles.ticketId}>#{ticket.id.slice(0, 8).toUpperCase()}</Text></View>
            <View style={styles.secureBadge}><MaterialIcons name="lock" size={14} color="#34D399" /><Text style={styles.secureText}>Secure</Text></View>
          </View>
          <FlatList
            ref={listRef}
            data={messages}
            contentContainerStyle={styles.messageList}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.emptyThread}>Your ticket is open. Send a message and an agent will respond here.</Text>}
            renderItem={({ item }) => {
              const mine = item.senderType === 'customer';
              return (
                <View style={[styles.messageWrap, mine ? styles.messageMine : styles.messageTheirs]}>
                  <Text style={styles.sender}>{mine ? 'You' : item.senderName || (item.senderType === 'lucy' ? 'Lucy' : 'Support agent')}</Text>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}><Text style={[styles.messageText, mine && styles.messageTextMine]}>{item.message}</Text></View>
                  <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                </View>
              );
            }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
          {Boolean(error) && <Text style={styles.inlineError}>{error}</Text>}
          <View style={styles.inputBar}>
            <TextInput style={styles.input} placeholder={ticket.status === 'open' ? 'Write a message…' : 'This ticket is closed'} placeholderTextColor="#64748B" value={input} onChangeText={setInput} editable={ticket.status === 'open'} multiline maxLength={5000} />
            <TouchableOpacity style={[styles.sendButton, (!input.trim() || sending) && styles.sendDisabled]} onPress={send} disabled={!input.trim() || sending}>
              {sending ? <ActivityIndicator color="#07111F" size="small" /> : <MaterialIcons name="send" size={22} color="#07111F" />}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111F' },
  header: { paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#17283A' },
  iconButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111C2B' },
  headerCopy: { flex: 1, marginLeft: 12 }, headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 }, statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 }, headerMeta: { color: '#8FA0B5', fontSize: 11 },
  lucyButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#211A38' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 13 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 }, supportMark: { width: 76, height: 76, borderRadius: 24, backgroundColor: '#67E8F9', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  emptyTitle: { color: '#FFF', fontSize: 25, fontWeight: '900' }, emptyText: { color: '#9AA9BC', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 24 },
  primaryButton: { width: '100%', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#67E8F9', padding: 15, borderRadius: 14 }, primaryButtonText: { color: '#07111F', fontWeight: '900', fontSize: 15 },
  secondaryButton: { width: '100%', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1B2A', padding: 15, borderRadius: 14, marginTop: 11, borderWidth: 1, borderColor: '#155E75' }, secondaryButtonText: { color: '#CFFAFE', fontWeight: '800', fontSize: 14 },
  errorText: { color: '#FCA5A5', fontSize: 12, textAlign: 'center', marginTop: 14 }, ticketStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 13, backgroundColor: '#0B1725', borderBottomWidth: 1, borderBottomColor: '#17283A' },
  ticketEyebrow: { color: '#64748B', fontSize: 9, letterSpacing: 1.2, fontWeight: '900' }, ticketId: { color: '#DCE7F3', fontSize: 13, fontWeight: '800', marginTop: 3 }, secureBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#052E2B', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }, secureText: { color: '#6EE7B7', fontSize: 10, fontWeight: '800' },
  messageList: { padding: 16, paddingBottom: 24, flexGrow: 1 }, emptyThread: { color: '#7C8EA5', textAlign: 'center', lineHeight: 20, marginTop: 36 }, messageWrap: { maxWidth: '84%', marginBottom: 15 }, messageMine: { alignSelf: 'flex-end', alignItems: 'flex-end' }, messageTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' }, sender: { color: '#7C8EA5', fontSize: 10, fontWeight: '700', marginBottom: 5, paddingHorizontal: 4 },
  bubble: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 17 }, bubbleMine: { backgroundColor: '#67E8F9', borderBottomRightRadius: 5 }, bubbleTheirs: { backgroundColor: '#111E2D', borderWidth: 1, borderColor: '#203247', borderBottomLeftRadius: 5 }, messageText: { color: '#E5EEF7', fontSize: 14, lineHeight: 20 }, messageTextMine: { color: '#07111F', fontWeight: '600' }, time: { color: '#52657A', fontSize: 9, marginTop: 4, paddingHorizontal: 4 },
  inlineError: { color: '#FCA5A5', fontSize: 11, textAlign: 'center', paddingHorizontal: 16, paddingBottom: 6 }, inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: Platform.OS === 'ios' ? 22 : 12, borderTopWidth: 1, borderTopColor: '#17283A', backgroundColor: '#091421' }, input: { flex: 1, maxHeight: 110, minHeight: 46, color: '#FFF', backgroundColor: '#101E2D', borderRadius: 16, borderWidth: 1, borderColor: '#203247', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }, sendButton: { width: 46, height: 46, borderRadius: 15, marginLeft: 9, backgroundColor: '#67E8F9', alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: 0.4 },
});
