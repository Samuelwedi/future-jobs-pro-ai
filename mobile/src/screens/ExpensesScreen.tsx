import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAuth} from '../context/AuthContext';
import {useLang} from '../context/LanguageContext';
import {api} from '../services/api';
import {checkOnlineStatus} from '../services/offlineService';
import {ExpenseForm, expenseInputError, localExpenseDate} from '../utils/expenseForm';

type Receipt = {uri:string;name:string;mimeType?:string;size?:number};
type Claim = {id:string;user_id:string;vendor:string;amount:number|string;currency:string;spent_on:string;notes?:string;status:string;attachment_id?:string;receipt_url?:string};
const blank = (): ExpenseForm => ({vendor:'',amount:'',currency:'CAD',spentOn:localExpenseDate(),notes:''});
export default function ExpensesScreen() {
  const navigation = useNavigation(); const insets = useSafeAreaInsets(); const {user} = useAuth(); const {t} = useLang();
  const [rows,setRows] = useState<Claim[]>([]); const [manager,setManager] = useState(false);
  const [form,setForm] = useState<ExpenseForm>(blank); const [receipt,setReceipt] = useState<Receipt|null>(null);
  const [attachmentId,setAttachmentId] = useState<string|undefined>();
  const loadSequence = useRef(0);
  const [busy,setBusy] = useState(false); const lock = useRef(false); const [loading,setLoading] = useState(true);
  const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [draftKey,setDraftKey] = useState('');
  const key = `expense-draft:${user?.id}`;
  const draftReady = draftKey === key;
  const load = useCallback(async () => {
    const sequence=++loadSequence.current;setLoading(true);
    try { const result = await api.get<{expenses:Claim[];manager:boolean}>('/expenses'); if(sequence===loadSequence.current){setRows(result.expenses);setManager(result.manager);} }
    catch(cause:any) { if(sequence===loadSequence.current)setError(cause.message || t('Expenses could not be loaded.')); }
    finally { if(sequence===loadSequence.current)setLoading(false); }
  },[user?.id]);
  useFocusEffect(useCallback(()=>{setRows([]);void load();return()=>{loadSequence.current++;};},[load]));
  useEffect(()=>{let active=true;setDraftKey('');setForm(blank());setReceipt(null);setAttachmentId(undefined);
    AsyncStorage.getItem(key).then(raw=>{if(!active)return;if(raw){try{const draft=JSON.parse(raw);if(draft.form){setForm({...blank(),...draft.form});setReceipt(draft.receipt||null);setAttachmentId(draft.attachmentId);}}catch{setError(t('Expense draft could not be loaded.'));return;}}setDraftKey(key);}).catch(()=>{if(active)setError(t('Expense draft could not be loaded.'));});
    return()=>{active=false;};
  },[key]);
  useEffect(()=>{if(draftReady)void AsyncStorage.setItem(key,JSON.stringify({form,receipt,attachmentId})).catch(()=>setError(t('Expense draft could not be saved on this device.')));},[draftReady,key,form,receipt,attachmentId]);
  const run = async (work:()=>Promise<void>) => {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
    try {if(!await checkOnlineStatus())throw Error(t('Reconnect to submit or review. Your draft is kept.'));await work();}
    catch(cause:any){setError(cause.message || t('Expense action failed.'));}
    finally{lock.current=false;setBusy(false);}
  };
  const resetDraft = () => Alert.alert(t('Start a new draft?'),t('This removes the saved expense draft on this device.'),[{text:t('Cancel'),style:'cancel'},{text:t('Start new draft'),style:'destructive',onPress:()=>{void AsyncStorage.removeItem(key).then(()=>{setForm(blank());setReceipt(null);setAttachmentId(undefined);setError('');setDraftKey(key);}).catch(()=>setError(t('Expense draft could not be saved on this device.')));}}]);
  const chooseReceipt = async () => {
    try {const result=await DocumentPicker.getDocumentAsync({type:['image/jpeg','image/png','image/webp','application/pdf'],copyToCacheDirectory:true,multiple:false});if(result.canceled)return;const file=result.assets[0];if((file.size||0)>100*1024*1024)throw Error(t('Choose a receipt under 100 MB.'));setReceipt({uri:file.uri,name:file.name,mimeType:file.mimeType,size:file.size});setAttachmentId(undefined);}
    catch(cause:any){setError(cause.message);}
  };
  const submit = () => run(async()=>{
    const invalid=expenseInputError(form);if(invalid)throw Error(t(invalid));
    let id=attachmentId;
    if(receipt&&!id){const uploaded=await api.uploadFileWithData<{attachment:{id:string}}>('/attachments/upload',receipt.uri,{subjectUserId:String(user?.id),category:'receipt'},'file',false,{name:receipt.name,mimeType:receipt.mimeType});id=uploaded.attachment.id;setAttachmentId(id);}
    await api.post('/expenses',{...form,vendor:form.vendor.trim(),amount:Number(form.amount),attachmentId:id});
    setForm(blank());setReceipt(null);setAttachmentId(undefined);setNotice(t('Expense submitted for review.'));await load();
  });
  const scan = () => run(async()=>{
    if(!receipt)return;
    if(!['image/jpeg','image/png','image/webp'].includes(receipt.mimeType||'') || (receipt.size||0)>1000000)throw Error(t('Choose a PNG, JPEG or WebP image under 1 MB for extraction.'));
    const info=await FileSystem.getInfoAsync(receipt.uri);
    if(!info.exists||info.isDirectory||info.size>1000000)throw Error(t('Choose a PNG, JPEG or WebP image under 1 MB for extraction.'));
    const data=await FileSystem.readAsStringAsync(receipt.uri,{encoding:FileSystem.EncodingType.Base64});
    if(data.length>1333400)throw Error(t('Choose a PNG, JPEG or WebP image under 1 MB for extraction.'));
    const result=await api.post<{draft:{vendor?:string;amount?:number;currency?:string;spentOn?:string}}>('/operations/receipts/extract',{image:`data:${receipt.mimeType};base64,${data}`});
    const d=result.draft;setForm(current=>({...current,vendor:d.vendor||current.vendor,amount:d.amount==null?current.amount:String(d.amount),currency:['CAD','USD'].includes(d.currency||'')?d.currency!:current.currency,spentOn:d.spentOn||current.spentOn}));
    setNotice(t('Check every extracted value against your receipt before submitting.'));
  });
  const review=(claim:Claim,status:string)=>run(async()=>{await api.post(`/expenses/${claim.id}/review`,{status});await load();});
  const openReceipt=(url:string)=>{if(!/^https:\/\//i.test(url)){setError(t('Receipt link is unavailable.'));return;}void Linking.openURL(url).catch(()=>setError(t('Receipt could not be opened.')));};
  const field=(name:keyof ExpenseForm,label:string,extra:any={})=><View style={s.field}><Text style={s.label}>{t(label)}</Text><TextInput accessibilityLabel={t(label)} editable={!busy&&draftReady} style={s.input} value={form[name]} onChangeText={value=>setForm(current=>({...current,[name]:name==='amount'?value.replace(',', '.'):value}))} {...extra}/></View>;
  return <View style={s.root}><ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={[s.content,{paddingTop:insets.top+10,paddingBottom:insets.bottom+32}]}>
    <TouchableOpacity accessibilityRole="button" onPress={()=>navigation.goBack()} style={s.button}><Text style={s.link}>{t('Back')}</Text></TouchableOpacity>
    <Text style={s.title}>{t('Expenses & receipts')}</Text><Text style={s.body}>{t('Approval does not send a payment.')}</Text>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!notice&&<Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
    <View style={s.card}>{!draftReady&&!!error&&<TouchableOpacity accessibilityRole="button" onPress={resetDraft} style={s.button}><Text style={s.link}>{t('Start new draft')}</Text></TouchableOpacity>}{field('vendor','Vendor',{maxLength:200})}{field('amount','Amount',{keyboardType:'decimal-pad'})}{field('spentOn','Expense date (YYYY-MM-DD)',{maxLength:10})}
      <Text style={s.label}>{t('Currency')}</Text><View style={s.row}>{['CAD','USD'].map(currency=><TouchableOpacity key={currency} accessibilityRole="button" accessibilityState={{selected:form.currency===currency}} disabled={busy} onPress={()=>setForm(current=>({...current,currency}))} style={[s.button,form.currency===currency&&s.selected]}><Text style={s.link}>{currency}</Text></TouchableOpacity>)}</View>
      {field('notes','Notes / business purpose',{multiline:true,maxLength:4000})}
      <TouchableOpacity accessibilityRole="button" disabled={busy||!draftReady} onPress={()=>void chooseReceipt()} style={s.button}><Text style={s.link}>{receipt?receipt.name:t('Attach receipt')}</Text></TouchableOpacity>
      {receipt&&<View style={s.row}><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>{setReceipt(null);setAttachmentId(undefined);}} style={s.button}><Text style={s.link}>{t('Remove receipt')}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void scan()} style={s.button}><Text style={s.link}>{t('Extract receipt fields')}</Text></TouchableOpacity></View>}
      <TouchableOpacity accessibilityRole="button" disabled={busy||!draftReady} onPress={()=>void submit()} style={[s.button,s.selected]}><Text style={s.link}>{t(busy?'Working…':'Submit for review')}</Text></TouchableOpacity>
    </View>
    <TouchableOpacity accessibilityRole="button" disabled={busy||loading} onPress={()=>{if(draftReady)setError('');void load();}} style={s.button}><Text style={s.link}>{t('Refresh')}</Text></TouchableOpacity>
    {loading&&<ActivityIndicator color="#67E8F9"/>}
    {rows.map(claim=><View key={claim.id} style={s.card}><Text style={s.heading}>{claim.vendor} · {claim.currency} {Number(claim.amount).toFixed(2)}</Text><Text style={s.body}>{String(claim.spent_on).slice(0,10)} · {t(claim.status)}</Text><Text style={s.body}>{claim.notes}</Text>{claim.receipt_url&&<TouchableOpacity accessibilityRole="button" onPress={()=>openReceipt(claim.receipt_url!)} style={s.button}><Text style={s.link}>{t('Open receipt')}</Text></TouchableOpacity>}{manager&&claim.status==='pending'&&String(claim.user_id)!==String(user?.id)&&<View style={s.row}>{['approved','rejected'].map(status=><TouchableOpacity key={status} accessibilityRole="button" disabled={busy} onPress={()=>void review(claim,status)} style={s.button}><Text style={s.link}>{t(status==='approved'?'Approve':'Reject')}</Text></TouchableOpacity>)}</View>}</View>)}
    {!loading&&!rows.length&&!error&&<Text style={s.body}>{t('No expense claims yet.')}</Text>}
  </ScrollView></View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#06101D'},content:{padding:18,paddingBottom:50},title:{color:'#FFF',fontSize:26,fontWeight:'800'},body:{color:'#A9BACB',marginVertical:8},card:{backgroundColor:'#102035',borderRadius:16,padding:16,marginVertical:10},field:{marginBottom:12},label:{color:'#BFD0E1',marginBottom:6},input:{backgroundColor:'#06101D',borderWidth:1,borderColor:'#34506A',borderRadius:8,padding:12,color:'#FFF',minHeight:48},button:{padding:14,minHeight:48,borderRadius:8,marginVertical:4},selected:{backgroundColor:'#164D63'},link:{color:'#67E8F9',fontWeight:'700'},row:{flexDirection:'row',flexWrap:'wrap'},error:{color:'#FF91A4',paddingVertical:12},notice:{color:'#A7F3D0',paddingVertical:12},heading:{color:'#FFF',fontSize:17,fontWeight:'700'}});
