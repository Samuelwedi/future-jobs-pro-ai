import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { API_URL, api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const WS_URL = API_URL.replace(/\/api\/?$/, '');

export default function ChatScreen() {
  const safeInsets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { roomId, roomName } = route.params;
  const { user } = useAuth();
  const [room,setRoom]=useState<any>(null);
  const [uploading,setUploading]=useState(false);
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
    api.get<{room:any}>(`/chat/room/${encodeURIComponent(roomId)}/details`).then(r=>{if(mounted)setRoom(r.room);}).catch(()=>{});
    return () => { mounted=false;const socket=socketRef.current;socket?.emit('leave-room', roomId);socket?.disconnect(); };
  }, [roomId]);

  const sendMessage = async () => {
    const message=input.trim();if(!message||sending)return;
    setSending(true);setError('');
    try{const result=await api.post<{message:any}>('/chat/message',{roomId,message});setMessages(prev=>prev.some(item=>item.id===result.message.id)?prev:[...prev,result.message]);setInput('');}
    catch(cause:any){setError(cause?.response?.data?.message||cause?.message||'Message was not delivered');}
    finally{setSending(false);}
  };

  const uploadAttachment = async (asset:{uri:string;name:string;mimeType?:string;size?:number}) => {
    if(uploading)return;
    if(asset.size && asset.size>25*1024*1024){setError('Choose a file smaller than 25 MB');return;}
    setUploading(true);setError('');
    try {const result=await api.uploadFileWithData<{message:any}>(`/chat/room/${encodeURIComponent(roomId)}/attachments`,asset.uri,{},'file',false,{name:asset.name,mimeType:asset.mimeType});setMessages(prev=>prev.some(m=>m.id===result.message.id)?prev:[...prev,result.message]);}
    catch(e:any){setError(e.response?.data?.message||e.message||'Upload failed');}finally{setUploading(false);}
  };
  const chooseFile = async () => {
    try {const r=await DocumentPicker.getDocumentAsync({type:['image/*','video/*','audio/*','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv'],copyToCacheDirectory:true});if(!r.canceled)await uploadAttachment(r.assets[0]);}
    catch(e:any){setError(e.message||'Could not choose file');}
  };
  const chooseMedia = async () => {
    try{const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images','videos'],quality:0.8});if(!r.canceled){const a=r.assets[0];if(a.type==='video')await uploadAttachment({uri:a.uri,name:a.fileName||'video.mp4',mimeType:a.mimeType||'video/mp4',size:a.fileSize});else{const photo=await ImageManipulator.manipulateAsync(a.uri,[{resize:{width:Math.min(a.width||1920,1920)}}],{compress:.85,format:ImageManipulator.SaveFormat.JPEG});await uploadAttachment({uri:photo.uri,name:'photo.jpg',mimeType:'image/jpeg'});}}}catch(e:any){setError(e.message||'Could not choose media');}
  };
  const changeGroupPhoto = async () => {
    try {const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.8});if(r.canceled)return;setUploading(true);const a=r.assets[0];const photo=await ImageManipulator.manipulateAsync(a.uri,[{resize:{width:512}}],{compress:.85,format:ImageManipulator.SaveFormat.JPEG});const result=await api.uploadFileWithData<{avatar_url:string}>(`/chat/room/${encodeURIComponent(roomId)}/photo`,photo.uri,{},'photo',false,{name:'photo.jpg',mimeType:'image/jpeg'});setRoom((prev:any)=>({...prev,avatar_url:result.avatar_url}));}
    catch(e:any){setError(e.response?.data?.message||e.message||'Photo upload failed');}finally{setUploading(false);}
  };
  const openAttachment = async (item:any) => {
    try {
      const token=await api.getToken();
      const filename=String(item.attachment_name||'attachment').replace(/[^a-zA-Z0-9._-]/g,'_');
      const local=FileSystem.cacheDirectory+`${item.attachment_id}-${filename}`;
      const result=await FileSystem.downloadAsync(`${API_URL}/chat/attachments/${item.attachment_id}/content`,local,{headers:{Authorization:`Bearer ${token}`}});
      if(result.status!==200){await FileSystem.deleteAsync(local,{idempotent:true});throw Error('File download failed');}
      if(await Sharing.isAvailableAsync())await Sharing.shareAsync(local,{mimeType:item.attachment_type});
      else Alert.alert('Downloaded','File saved to the app cache. Sharing is unavailable on this device.');
    }catch(e:any){setError(e.message||'File could not be opened');}
  };
  const renderItem = ({ item }: { item: any }) => {
    const isMine = item.sender_id === user?.id;
    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        {!isMine && item.sender_avatar && <Image source={{uri:item.sender_avatar}} style={{width:28,height:28,borderRadius:14,marginBottom:5}} />}
        {!isMine && <Text style={styles.sender}>{item.sender_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Team member'}</Text>}
        {item.message?<Text style={styles.message}>{item.message}</Text>:null}
        {item.attachment_id && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${item.attachment_name}`} onPress={()=>void openAttachment(item)}><Text style={{color:isMine?'#07111F':'#67E8F9',paddingVertical:12,fontWeight:'700'}}>{item.attachment_type?.startsWith('image/')?'Photo':item.attachment_type?.startsWith('video/')?'Video':'File'}: {item.attachment_name}</Text><Text style={styles.time}>{(Number(item.attachment_size)/1024/1024).toFixed(1)} MB · Tap to open or save</Text></TouchableOpacity>}
        <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView keyboardVerticalOffset={safeInsets.top} style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{flex:1,marginLeft:16}}><Text style={styles.headerTitle}>{roomName || 'Chat'}</Text><Text style={{color:connected?'#55D66B':'#FFB020',fontSize:11}}>{connected?'LIVE':'RECONNECTING'}</Text></View>
        {(room?.avatar_url||room?.other_user_avatar)?<Image source={{uri:room.avatar_url||room.other_user_avatar}} style={{width:40,height:40,borderRadius:20}}/>:null}
        {room?.can_edit_photo && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change group photo" disabled={uploading} onPress={changeGroupPhoto}><MaterialIcons name="add-a-photo" size={24} color="#67E8F9" /></TouchableOpacity>}
      </View>
      {error?<Text style={{color:'#FF718B',paddingHorizontal:16,paddingVertical:8}}>{error}</Text>:null}
      <FlatList ref={flatListRef} data={messages} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
      {uploading && <ActivityIndicator color="#00D4FF" />}
      <View style={styles.inputBar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Attach document" disabled={uploading} onPress={chooseFile} style={{padding:8}}><MaterialIcons name="attach-file" size={24} color="#67E8F9" /></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Attach photo or video" disabled={uploading} onPress={chooseMedia} style={{padding:8}}><MaterialIcons name="photo-library" size={24} color="#67E8F9" /></TouchableOpacity>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
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
