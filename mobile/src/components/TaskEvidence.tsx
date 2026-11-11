import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ActivityIndicator} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import {api,createEvidenceRequestKey,type AttachmentSession} from '../services/api';
import MediaAttachment from './MediaAttachment';
import {useLang} from '../context/LanguageContext';

const activeSaves=new Set<string>();
type Evidence={id:string;request_key:string;note:string;file_name?:string;file_type?:string;content_path?:string};
export default function TaskEvidence({taskId,ownerId,companyId,isCurrent}:{taskId:string;ownerId:string;companyId:string;isCurrent:()=>boolean}){
 const {t}=useLang();
 const [rows,setRows]=useState<Evidence[]>([]),[note,setNote]=useState(''),[file,setFile]=useState<DocumentPicker.DocumentPickerAsset|null>(null);
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[pending,setPending]=useState<string|null>(null);
 const alive=useRef(true),flight=useRef(false),session=useRef<AttachmentSession|null>(null);
 const scope=JSON.stringify([ownerId,companyId,taskId]);const latest=useRef(scope);latest.current=scope;
 const storageKey=`task-evidence-pending-v1:${scope}`;
 const current=()=>{if(!isCurrent()||!alive.current||latest.current!==scope||!session.current)return false;try{api.assertAttachmentSession(session.current);return true;}catch{return false;}};
 const load=async()=>{
  if(!session.current||!current())return;
  const stored=await AsyncStorage.getItem(storageKey);if(!current())return;
  const data=await api.taskEvidence(session.current,taskId,current);if(!current())return;
  const evidence:Evidence[]=data.evidence||[];
  if(stored&&evidence.some(r=>r.request_key===stored)){
   await AsyncStorage.removeItem(storageKey);if(!current())return;setPending(null);setNote('');setFile(null);
  }else setPending(stored);
  setRows(evidence);
 };
 useEffect(()=>{alive.current=true;let cancelled=false;
  void (async()=>{try{const s=await api.captureAttachmentSession(ownerId,companyId);if(cancelled)return;session.current=s;await load();}catch(e:any){if(!cancelled)setError(e.message);}finally{if(!cancelled)setBusy(false);}})();
  return()=>{cancelled=true;alive.current=false;session.current=null;};
 },[scope]);
 const refresh=async()=>{if(flight.current||!current())return;flight.current=true;setBusy(true);setError('');try{await load();}catch(e:any){if(current())setError(e.message);}finally{flight.current=false;if(current())setBusy(false);}};
 const pick=async()=>{
  if(flight.current||pending||!current())return;flight.current=true;setBusy(true);setError('');
  try{const result=await DocumentPicker.getDocumentAsync({type:['application/pdf','image/jpeg','image/png','image/webp'],multiple:false,copyToCacheDirectory:true});if(!current()||result.canceled)return;
   const chosen=result.assets[0];if(!chosen||!chosen.size||chosen.size>10*1024*1024)throw new Error(t('Choose a PDF, JPEG, PNG or WebP receipt up to 10 MB.'));
   setFile(chosen);
  }catch(e:any){if(current())setError(e.message);}finally{flight.current=false;if(current())setBusy(false);}
 };
 const save=async()=>{
  if(flight.current||pending||!current()||(!file&&!note.trim()))return;
  if(activeSaves.has(storageKey)){setError(t('Check the pending save before submitting another receipt.'));return;}
  activeSaves.add(storageKey);
  flight.current=true;setBusy(true);setError('');const requestKey=createEvidenceRequestKey();
  try{
   // Persist before dispatch. Once dispatched, recovery is read-only, even after restart.
   if(await AsyncStorage.getItem(storageKey))throw new Error(t('Check the pending save before submitting another receipt.'));
   if(!current())return;
   const response=await api.taskEvidence(session.current!,taskId,current,{requestKey,note,file:file||undefined},async()=>{
    if(!current())throw new Error('Task screen changed.');
    await AsyncStorage.setItem(storageKey,requestKey);
    if(current())setPending(requestKey);
   });
   if(!current())return;
   if(response.state!=='completed'||response.evidence?.request_key!==requestKey)throw new Error(t('Save not confirmed. Check status before submitting again.'));
   await load();
  }catch(e:any){
   if(current()&&[400,403].includes(e?.response?.status)&&e?.response?.data?.retryAllowed===true){await AsyncStorage.removeItem(storageKey);if(current())setPending(null);}
   if(current())setError(e?.response?.data?.message||e.message||t('Save not confirmed. Check status before submitting again.'));
  }
  finally{activeSaves.delete(storageKey);flight.current=false;if(current())setBusy(false);}
 };
 return <View style={{gap:12}}>
  <Text style={{color:'#94A3B8'}}>{t('Receipts and notes are visible to the assigned employee and company managers. This does not submit a reimbursement claim.')}</Text>
  {busy&&<ActivityIndicator color="#22D3EE"/>}{!!error&&<Text accessibilityRole="alert" style={{color:'#FB7185'}}>{error}</Text>}
  {pending?<Text style={{color:'#FBBF24'}}>{t('A save is awaiting confirmation. Check status; do not upload the same receipt again. If it remains pending, ask your manager to investigate.')}</Text>:<>
   <TextInput accessibilityLabel={t('Expense or task note')} placeholder={t('Expense or task note')} placeholderTextColor="#94A3B8" value={note} onChangeText={setNote} maxLength={4000} multiline editable={!busy} style={{color:'#FFF',borderWidth:1,borderColor:'#475569',padding:12,minHeight:80}}/>
   <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void pick()} style={{padding:12}}><Text style={{color:'#67E8F9'}}>{file?file.name:t('Choose receipt (PDF or photo)')}</Text></TouchableOpacity>
   {file&&<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>setFile(null)}><Text style={{color:'#CBD5E1'}}>{t('Remove selected receipt')}</Text></TouchableOpacity>}
   <TouchableOpacity accessibilityRole="button" disabled={busy||(!file&&!note.trim())} onPress={()=>void save()} style={{padding:14,backgroundColor:'#164E63',opacity:busy?0.5:1}}><Text style={{color:'#FFF'}}>{t('Save receipt or note')}</Text></TouchableOpacity>
  </>}
  <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void refresh()} style={{padding:12}}><Text style={{color:'#67E8F9'}}>{t(pending?'Check save status':'Refresh receipts and notes')}</Text></TouchableOpacity>
  {rows.map(row=><View key={row.id} style={{padding:12,borderWidth:1,borderColor:'#334155'}}>{!!row.note&&<Text style={{color:'#FFF'}}>{row.note}</Text>}{row.content_path&&row.file_name&&<MediaAttachment path={row.content_path} name={row.file_name} mime={row.file_type||'application/octet-stream'} sessionCurrent={current}/>}</View>)}
  {!busy&&!rows.length&&<Text style={{color:'#94A3B8'}}>{t('No receipts or notes yet.')}</Text>}
 </View>;
}
