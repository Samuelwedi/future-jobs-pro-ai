import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,Linking,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {useLang} from '../context/LanguageContext';
import {api} from '../services/api';

type Item={id:string;file_name:string;file_url:string;preview_available:boolean};
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function jpegUri(bytes:ArrayBuffer){
  const view=new Uint8Array(bytes);
  if(view.length<3||view.length>262144||view[0]!==255||view[1]!==216||view[2]!==255)throw Error('JPEG required');
  const parts=[];
  for(let i=0;i<view.length;i+=3){
    const a=view[i],b=view[i+1]||0,c=view[i+2]||0;
    parts.push(alphabet[a>>2]+alphabet[(a&3)*16+(b>>4)]+(i+1<view.length?alphabet[(b&15)*4+(c>>6)]:'=')+(i+2<view.length?alphabet[c&63]:'='));
  }
  return 'data:image/jpeg;base64,'+parts.join('');
}
const external=(value?:string)=>{
  try { const url=new URL(value||''); return url.protocol==='https:'&&!url.username&&!url.password?url.href:null; }
  catch {return null;}
};
export default function ShiftAttachmentPanel({shiftId,legacyUrl,owner,isCurrent}:{
  shiftId:string;legacyUrl?:string;owner:{id:string;companyId:string;role:string};isCurrent:()=>boolean;
}){
  const {t}=useLang();
  const [active,setActive]=useState(AppState.currentState==='active');
  const activeRef=useRef(active);
  const guard=useRef(isCurrent);guard.current=isCurrent;
  const scope=JSON.stringify([shiftId,owner.id,owner.companyId,owner.role]);
  const liveScope=useRef(scope);liveScope.current=scope;
  const instance=useRef(true);
  const listing=useRef<AbortController|null>(null), request=useRef<AbortController|null>(null);
  const [files, setFiles]=useState<{scope:string;rows:Item[]}|null>(null);
  const [preview,setPreview]=useState<{scope:string;uri:string;name:string}|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const current=()=>instance.current&&activeRef.current&&liveScope.current===scope&&guard.current();
  const clearPreview=()=>{
    request.current?.abort();request.current=null;setPreview(null);setBusy(false);
  };
  useEffect(()=>{
    const subscription=AppState.addEventListener('change',state=>{
      const foreground=state==='active';
      activeRef.current=foreground;
      if(!foreground){listing.current?.abort();clearPreview();setFiles(null);setMessage('');}
      setActive(foreground);
    });
    return ()=>subscription.remove();
  },[]);
  useEffect(()=>{
    instance.current=true;
    clearPreview();setFiles(null);setMessage('');
    if(!active||!current())return()=>{instance.current=false;};
    const controller=new AbortController();listing.current=controller;
    const valid=()=>current()&&listing.current===controller&&!controller.signal.aborted;
    void api.shiftAttachment<{success:boolean;files:Item[]}>(shiftId,owner,valid,controller.signal).then(response=>{
      if(!valid())return;
      if(!response.success||!Array.isArray(response.files))throw Error('Files unavailable');
      setFiles({scope,rows:response.files.filter(file=>file&&uuid.test(file.id)&&typeof file.file_name==='string'
        &&typeof file.file_url==='string'&&typeof file.preview_available==='boolean')});
    }).catch(()=>{if(valid())setMessage(t('Could not load files for this shift.'));});
    return ()=>{instance.current=false;controller.abort();request.current?.abort();request.current=null;};
  },[scope,active]);
  const rows=current()&&files?.scope===scope?files.rows:[];
  const openImage=async (item:Item)=>{
    if(!current()||request.current||!rows.includes(item)||!item.preview_available)return;
    const controller=new AbortController();request.current=controller;
    const valid=()=>current()&&request.current===controller&&!controller.signal.aborted;
    setPreview(null);setMessage('');setBusy(true);
    try{
      const bytes=await api.shiftAttachment<ArrayBuffer>(shiftId,owner,valid,controller.signal,item.id);
      if(valid())setPreview({scope,uri:jpegUri(bytes),name:item.file_name});
    }catch{if(valid())setMessage(t('Preview unavailable. Use Open original instead.'));}
    finally{if(request.current===controller){request.current=null;if(current())setBusy(false);}}
  };
  const openLink=(href:string)=>{
    if(current())void Linking.openURL(href).catch(()=>{if(current())setMessage(t('Could not open attachment. Refresh and try again.'));});
  };
  if (!current()) return null;
  const legacy=external(legacyUrl), shown=preview?.scope===scope?preview:null;
  return <View style={styles.panel}>
    <Text style={styles.label}>{t('Shift files')}</Text>
    {message?<Text accessibilityLiveRegion="polite" style={styles.label}>{message}</Text>:null}
    {rows.map(item=>{
      const url=external(item.file_url);
      return <View key={item.id} style={styles.row}>
        <Text style={styles.label}>{item.file_name}</Text>
        <View style={styles.actions}>
          {item.preview_available&&<TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.button} onPress={()=>void openImage(item)}>
            <Text style={styles.action}>{t('Preview image')}</Text>
          </TouchableOpacity>}
          {url&&<TouchableOpacity accessibilityRole="button" style={styles.button} onPress={()=>openLink(url)}>
            <Text style={styles.action}>{t('Open original')}</Text>
          </TouchableOpacity>}
        </View>
      </View>;
    })}
    {legacy&&!rows.some(item=>external(item.file_url)===legacy)&&
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={()=>openLink(legacy)}><Text style={styles.action}>{t('Open Attachment')}</Text></TouchableOpacity>}
    {busy&&<ActivityIndicator color="#00D4FF"/>}
    {shown&&<View>
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={()=>{if(current())clearPreview();}}>
        <Text style={styles.action}>{t('Close preview')}</Text>
      </TouchableOpacity>
      <Image accessibilityLabel={shown.name} source={{uri:shown.uri,cache:'reload'}} resizeMode="contain" style={styles.preview}/>
    </View>}
  </View>;
}
const styles=StyleSheet.create({
  panel:{gap:8,marginTop:12,paddingVertical:8},
  row:{borderColor:'#394953',borderWidth:1,borderRadius:8,padding:8},
  label:{color:'#FFF',fontSize:15},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:12},
  button:{minHeight:48,justifyContent:'center',paddingHorizontal:4},
  action:{color:'#00D4FF',fontWeight:'600'},
  preview:{width:'100%',height:245},
});
