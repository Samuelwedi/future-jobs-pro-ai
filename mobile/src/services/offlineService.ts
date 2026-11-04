import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Network from 'expo-network';
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
 return /\/(auth|team|users|kiosk|workforce-operations|pto|pto-history|companies|payroll-rules|payroll|manual-payroll|direct-deposit|payouts?|stripe|subscriptions?|billing|approvals?|lucy(?:-v2)?|invoices?|expenses|integrations)(\/|$)/.test(path);
}
type QueuedAction = {id:string;timestamp:number;url:string;method:string;archived?:boolean;fileUri?:string;[key:string]:any};
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
  status:action.archived?'archived':requiresOnlineConfirmation(action.url)?'review':'queued'}))};
}
// Archive is reversible and only allowed for actions that cannot be replayed.
// Retain the original payload and files; never turn approval into a background action.
export async function setOfflineReviewArchived(actionId:string,expectedOwner:string,archived:boolean){
 await exclusive(async()=>{
  const id=await owner();if(id!==expectedOwner)throw new Error('Account changed. Reopen offline sync.');
  const queue=await read(id);const action=queue.find(item=>item.id===actionId);
  if(!action||!requiresOnlineConfirmation(action.url))throw new Error('This item is not available for review.');
  if(await owner()!==id)throw new Error('Account changed. Reopen offline sync.');
  action.archived=archived;await AsyncStorage.setItem(key(id),JSON.stringify(queue));
 });
}
export async function checkOnlineStatus(){try{const state=await Network.getNetworkStateAsync();isOnline=Boolean(state.isConnected)&&state.isInternetReachable!==false;return isOnline;}catch{return isOnline;}}
export function getOnlineStatus(){return isOnline;}
export function listenToNetworkChanges(callback:(online:boolean)=>void){const timer=setInterval(async()=>callback(await checkOnlineStatus()),10000);return()=>clearInterval(timer);}
export async function queueAction(action:{method:'POST'|'PUT'|'PATCH'|'DELETE';url:string;data?:any;fileUri?:string;fieldName?:string;fileInfo?:{name:string;mimeType?:string}}){
 if(requiresOnlineConfirmation(action.url))throw new Error('This action needs an online connection');
 const id=await owner();await exclusive(async()=>{const queue=await read(id);queue.push({...action,id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,timestamp:Date.now()});await AsyncStorage.setItem(key(id),JSON.stringify(queue));});
}
export function processQueue():Promise<void>{if(processing)return processing;processing=run().finally(()=>{processing=null;});return processing;}
async function run(){
 if(!await checkOnlineStatus())return;
 const id=await owner();
 while(true){
  if(await owner()!==id)return;
  const action=(await read(id)).find(item=>!item.archived&&!requiresOnlineConfirmation(item.url));if(!action)return;
  // Replay bypasses enqueueing, and acknowledged items are removed one at a time.
  // Restricted records remain visible for review but do not block evidence uploads.
  if(await owner()!==id)return;
  await api.replayQueued(action);
  await exclusive(async()=>{const queue=await read(id);await AsyncStorage.setItem(key(id),JSON.stringify(queue.filter(item=>item.id!==action.id)));});
 }
}
export async function getPendingCount(){try{return(await read(await owner())).filter(item=>!item.archived).length;}catch{return 0;}}
