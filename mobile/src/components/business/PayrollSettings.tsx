import React,{useCallback,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {api} from '../../services/api';
import {useLang} from '../../context/LanguageContext';
import {BusinessButton as Button,BusinessChoice as Choice,BusinessField as Field,businessStyles as s,useBusinessAction} from './BusinessUI';
export default function PayrollSettings(){
 const{t}=useLang(),action=useBusinessAction(),generation=useRef(0);const[settings,setSettings]=useState<any>(null);
 useFocusEffect(useCallback(()=>{const current=++generation.current;void api.get<any>('/payroll/settings').then(result=>{if(current===generation.current)setSettings(result.settings);}).catch(cause=>{if(current===generation.current)action.setError(cause.message);});return()=>{generation.current++;};},[]));
 const save=()=>action.confirm(t('Save payroll settings?'),t('These settings do not authorize bank payments.'),()=>void action.run(async()=>{const body={...settings};for(const key of ['payroll_day','default_hourly_rate','overtime_multiplier','tax_rate'])body[key]=Number(body[key]);const result=await api.put<any>('/payroll/settings',body);setSettings(result.settings);action.setNotice(t('Settings saved.'));}));
 return <View style={s.card}><Text style={s.heading}>{t('Payroll settings')}</Text>{!!action.error&&<Text style={s.error}>{action.error}</Text>}{!!action.notice&&<Text style={s.body}>{action.notice}</Text>}{settings&&<><Choice label="Schedule" value={settings.payroll_schedule||''} onChange={value=>setSettings((current:any)=>({...current,payroll_schedule:value}))} disabled={action.busy} options={['weekly','biweekly','monthly',''].map(value=>({value,label:t(value||'Manual')}))}/>{[['payroll_day','Day of week (0–6) or month (1–31)'],['payroll_time','Time (HH:mm)'],['default_hourly_rate','Default hourly rate'],['overtime_multiplier','Overtime multiplier'],['tax_rate','Tax rate']].map(([key,label])=><Field key={key} label={label} value={String(settings[key]??'')} numeric={key!=='payroll_time'} disabled={action.busy} onChange={value=>setSettings((current:any)=>({...current,[key]:value}))}/>)}<Button label="Save payroll settings" disabled={action.busy} onPress={save}/></>}</View>;
}
