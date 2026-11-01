import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {api} from './api';
import {bytesBase64} from '../utils/businessValidation';
export async function shareBusinessFile(path:string,name:string,body?:unknown):Promise<void>{
 if(!await Sharing.isAvailableAsync())throw Error('File sharing is unavailable on this device.');
 const response=await api.downloadBusinessFile(path,body);
 const bytes=new Uint8Array(response.data);
 if(!bytes.length||bytes.length>25*1024*1024)throw Error('Choose a smaller report range (maximum 25 MB).');
 if(/json|html/.test(response.mime)||!['application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel'].includes(response.mime))throw Error('The server did not return a supported document.');
 if(response.mime==='application/pdf'&&String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-')throw Error('The server did not return a PDF document.');
 if(!FileSystem.cacheDirectory)throw Error('Local file storage is unavailable.');
 const file=FileSystem.cacheDirectory+`business-${Date.now()}-${Math.random().toString(36).slice(2)}-${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`;
 try{await FileSystem.writeAsStringAsync(file,bytesBase64(bytes),{encoding:FileSystem.EncodingType.Base64});await Sharing.shareAsync(file,{mimeType:response.mime});}
 finally{await FileSystem.deleteAsync(file,{idempotent:true}).catch(()=>{});}
}
