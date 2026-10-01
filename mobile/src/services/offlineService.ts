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
async function read(id:string):Promise<any[]>{const raw=await AsyncStorage.getItem(key(id));return raw?JSON.parse(raw):[];}
export async function checkOnlineStatus(){try{const state=await Network.getNetworkStateAsync();isOnline=Boolean(state.isConnected)&&state.isInternetReachable!==false;return isOnline;}catch{return isOnline;}}
export function getOnlineStatus(){return isOnline;}
export function listenToNetworkChanges(callback:(online:boolean)=>void){const timer=setInterval(async()=>callback(await checkOnlineStatus()),10000);return()=>clearInterval(timer);}
export async function queueAction(action:{method:'POST'|'PUT'|'PATCH'|'DELETE';url:string;data?:any;fileUri?:string;fieldName?:string}){
 if(/\/(auth|payroll|direct-deposit|stripe|subscriptions|approvals|lucy)/.test(action.url))throw new Error('This action needs an online connection');
 const id=await owner();await exclusive(async()=>{const queue=await read(id);queue.push({...action,id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,timestamp:Date.now()});await AsyncStorage.setItem(key(id),JSON.stringify(queue));});
}
export function processQueue():Promise<void>{if(processing)return processing;processing=run().finally(()=>{processing=null;});return processing;}
async function run(){
 if(!await checkOnlineStatus())return;
 const id=await owner();
 while(true){
  if(await owner()!==id)return;
  const action=(await read(id))[0];if(!action)return;
  // Replay bypasses enqueueing, and acknowledged items are removed one at a time.
  await api.replayQueued(action);
  await exclusive(async()=>{const queue=await read(id);await AsyncStorage.setItem(key(id),JSON.stringify(queue.filter(item=>item.id!==action.id)));});
 }
}
export async function getPendingCount(){try{return(await read(await owner())).length;}catch{return 0;}}
