const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/backgroundLocation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const shift={userId:'worker',timeEntryId:'shift',projectId:'project'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(choice='Continue', permissions='granted') {
 const log=[],store=new Map([['authToken','token'],['userData',JSON.stringify({id:'worker'})]]);
 let task, buttons, running=false;
 const modules={
  'expo-location':{Accuracy:{Balanced:3},hasStartedLocationUpdatesAsync:async()=>running,
   startLocationUpdatesAsync:async()=>{log.push('start');running=true},stopLocationUpdatesAsync:async()=>{log.push('stop');running=false},
   requestForegroundPermissionsAsync:async()=>{log.push('foreground');return{status:permissions}},
   requestBackgroundPermissionsAsync:async()=>{log.push('background');return{status:permissions}}},
  'expo-task-manager':{defineTask:(_name,fn)=>task=fn},
  'expo-secure-store':{getItemAsync:async k=>store.get(k)||null,setItemAsync:async(k,v)=>store.set(k,v),deleteItemAsync:async k=>store.delete(k)},
  'react-native':{AppState:{currentState:'active'},DeviceEventEmitter:{emit:()=>{}},Alert:{alert:(_title,body,b)=>{log.push('disclosure');assert.match(body,/closed or not in use/);buttons=b;if(choice)b.find(x=>x.text===choice).onPress()}}},
  './api':{API_URL:'https://example.invalid/api'},
 };
 const context={exports:{},require:n=>modules[n],fetch:async()=>{log.push('upload');return{ok:true,status:200}}};
 vm.runInNewContext(code,context);
 return{api:context.exports,log,store,task:args=>task(args),choose:name=>buttons.find(b=>b.text===name).onPress(),modules};
}
test('disclosure precedes OS permissions and accepted active shift starts tracking',async()=>{
 const s=setup();await s.api.startBackgroundLocation(shift);
 assert.deepEqual(s.log,['disclosure','foreground','background','start']);
 assert.equal(JSON.parse(s.store.get('activeGpsShift')).disclosureVersion,1);
 await s.task({data:{locations:[{coords:{latitude:1,longitude:2},timestamp:0}]}});
 assert.equal(s.log.at(-1),'upload');
});
test('declining collects no background location and requests no OS permissions',async()=>{
 const s=setup('Not now');await assert.rejects(s.api.startBackgroundLocation(shift),/declined/);
 assert.deepEqual(s.log,['disclosure']);assert.equal(s.store.has('activeGpsShift'),false);
});
test('OS denial never starts or stores a tracking session',async()=>{
 const s=setup('Continue','denied');await assert.rejects(s.api.startBackgroundLocation(shift),/permission/);
 assert.deepEqual(s.log,['disclosure','foreground']);assert.equal(s.store.has('activeGpsShift'),false);
});
test('clock-out during disclosure cancels start without waiting for a dialog response',async()=>{
 const s=setup(null);const start=s.api.startBackgroundLocation(shift);await tick();
 await s.api.stopBackgroundLocation();await start;s.choose('Continue');await tick();
 assert.deepEqual(s.log,['disclosure']);assert.equal(s.store.has('activeGpsShift'),false);
});
test('legacy sessions lacking disclosure consent cannot upload',async()=>{
 const s=setup();s.store.set('activeGpsShift',JSON.stringify(shift));
 await s.task({data:{locations:[{coords:{latitude:1},timestamp:0}]}});
 assert.equal(s.log.includes('upload'),false);assert.equal(s.store.has('activeGpsShift'),false);
});
test('logout stops active tracking and later events cannot upload',async()=>{
 const s=setup();await s.api.startBackgroundLocation(shift);s.store.delete('authToken');await s.api.stopBackgroundLocation();
 await s.task({data:{locations:[{coords:{latitude:1},timestamp:0}]}});
 assert.equal(s.log.includes('stop'),true);assert.equal(s.log.includes('upload'),false);
});
test('cannot prompt or start tracking from a background app',async()=>{
 const s=setup();s.modules['react-native'].AppState.currentState='background';
 await assert.rejects(s.api.startBackgroundLocation(shift),/Open the app/);assert.deepEqual(s.log,[]);
});
test('same accepted active shift resumes without another disclosure',async()=>{
 const s=setup();await s.api.startBackgroundLocation(shift);await s.api.startBackgroundLocation(shift);
 assert.equal(s.log.filter(x=>x==='disclosure').length,1);assert.equal(s.log.filter(x=>x==='start').length,1);
});
