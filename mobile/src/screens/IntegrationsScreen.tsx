import React,{useCallback,useRef,useState} from 'react';
import {AppState,Linking,Text,View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {BusinessButton as Button,BusinessPage as Page,businessStyles as s,useBusinessAction} from '../components/business/BusinessUI';
import {api} from '../services/api';
import {integrationAuthUrl} from '../utils/businessValidation';
import {useLang} from '../context/LanguageContext';
type Provider='quickbooks'|'stripe';
export default function IntegrationsScreen(){const action=useBusinessAction();const{t}=useLang();const[status,setStatus]=useState<any>(null);const sequence=useRef(0);
 const refresh=useCallback(async()=>{const current=++sequence.current;try{const result=await api.get('/integrations/status');if(current===sequence.current)setStatus(result);}catch(cause:any){if(current===sequence.current)action.setError(cause.message);}},[]);
 useFocusEffect(useCallback(()=>{void refresh();const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{sequence.current++;sub.remove();};},[refresh]));
 const connect=(provider:Provider)=>action.run(async()=>{const result=await api.get<{url:string}>(`/integrations/${provider}/auth`);await Linking.openURL(integrationAuthUrl(provider,result.url));action.setNotice(t('Complete authorization in your browser, then return and refresh status.'));});
 const disconnect=(provider:Provider)=>action.confirm(t('Disconnect integration?'),provider,()=>void action.run(async()=>{await api.post(`/integrations/${provider}/disconnect`,{});await refresh();action.setNotice(t('Integration disconnected.'));}));
 const sync=()=>action.run(async()=>{const response=await api.post<any>('/integrations/sync/stripe-to-quickbooks',{});const result=response.result;action.setNotice(`${t('Sync complete')}: ${result.created} ${t('created')}, ${result.skipped} ${t('skipped')}, ${result.failed} ${t('failed')}`);});
 return <Page title="Integrations" {...action}><Text style={s.body}>{t('Connect accounting and payments. Authorization is completed with each provider.')}</Text><Button label="Refresh status" onPress={()=>void refresh()} disabled={action.busy}/>{(['quickbooks','stripe'] as Provider[]).map(provider=><View key={provider} style={s.card}><Text style={s.heading}>{provider==='quickbooks'?'QuickBooks':'Stripe'}</Text><Text style={s.body}>{status?t(status[provider]?.connected?'Connected':'Not connected'):t('Status unavailable')}</Text>{status&&<Button label={status[provider]?.connected?'Disconnect':'Connect'} disabled={action.busy} onPress={()=>status[provider]?.connected?disconnect(provider):void connect(provider)}/>}</View>)}<Button label="Sync Stripe payments to QuickBooks" disabled={action.busy||!status?.quickbooks?.connected||!status?.stripe?.connected} onPress={()=>action.confirm(t('Sync payments?'),t('Create accounting records for existing payments.'),()=>void sync())}/></Page>;
}
