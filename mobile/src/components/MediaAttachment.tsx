import {useLang} from '../context/LanguageContext';
import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,Image,ScrollView,ActivityIndicator} from 'react-native';
import {useVideoPlayer,VideoView} from 'expo-video';
import {useAudioPlayer,useAudioPlayerStatus} from 'expo-audio';
import Slider from '@react-native-community/slider';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {AdaptiveModal as Modal} from './AdaptiveModal';
import {api,API_URL} from '../services/api';
function Video({uri}:{uri:string}){const player=useVideoPlayer(uri);return <VideoView player={player} nativeControls fullscreenOptions={{enable:true}} style={{width:'100%',height:360}}/>;}
function Audio({uri}:{uri:string}){const {t}=useLang();const player=useAudioPlayer(uri);const state=useAudioPlayerStatus(player);return <View style={{padding:24}}><TouchableOpacity accessibilityRole="button" onPress={()=>{if(state.playing)player.pause();else{if(state.didJustFinish)void player.seekTo(0);player.play();}}} style={{padding:16}}><Text style={{color:'#67E8F9'}}>{t(state.playing?'Pause':'Play')}</Text></TouchableOpacity><Slider minimumValue={0} maximumValue={state.duration||1} value={state.currentTime||0} onSlidingComplete={value=>void player.seekTo(value)} minimumTrackTintColor="#67E8F9"/><Text style={{color:'#FFF'}}>{t('{current} / {duration} seconds',{current:String(Math.floor(state.currentTime||0)),duration:String(Math.floor(state.duration||0))})}</Text></View>;}
export default function MediaAttachment({path,name,mime,sessionCurrent,onViewerVisibilityChange}:{path:string;name:string;mime:string;sessionCurrent?:()=>boolean;onViewerVisibilityChange?:(visible:boolean)=>void}){
 const {t}=useLang();
 const [uri,setUri]=useState('');const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const alive=useRef(true);const local=useRef('');const downloading=useRef(false);const sharing=useRef(false);
 const viewerCallback=useRef(onViewerVisibilityChange);viewerCallback.current=onViewerVisibilityChange;
 const showViewer=(visible:boolean)=>{viewerCallback.current?.(visible);setOpen(visible);};
 const current=()=>alive.current&&(!sessionCurrent||sessionCurrent());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;viewerCallback.current?.(false);if(local.current)void FileSystem.deleteAsync(local.current,{idempotent:true}).catch(()=>{});};},[]);
 const load=async()=>{
  if(downloading.current||!current())return;
  if(uri){showViewer(true);return;}
  downloading.current=true;setBusy(true);setError('');
  const file=`${FileSystem.cacheDirectory}chat-${Date.now()}-${Math.random().toString(36).slice(2)}-${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`;
  try{
   if(!/^\/(chat|support)\/attachments\/[a-zA-Z0-9-]+\/content$/.test(path)&&!/^\/tasks\/[a-fA-F0-9-]{36}\/evidence\/[a-fA-F0-9-]{36}\/content$/.test(path))throw new Error(t("Unsupported attachment"));
   const token=await api.getToken();if(!current())return;if(!token)throw new Error(t("Sign in to view this file"));
   const response=await FileSystem.downloadAsync(API_URL+path,file,{headers:{Authorization:`Bearer ${token}`}});
   if(response.status!==200)throw new Error(t("This attachment could not be downloaded. Please retry."));
   const type=String(response.headers?.['Content-Type']||response.headers?.['content-type']||'');
   if(/text\/html|application\/json/i.test(type))throw new Error(t("The server did not return a media file"));
   if(!current()){await FileSystem.deleteAsync(file,{idempotent:true});return;}
   local.current=file;setUri(file);showViewer(true);
  }catch(e:any){await FileSystem.deleteAsync(file,{idempotent:true}).catch(()=>{});if(current())setError(e.message);}
  finally{downloading.current=false;if(current())setBusy(false);}
 };
 const share=async()=>{
  if(!uri||sharing.current||!current())return;
  sharing.current=true;
  try{
   const available=await Sharing.isAvailableAsync();
   if(!current())return;
   if(available)await Sharing.shareAsync(uri,{mimeType:mime});
   else setError(t("Sharing is unavailable on this device."));
  }catch(e:any){if(current())setError(e.message);}
  finally{sharing.current=false;}
 };
 return <View><TouchableOpacity accessibilityRole="button" accessibilityLabel={t('View {name}',{name})} disabled={busy} onPress={()=>void load()} style={{paddingVertical:12}}><Text style={{color:'#136D87',fontWeight:'700'}}>{busy?t('Loading…'):`${t(mime.startsWith('image/')?'Photo':mime.startsWith('video/')?'Video':mime.startsWith('audio/')?'Audio':'Document')}: ${name}`}</Text><Text style={{color:'#526675'}}>{t("Tap to view or play")}</Text></TouchableOpacity>{!!error&&<Text accessibilityRole="alert" style={{color:'#EF4444'}}>{error}</Text>}
 <Modal visible={open&&current()} onRequestClose={()=>showViewer(false)} animationType="slide"><View style={{flex:1,backgroundColor:'#07111F',padding:16}}><TouchableOpacity accessibilityRole="button" onPress={()=>showViewer(false)} style={{padding:16}}><Text style={{color:'#67E8F9'}}>{t("Close viewer")}</Text></TouchableOpacity><Text numberOfLines={2} style={{color:'#FFF',padding:12}}>{name}</Text>{busy&&<ActivityIndicator/>}
 {open&&current()&&uri&&(mime.startsWith('image/')?<ScrollView maximumZoomScale={5} minimumZoomScale={1} contentContainerStyle={{flexGrow:1,justifyContent:'center'}}><Image accessibilityLabel={name} source={{uri}} resizeMode="contain" style={{width:'100%',height:450}}/></ScrollView>:mime.startsWith('video/')?<Video uri={uri}/>:mime.startsWith('audio/')?<Audio uri={uri}/>:<Text style={{color:'#FFF',padding:24}}>{t("Use Open or save to view this document in a compatible app.")}</Text>)}
 <TouchableOpacity accessibilityRole="button" onPress={()=>void share()} disabled={!uri} style={{padding:18}}><Text style={{color:'#67E8F9'}}>{t("Open or save")}</Text></TouchableOpacity></View></Modal></View>;
}
