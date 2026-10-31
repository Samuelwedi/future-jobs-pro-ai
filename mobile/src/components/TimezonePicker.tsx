import React,{useMemo,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,FlatList} from 'react-native';
import {AdaptiveModal as Modal} from './AdaptiveModal';
const fallback=['UTC','America/Anchorage','America/Chicago','America/Denver','America/Edmonton','America/Halifax','America/Los_Angeles','America/Mexico_City','America/New_York','America/Phoenix','America/Sao_Paulo','America/St_Johns','America/Toronto','America/Vancouver','Asia/Dubai','Asia/Hong_Kong','Asia/Karachi','Asia/Kolkata','Asia/Manila','Asia/Shanghai','Asia/Singapore','Asia/Tokyo','Australia/Brisbane','Australia/Melbourne','Australia/Perth','Australia/Sydney','Europe/Berlin','Europe/London','Europe/Paris','Pacific/Auckland','Pacific/Honolulu'];
export default function TimezonePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false);const [search,setSearch]=useState('');
 const zones=useMemo(()=>{
  let available:string[]=fallback;
  try{const list=(Intl as any).supportedValuesOf?.('timeZone');if(list?.length)available=list;}catch{}
  const device=Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set(['UTC',value,device,...available])].filter(Boolean).sort();
 },[value]);
 return <View style={{marginBottom:16}}>
  <Text style={{color:'#CCC',marginBottom:8}}>Company time zone</Text>
  <TouchableOpacity accessibilityRole="button" onPress={()=>{setSearch('');setOpen(true);}} style={{padding:16,backgroundColor:'#242424',borderRadius:8}}><Text style={{color:'#FFF'}}>{value} · Choose time zone</Text></TouchableOpacity>
  <Modal visible={open} onRequestClose={()=>setOpen(false)} animationType="slide">
   <View style={{flex:1,padding:24,backgroundColor:'#101820'}}>
    <Text style={{color:'#FFF',fontSize:22}}>Choose time zone</Text>
    <TextInput accessibilityLabel="Search time zones" placeholder="Search city or region" placeholderTextColor="#AAB" value={search} onChangeText={setSearch} autoCapitalize="none" style={{color:'#FFF',padding:16,backgroundColor:'#263340',marginVertical:16}}/>
    <FlatList keyboardShouldPersistTaps="handled" data={zones.filter(z=>z.toLowerCase().replace(/_/g,' ').includes(search.trim().toLowerCase()))} keyExtractor={z=>z} renderItem={({item})=><TouchableOpacity accessibilityRole="button" onPress={()=>{onChange(item);setOpen(false);}} style={{padding:16}}><Text style={{color:item===value?'#00D4FF':'#FFF'}}>{item.replace(/_/g,' ')}</Text></TouchableOpacity>} ListEmptyComponent={<Text style={{color:'#FFF'}}>No matching time zone.</Text>}/>
    <TouchableOpacity onPress={()=>setOpen(false)} style={{padding:18}}><Text style={{color:'#00D4FF'}}>Cancel</Text></TouchableOpacity>
   </View>
  </Modal>
 </View>;
}
