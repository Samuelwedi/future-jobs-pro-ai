const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname,'../src/screens/TimesheetScreen.tsx'),'utf8');
const handler = source.match(/const writeEntry = async[\s\S]*?(?=\n  const saveEdit)/)[0];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function setup(){const calls=[];const c={writeLock:{current:false},writeEpoch:{current:1},writeScope:'scope:entry',currentWriteScope:{current:'scope:entry'},selectedEntry:{id:'entry'},isBossOrManager:true,editForm:{clockIn:'2026-11-11T12:00:00Z',clockOut:'',breakMinutes:'10',reason:'Corrected time'},setWriting:v=>calls.push(['writing',v]),setEditing:v=>calls.push(['editing',v]),setSelectedEntry:v=>calls.push(['selection',v]),fetchEntries:async()=>calls.push(['refresh']),t:s=>s,Alert:{alert:(...a)=>calls.push(['alert',...a])},api:{writeTimeEntry:async(...args)=>{calls.push(['write',...args]);return {success:true};}}};vm.createContext(c);vm.runInContext(ts.transpileModule(handler+'\nthis.writeEntry=writeEntry;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);return {c,calls};}
test('correction and approval share a synchronous submission lock',async()=>{
 const {c,calls}=setup(),pending=deferred();c.api.writeTimeEntry=async(...args)=>{calls.push(['write',...args]);return pending.promise;};
 const first=c.writeEntry('correct');await c.writeEntry('correct');await c.writeEntry('approve');
 assert.equal(calls.filter(x=>x[0]==='write').length,1);pending.resolve({success:true});await first;
 assert.equal(c.writeLock.current,false);assert.equal(calls.filter(x=>x[0]==='refresh').length,1);
});
test('scope, dialog generation or unmount changes suppress stale success and errors',async()=>{
 for(const mode of ['scope','generation','unmount'])for(const fail of [true,false]){
  const {c,calls}=setup(),pending=deferred();c.api.writeTimeEntry=()=>pending.promise;
  const writing=c.writeEntry('approve');if(mode==='generation')c.writeEpoch.current++;else c.currentWriteScope.current=mode==='unmount'?null:'other';
  if(fail)pending.reject(Error('late failure'));else pending.resolve({success:true});await writing;
  assert.equal(calls.some(x=>['alert','selection','editing','refresh'].includes(x[0])),false);assert.equal(c.writeLock.current,false);
 }
});
test('failures preserve draft and explain an uncertain outcome instead of claiming no write happened',async()=>{
 const {c,calls}=setup();c.api.writeTimeEntry=async()=>{throw Error('timeout');};await c.writeEntry('correct');
 assert.equal(calls.some(x=>['selection','editing','refresh'].includes(x[0])),false);
 assert.match(calls.find(x=>x[0]==='alert')[2],/not confirmed.*Refresh/);
 assert.equal(c.editForm.reason,'Corrected time');assert.equal(c.writeLock.current,false);
});
test('unauthorized, payroll-locked and stale handlers cannot write; false success is not announced',async()=>{
 for(const mode of ['role','locked','stale']){
  const {c,calls}=setup();if(mode==='role')c.isBossOrManager=false;if(mode==='locked')c.selectedEntry.payroll_locked=true;if(mode==='stale')c.currentWriteScope.current='other';
  await c.writeEntry('approve');assert.equal(calls.length,0);
 }
 const {c,calls}=setup();c.api.writeTimeEntry=async()=>({success:false});await c.writeEntry('correct');
 assert.equal(calls.some(x=>x[0]==='refresh'),false);assert.equal(calls.find(x=>x[0]==='alert')[1],'Time entry change not confirmed');
});
