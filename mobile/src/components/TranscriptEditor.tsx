import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useNavigation } from '@react-navigation/native';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';

type SavedTranscript = { success: boolean; voiceNoteId: string; transcript: string; transcriptionStatus: 'edited'; clientSummary: null; structuredData: null; tags: string[] };
type Props = {noteId: string; transcript: string; audioUrl?: string; onReconcile: () => void; onSaved: (value: SavedTranscript) => void};
export function TranscriptEditor({noteId, transcript, audioUrl, onSaved, onReconcile}: Props) {
 const {t}=useLang();
 const [baseline,setBaseline]=useState(transcript);
 const [draft,setDraft]=useState(transcript),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const busy=useRef(false),active=useRef(true),epoch=useRef(0);
 const navigation=useNavigation();
 const player=useAudioPlayer(audioUrl || null),status=useAudioPlayerStatus(player);
 useEffect(()=>{
  active.current=true;
  const leave=()=>{active.current=false;epoch.current++;try{player.pause();}catch{/* The audio hook may already have released its native player. */}};
  const enter=()=>{active.current=true;setSaving(busy.current);};
  const blur=navigation.addListener('blur',leave),focus=navigation.addListener('focus',enter);
  const state=AppState.addEventListener('change',value=>{if(value!=='active')leave();else if(navigation.isFocused())enter();});
  return ()=>{leave();blur();focus();state.remove();};
 },[navigation,player]);
 const save=async()=>{
  if(busy.current||!active.current)return;
  const value=draft.trim();
  if(!value||value.length>50000){setError(t('Enter a transcript between 1 and 50,000 characters.'));return;}
  if(value===baseline)return;
  busy.current=true;setSaving(true);setError('');const generation=epoch.current;
  try{
   const response=await api.editVoiceTranscript<SavedTranscript>(noteId,value,baseline);
   if(!active.current||epoch.current!==generation)return;
   if(!response.success||response.voiceNoteId!==noteId||response.transcript!==value||response.transcriptionStatus!=='edited')throw Error('Transcript save was not confirmed.');
   setBaseline(response.transcript);setDraft(response.transcript);onSaved(response);
  }catch(failure:any){
   if(active.current&&epoch.current===generation)setError(t(failure.response?.status===409?'This transcript changed elsewhere. Load the saved transcript and review your draft.':'Could not save transcript. Your changes remain here. Retry when connected.'));
  }finally{busy.current=false;if(active.current)setSaving(false);}
 };
 const reload=async()=>{
  if(busy.current||!active.current)return;
  busy.current=true;setSaving(true);const generation=epoch.current;
  try{
   const response=await api.getVoiceTranscript<{success:boolean;voiceNoteId:string;transcript:string|null}>(noteId);
   if(!active.current||epoch.current!==generation)return;
   if(!response.success||response.voiceNoteId!==noteId||(response.transcript!==null&&typeof response.transcript!=='string'))throw Error('Invalid saved transcript');
   setBaseline(response.transcript || '');onReconcile();
   setError(t('Saved transcript loaded. Your draft was kept; review it before saving.'));
  }catch{if(active.current&&epoch.current===generation)setError(t('Could not load saved transcript. Your draft is unchanged.'));}
  finally{busy.current=false;if(active.current)setSaving(false);}
 };
 return <View style={{gap:12}}>
  <Text style={{color:'#BBB'}}>{t('Review the audio while correcting the transcript. Saving clears outdated AI details; the original transcript is retained.')}</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
   {!!audioUrl&&<TouchableOpacity accessibilityRole="button" onPress={()=>{if(!active.current)return;if(status.playing)player.pause();else{void (async()=>{const generation=epoch.current;if(status.didJustFinish)await player.seekTo(0);if(active.current&&epoch.current===generation)player.play();})().catch(()=>{if(active.current)setError(t('Audio playback is unavailable.'));});}}} style={{padding:12}}><Text style={{color:'#67E8F9'}}>{t(status.playing?'Pause audio':'Play audio')}</Text></TouchableOpacity>}
   <TextInput accessibilityLabel={t('Edit transcript')} multiline value={draft} editable={!saving} maxLength={50000} onChangeText={setDraft} style={{minWidth:200,flex:1,minHeight:160,color:'#FFF',backgroundColor:'#111827',padding:12,textAlignVertical:'top'}} />
  </View>
  <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={reload} style={{padding:12}}><Text style={{color:'#67E8F9'}}>{t('Load saved transcript')}</Text></TouchableOpacity>
  <Text style={{color:'#BBB'}}>{t('Saved transcript')}: {baseline}</Text>
  {!!error&&<Text accessibilityRole="alert" style={{color:'#FCA5A5'}}>{error}</Text>}
  <TouchableOpacity accessibilityRole="button" disabled={saving||draft.trim()===baseline} onPress={save} style={{padding:12,opacity:saving?0.5:1}}><Text style={{color:'#67E8F9'}}>{t(saving?'Saving transcript...':'Save transcript')}</Text></TouchableOpacity>
 </View>;
}
