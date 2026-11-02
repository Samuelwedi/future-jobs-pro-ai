import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {api} from './api';
import {File,Paths} from 'expo-file-system';
import {copyBusinessStream} from '../utils/businessStream';
export async function shareBusinessFile(path:string,name:string,body?:unknown,signal?:AbortSignal):Promise<void>{
 if(!await Sharing.isAvailableAsync())throw Error('File sharing is unavailable on this device.');
 const file=new File(Paths.cache,`business-${Date.now()}-${Math.random().toString(36).slice(2)}-${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`),controller=new AbortController();
 const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel);if(signal?.aborted)controller.abort();const timer=setTimeout(cancel,300000);let handle:ReturnType<File['open']>|undefined;
 try{const response=await api.openBusinessStream(path,body,controller.signal);file.create();handle=file.open();await copyBusinessStream(response.reader,chunk=>handle!.writeBytes(chunk),response.mime,(path.startsWith('/evidence-bundles/')?250:25)*1024*1024);handle.close();handle=undefined;await response.assertCurrent();if(controller.signal.aborted)throw Error('Export cancelled.');await Sharing.shareAsync(file.uri,{mimeType:response.mime});}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();try{handle?.close();}catch{}if(file.exists)file.delete();}
}

export async function shareBusinessRecord(record:unknown,name:string):Promise<void>{
 if(!await Sharing.isAvailableAsync()||!FileSystem.cacheDirectory)throw Error('File sharing is unavailable on this device.');
 const file=FileSystem.cacheDirectory+`record-${Date.now()}-${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}.json`;
 try{await FileSystem.writeAsStringAsync(file,JSON.stringify(record,null,2));await Sharing.shareAsync(file,{mimeType:'application/json'});}
 finally{await FileSystem.deleteAsync(file,{idempotent:true}).catch(()=>{});}
}
