import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { API_URL, api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

const WS_URL = API_URL.replace(/\/api\/?$/, '');

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { roomId, roomName } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let mounted=true;
    const connect=async()=>{
    const token=await api.getToken();
    if(!mounted)return;
    const socket = io(WS_URL, { transports: ['websocket'], auth:{token} });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join-room', roomId,(result:any)=>{if(!result?.success)setError(result?.message||'Could not join conversation');else setConnected(true);}));
    socket.on('disconnect',()=>setConnected(false));
    socket.on('connect_error',(cause:any)=>setError(cause?.message||'Message connection failed'));
    socket.on('new-message', (msg: any) => {
      setMessages(prev => prev.some(item=>item.id===msg.id)?prev:[...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    try{const data=await api.get<{messages:any[]}>(`/chat/messages/${roomId}`);if(mounted)setMessages(data.messages||[]);}catch(cause:any){if(mounted)setError(cause?.response?.data?.message||cause?.message||'Conversation could not be loaded');}
    };
    void connect();
    return () => { mounted=false;const socket=socketRef.current;socket?.emit('leave-room', roomId);socket?.disconnect(); };
  }, [roomId]);

  const sendMessage = async () => {
    const message=input.trim();if(!message||sending)return;
    setSending(true);setError('');
    try{const result=await api.post<{message:any}>('/chat/message',{roomId,message});setMessages(prev=>prev.some(item=>item.id===result.message.id)?prev:[...prev,result.message]);setInput('');}
    catch(cause:any){setError(cause?.response?.data?.message||cause?.message||'Message was not delivered');}
    finally{setSending(false);}
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMine = item.sender_id === user?.id;
    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        {!isMine && <Text style={styles.sender}>{item.sender_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Team member'}</Text>}
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
        <View style={{flex:1,marginLeft:16}}><Text style={styles.headerTitle}>{roomName || 'Chat'}</Text><Text style={{color:connected?'#55D66B':'#FFB020',fontSize:11}}>{connected?'LIVE':'RECONNECTING'}</Text></View>
        <View style={{ width: 24 }} />
      </View>
      {error?<Text style={{color:'#FF718B',paddingHorizontal:16,paddingVertical:8}}>{error}</Text>:null}
      <FlatList ref={flatListRef} data={messages} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
      <View style={styles.inputBar}>
        <TextInput style={styles.textInput} value={input} onChangeText={setInput} placeholder="Message..." placeholderTextColor="#888" />
        <TouchableOpacity style={[styles.sendBtn,(!input.trim()||sending)&&{opacity:.5}]} disabled={!input.trim()||sending} onPress={sendMessage}>
          <Text style={styles.sendText}>{sending?'Sending…':'Send'}</Text>
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
