import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AdaptiveModal as Modal} from './AdaptiveModal';
import {useLang} from '../context/LanguageContext';
import {useAuth} from '../context/AuthContext';
import {checkOnlineStatus, getOfflineQueueState, processQueue, setOfflineReviewArchived} from '../services/offlineService';

type QueueState = Awaited<ReturnType<typeof getOfflineQueueState>>;
export default function OfflineSyncPanel() {
 const {t,lang}=useLang();const {user}=useAuth();
 const [visible,setVisible]=useState(false),[state,setState]=useState<QueueState|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[showArchived,setShowArchived]=useState(false);
 const active=useRef(false),lock=useRef(false),generation=useRef(0);
 useEffect(()=>{
  setVisible(false);setState(null);setError('');
 },[user?.id]);
 useEffect(()=>{
  active.current=visible;const epoch=++generation.current;
  if(!visible)return;
  const refresh=()=>getOfflineQueueState().then(value=>{if(active.current&&generation.current===epoch)setState(value);}).catch(()=>{if(active.current&&generation.current===epoch)setError(t('Offline records could not be loaded. They have not been changed.'));});
  void refresh();const timer=setInterval(refresh,10000);
  return()=>{active.current=false;clearInterval(timer);};
 },[visible,user?.id,lang]);
 const perform=async(work:()=>Promise<void>)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');const epoch=generation.current;
  try{await work();const value=await getOfflineQueueState();if(active.current&&generation.current===epoch)setState(value);}
  catch{if(active.current&&generation.current===epoch)setError(t('Sync could not finish. Saved items are retained. Reconnect and try again.'));}
  finally{lock.current=false;if(active.current&&generation.current===epoch)setBusy(false);}
 };
 const sync=()=>perform(async()=>{if(!await checkOnlineStatus())throw Error('offline');await processQueue();});
 const items=state&&state.ownerId===user?.id?state.items:[];
 const queued=items.filter(item=>item.status==='queued').length,review=items.filter(item=>item.status==='review').length;
 return <>
  <TouchableOpacity accessibilityRole="button" style={styles.open} onPress={()=>{setBusy(false);setState(null);setError('');setVisible(true);}}><Text style={styles.label}>{t('Offline sync')}</Text></TouchableOpacity>
  <Modal visible={visible} transparent animationType="slide" onRequestClose={()=>!busy&&setVisible(false)}>
   <View style={styles.overlay}><View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>{t('Offline sync')}</Text>
    <Text style={styles.copy}>{t('Queued: {count}',{count:String(queued)})} · {t('Needs review: {count}',{count:String(review)})}</Text>
    <Text style={styles.copy}>{t('Saved uploads sync when connected. Account, payment and approval actions must be checked in their original screen. They will not run automatically.')}</Text>
    {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    {!state&&!error?<ActivityIndicator color="#67E8F9"/>:null}
    <ScrollView style={styles.list}>
     {items.filter(item=>showArchived||item.status!=='archived').map(item=><View key={item.id} style={styles.item}>
      <Text style={styles.label}>{t(item.category)}</Text>
      <Text style={styles.copy}>{t(item.status==='review'?'Needs review':item.status==='archived'?'Archived':'Queued')} · {Number.isFinite(item.timestamp)?new Date(item.timestamp).toLocaleString(lang):t('Unknown date')}</Text>
      {item.status!=='queued'?<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void perform(()=>setOfflineReviewArchived(item.id,state!.ownerId,item.status!=='archived'))} style={styles.button}><Text style={styles.label}>{t(item.status==='archived'?'Restore to review':'Archive reminder')}</Text></TouchableOpacity>:null}
     </View>)}
     {state&&items.filter(item=>showArchived||item.status!=='archived').length===0?<Text style={styles.copy}>{t('No pending offline items')}</Text>:null}
    </ScrollView>
    <TouchableOpacity accessibilityRole="button" onPress={()=>setShowArchived(!showArchived)} style={styles.button}><Text style={styles.label}>{t(showArchived?'Hide archived reminders':'Show archived reminders')}</Text></TouchableOpacity>
    <Text style={styles.copy}>{t('Archiving only hides this reminder. It does not submit, approve or delete the saved action.')}</Text>
    <View style={styles.actions}><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>setVisible(false)} style={styles.button}><Text style={styles.label}>{t('Close')}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={busy||!queued} onPress={()=>void sync()} style={[styles.button,(busy||!queued)&&styles.disabled]}><Text style={styles.label}>{t(busy?'Syncing…':'Sync now')}</Text></TouchableOpacity></View>
   </View></View>
  </Modal>
 </>;
}
const styles=StyleSheet.create({open:{padding:16,borderWidth:1,borderColor:'#334155',borderRadius:10,marginTop:12},overlay:{flex:1,backgroundColor:'#000B',justifyContent:'center',padding:20},panel:{maxHeight:'90%',backgroundColor:'#101820',padding:20,borderRadius:16},title:{color:'#FFF',fontSize:22,fontWeight:'700',marginBottom:12},copy:{color:'#CBD5E1',fontSize:14,lineHeight:21,marginVertical:6},label:{color:'#67E8F9',fontSize:16,fontWeight:'600'},error:{color:'#FDA4AF',marginVertical:12},list:{flexGrow:0},item:{paddingVertical:12,borderBottomWidth:1,borderColor:'#334155'},button:{paddingVertical:12,paddingHorizontal:8,minHeight:48},actions:{flexDirection:'row',justifyContent:'space-between'},disabled:{opacity:.45}});
