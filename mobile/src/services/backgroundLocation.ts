import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import {DeviceEventEmitter} from 'react-native';
import {API_URL} from './api';
const TASK='future-jobs-active-shift-location';
const SESSION='activeGpsShift';
const endpoint=API_URL;
TaskManager.defineTask(TASK,async({data,error}:any)=>{
 if(error){DeviceEventEmitter.emit('gps-tracking-status','Background location paused');return;}
 const raw=await SecureStore.getItemAsync(SESSION),token=await SecureStore.getItemAsync('authToken'),userRaw=await SecureStore.getItemAsync('userData');
 if(!raw||!token||!userRaw)return;
 const session=JSON.parse(raw);if(JSON.parse(userRaw).id!==session.userId){await stopBackgroundLocation();return;}
 for(const point of data?.locations||[]){
  try{const response=await fetch(`${endpoint}/gps/update`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({...session,...point.coords,capturedAt:new Date(point.timestamp).toISOString()})});
  if(response.status===401||response.status===403){await stopBackgroundLocation();return;}
  DeviceEventEmitter.emit('gps-tracking-status',response.ok?'Background tracking active':'GPS upload pending connection');
  }catch{DeviceEventEmitter.emit('gps-tracking-status','GPS upload unavailable while offline');}
 }
});
export async function startBackgroundLocation(session:{userId:string;timeEntryId:string;projectId:string}){
 const fg=await Location.requestForegroundPermissionsAsync();if(fg.status!=='granted')throw new Error('Location permission is required for GPS');
 const bg=await Location.requestBackgroundPermissionsAsync();if(bg.status!=='granted')throw new Error('Background permission not granted; tracking is available while this screen is open');
 await SecureStore.setItemAsync(SESSION,JSON.stringify(session));
 if(!await Location.hasStartedLocationUpdatesAsync(TASK))await Location.startLocationUpdatesAsync(TASK,{accuracy:Location.Accuracy.Balanced,timeInterval:15000,distanceInterval:20,pausesUpdatesAutomatically:false,showsBackgroundLocationIndicator:true,foregroundService:{notificationTitle:'Future Jobs work tracking',notificationBody:'Location is shared during your active shift.',killServiceOnDestroy:true}});
 DeviceEventEmitter.emit('gps-tracking-status','Background tracking active');
}
export async function stopBackgroundLocation(){await SecureStore.deleteItemAsync(SESSION);if(await Location.hasStartedLocationUpdatesAsync(TASK))await Location.stopLocationUpdatesAsync(TASK);}
