import React, {useState} from 'react';
import {ScrollView,Text,TextInput,TouchableOpacity,Alert} from 'react-native';
import {useAuth} from '../context/AuthContext';
import {api} from '../services/api';
export default function ChangeTemporaryPasswordScreen() {
 const {refreshUser,logout}=useAuth();
 const [currentPassword,setCurrent]=useState(''); const [newPassword,setNew]=useState(''); const [confirm,setConfirm]=useState('');
 const [visible,setVisible]=useState(false); const [busy,setBusy]=useState(false);
 const save=async()=>{
  if(busy)return;
  if(newPassword!==confirm)return Alert.alert('Passwords do not match','Enter the same new password twice.');
  setBusy(true);
  try{await api.post('/auth/change-password',{currentPassword,newPassword});await refreshUser();}
  catch(e:any){Alert.alert('Change password',e.response?.data?.message||e.message);}
  finally{setBusy(false);}
 };
 const input={color:'#FFF',backgroundColor:'#1C2933',padding:16,borderRadius:8,marginTop:16};
 return <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,padding:24,justifyContent:'center',backgroundColor:'#0A0A0A'}}>
 <Text style={{color:'#FFF',fontSize:24}}>Change your temporary password</Text>
 <Text style={{color:'#BCCAD6',marginTop:12}}>Before using your account, choose a new password with 8 to 72 characters, including letters and a number or symbol.</Text>
 <TextInput accessibilityLabel="Temporary password" style={input} placeholderTextColor="#AAB" placeholder="Temporary password" value={currentPassword} onChangeText={setCurrent} secureTextEntry={!visible} autoCapitalize="none"/>
 <TextInput accessibilityLabel="New password" style={input} placeholderTextColor="#AAB" placeholder="New password" value={newPassword} onChangeText={setNew} secureTextEntry={!visible} autoCapitalize="none"/>
 <TextInput accessibilityLabel="Confirm new password" style={input} placeholderTextColor="#AAB" placeholder="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry={!visible} autoCapitalize="none"/>
 <TouchableOpacity onPress={()=>setVisible(!visible)} style={{padding:16}}><Text style={{color:'#00D4FF'}}>{visible?'Hide passwords':'Show passwords'}</Text></TouchableOpacity>
 <TouchableOpacity disabled={busy} onPress={()=>void save()} style={{padding:18,backgroundColor:'#176274',borderRadius:8}}><Text style={{color:'#FFF'}}>{busy?'Saving…':'Save password'}</Text></TouchableOpacity>
 <TouchableOpacity disabled={busy} onPress={()=>void logout()} style={{padding:18}}><Text style={{color:'#FFF'}}>Sign out</Text></TouchableOpacity>
 </ScrollView>;
}
