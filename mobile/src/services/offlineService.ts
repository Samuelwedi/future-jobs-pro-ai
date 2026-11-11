import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system/legacy';
import { api } from './api';
let isOnline=true;
let processing:Promise<void>|null=null;
let writes:Promise<any>=Promise.resolve();
const exclusive=<T>(work:()=>Promise<T>):Promise<T>=>{const next=writes.then(work);writes=next.catch(()=>undefined);return next;};
async function owner(){const raw=await SecureStore.getItemAsync('userData');const user=raw?JSON.parse(raw):null;if(!user?.id)throw new Error('Sign in before saving offline work');return String(user.id);}
const key=(id:string)=>`offline-queue-v2:${id}`;
// Money, approval, and account changes must be confirmed by the server while online.
// Apply this to both new work and old queued records before replay.
export function requiresOnlineConfirmation(url:string){
 const path=url.split('?')[0].toLowerCase();
 return /^\/(?:api\/)?voice\/process(?:-transcript)?\/?$/.test(path) || /^\/(?:api\/)?attachments\/upload\/?$/.test(path) || /^\/(?:api\/)?voice\/[^/]+\/transcript\/?$/.test(path) || /\/(?:time-entries\/(?:bulk-)?clock-(?:in|out)|crew\/clock-(?:in|out))(?:\/|$)/.test(path) || /\/(auth|team|users|projects|kiosk|workforce-operations|pto|pto-history|companies|payroll-rules|payroll|manual-payroll|direct-deposit|payouts?|stripe|subscriptions?|billing|approvals?|lucy(?:-v2)?|invoices?|expenses|integrations)(\/|$)/.test(path);
}
export type QueuedAction = {id:string;timestamp:number;url:string;method:string;archived?:boolean;fileUri?:string;[key:string]:any};
export const isEvidenceUpload = (url:string) => /^\/(?:api\/)?photos\/upload\/?(?:\?|$)/i.test(url);
export const validEvidenceKey = (value:unknown):value is string => typeof value==='string' && /^[a-zA-Z0-9_.:-]{16,100}$/.test(value);
const requiresReview = (action:QueuedAction) => requiresOnlineConfirmation(action.url) || (isEvidenceUpload(action.url) && (!validEvidenceKey(action.data?.requestKey) || !action.fileUri));
async function read(id:string):Promise<QueuedAction[]>{
 const raw=await AsyncStorage.getItem(key(id));const value=raw?JSON.parse(raw):[];
 if(!Array.isArray(value)||value.some(item=>!item||typeof item.id!=='string'||typeof item.url!=='string'))throw new Error('Offline records could not be read. They have not been changed.');
 return value;
}
export type OfflineQueueItem = {id:string;timestamp:number;category:string;status:'queued'|'review'|'archived'};
export async function getOfflineQueueState():Promise<{ownerId:string;items:OfflineQueueItem[]}>{
 const ownerId=await owner();const queue=await read(ownerId);
 if(await owner()!==ownerId)throw new Error('Account changed. Reopen offline sync.');
 return {ownerId,items:queue.map(action=>({id:action.id,timestamp:action.timestamp,
  category:/^\/pto(?:-history)?(?:\/|$)/.test(action.url)?'Time off':/^\/companies(?:\/|$)/.test(action.url)?'Company settings':action.fileUri?'Media upload':'Saved action',
  status:action.archived?'archived':requiresReview(action)?'review':'queued'}))};
}
// Archive is reversible and only allowed for actions that cannot be replayed.
// Retain the original payload and files; never turn approval into a background action.
export async function setOfflineReviewArchived(actionId:string,expectedOwner:string,archived:boolean){
 await exclusive(async()=>{
  const id=await owner();if(id!==expectedOwner)throw new Error('Account changed. Reopen offline sync.');
  const queue=await read(id);const action=queue.find(item=>item.id===actionId);
  if(!action||!requiresReview(action))throw new Error('This item is not available for review.');
  if(await owner()!==id)throw new Error('Account changed. Reopen offline sync.');
  action.archived=archived;await AsyncStorage.setItem(key(id),JSON.stringify(queue));
 });
}
export async function checkOnlineStatus(){try{const state=await Network.getNetworkStateAsync();isOnline=Boolean(state.isConnected)&&state.isInternetReachable!==false;return isOnline;}catch{return isOnline;}}
export function getOnlineStatus(){return isOnline;}
export function listenToNetworkChanges(callback:(online:boolean)=>void){const timer=setInterval(async()=>callback(await checkOnlineStatus()),10000);return()=>clearInterval(timer);}
export async function queueAction(action:{method:'POST'|'PUT'|'PATCH'|'DELETE';url:string;data?:any;fileUri?:string;fieldName?:string;fileInfo?:{name:string;mimeType?:string}},expectedOwner?:string){
 if(requiresOnlineConfirmation(action.url))throw new Error('This action needs an online connection');
 if(isEvidenceUpload(action.url)&&(!validEvidenceKey(action.data?.requestKey)||!action.fileUri))throw new Error('This older evidence upload needs review before it can be sent.');
 // Snapshot before any asynchronous work; caller edits cannot change a receipt's payload.
 const snapshot=JSON.parse(JSON.stringify(action));
 const id=await owner();if(expectedOwner&&id!==expectedOwner)throw new Error('Account changed. Reopen offline sync.');
 await exclusive(async()=>{
  if(await owner()!==id)throw new Error('Account changed. Reopen offline sync.');
  const queue=await read(id);
  const existing=isEvidenceUpload(snapshot.url)?queue.find(item=>isEvidenceUpload(item.url)&&item.data?.requestKey===snapshot.data.requestKey):undefined;
  if(existing){
   if(JSON.stringify(existing.data)!==JSON.stringify(snapshot.data)||JSON.stringify(existing.fileInfo)!==JSON.stringify(snapshot.fileInfo))throw new Error('The saved capture cannot be changed. Check its original upload status.');
   return;
  }
  if(await owner()!==id)throw new Error('Account changed. Reopen offline sync.');
  queue.push({...snapshot,ownerId:id,id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,timestamp:Date.now()});await AsyncStorage.setItem(key(id),JSON.stringify(queue));
 });
}
export async function getPendingEvidence(expectedOwner:string,projectId?:string,requestKey?:string):Promise<QueuedAction|undefined>{
 if(await owner()!==expectedOwner)throw new Error('Account changed. Reopen offline sync.');
 const queue=await read(expectedOwner);
 if(await owner()!==expectedOwner)throw new Error('Account changed. Reopen offline sync.');
 return queue.find(action=>!action.archived&&isEvidenceUpload(action.url)&&!requiresReview(action)&&(!projectId||action.data?.projectId===projectId)&&(!requestKey||action.data?.requestKey===requestKey));
}
export async function completeQueuedEvidence(requestKey:string,expectedOwner:string){
 // Completion belongs to the original account, even if it signed out while awaiting the server.
 await exclusive(async()=>{
  const queue=await read(expectedOwner);
  const completed=queue.filter(item=>isEvidenceUpload(item.url)&&item.data?.requestKey===requestKey);
  for(const item of completed){
   // Only remove the app-created copy after a matching server acknowledgement.
   // Never delete camera originals or unrelated local paths from old queue entries.
   const prefix=FileSystem.documentDirectory;
   const suffix=prefix&&item.fileUri?.startsWith(prefix)?item.fileUri.slice(prefix.length):'';
   if(validEvidenceKey(requestKey)&&suffix.startsWith(requestKey+'.')&&/^[a-zA-Z0-9]+$/.test(suffix.slice(requestKey.length+1))){
    await FileSystem.deleteAsync(item.fileUri!,{idempotent:true});
   }
  }
  // A cleanup failure leaves the receipt indexed for a later status-only retry.
  await AsyncStorage.setItem(key(expectedOwner),JSON.stringify(queue.filter(item=>!completed.includes(item))));
 });
}
export function processQueue():Promise<void>{if(processing)return processing;processing=run().finally(()=>{processing=null;});return processing;}
async function run(){
 if(!await checkOnlineStatus())return;
 const id=await owner();
 const attempted=new Set<string>();
 while(true){
  if(await owner()!==id)return;
  const action=(await read(id)).find(item=>!item.archived&&!requiresReview(item)&&!attempted.has(item.id));if(!action)return;
  // Replay bypasses enqueueing, and acknowledged items are removed one at a time.
  // Restricted records remain visible for review but do not block evidence uploads.
  if(await owner()!==id)return;
  attempted.add(action.id);
  try { await api.replayQueued({...action,ownerId:id}); }
  catch(error:any){if(error?.code==='EVIDENCE_PENDING')continue;throw error;}
  await exclusive(async()=>{const queue=await read(id);await AsyncStorage.setItem(key(id),JSON.stringify(queue.filter(item=>item.id!==action.id)));});
 }
}
export async function getPendingCount(){try{return(await read(await owner())).filter(item=>!item.archived).length;}catch{return 0;}}
