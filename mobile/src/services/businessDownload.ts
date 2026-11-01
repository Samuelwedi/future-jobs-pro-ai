import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {api} from './api';
import {bytesBase64,validateBusinessBytes} from '../utils/businessValidation';
export async function shareBusinessFile(path:string,name:string,body?:unknown):Promise<void>{
 if(!await Sharing.isAvailableAsync())throw Error('File sharing is unavailable on this device.');
 const response=await api.downloadBusinessFile(path,body);
 const bytes=new Uint8Array(response.data);
 validateBusinessBytes(bytes,response.mime);
 if(!FileSystem.cacheDirectory)throw Error('Local file storage is unavailable.');
 const file=FileSystem.cacheDirectory+`business-${Date.now()}-${Math.random().toString(36).slice(2)}-${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`;
 try{await FileSystem.writeAsStringAsync(file,bytesBase64(bytes),{encoding:FileSystem.EncodingType.Base64});await Sharing.shareAsync(file,{mimeType:response.mime});}
 finally{await FileSystem.deleteAsync(file,{idempotent:true}).catch(()=>{});}
}

export async function shareBusinessRecord(record:unknown,name:string):Promise<void>{
 if(!await Sharing.isAvailableAsync()||!FileSystem.cacheDirectory)throw Error('File sharing is unavailable on this device.');
 const file=FileSystem.cacheDirectory+`record-${Date.now()}-${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}.json`;
 try{await FileSystem.writeAsStringAsync(file,JSON.stringify(record,null,2));await Sharing.shareAsync(file,{mimeType:'application/json'});}
 finally{await FileSystem.deleteAsync(file,{idempotent:true}).catch(()=>{});}
}
