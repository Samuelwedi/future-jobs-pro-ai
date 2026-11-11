const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/TimesheetScreen.tsx'),'utf8');
const code=source.match(/const handleAttachFile = async[\s\S]*?(?=\n  const beginEdit=)/)[0];
function fixture(){const calls=[],receipt={phase:'submitted',fileInfo:{name:'Saved.pdf'}};const c={attachmentLock:{current:false},attachmentLoading:false,user:{id:'owner',companyId:'company'},writeScope:'scope:entry',writeEpoch:{current:0},currentWriteScope:{current:'scope:entry'},selectedEntry:{id:'entry'},setAttachmentBusy:v=>calls.push(['busy',v]),setAttachmentLoadError:v=>calls.push(['loadError',v]),setSavedAttachment:v=>calls.push(['saved',v]),getPendingAttachment:async()=>undefined,api:{captureAttachmentSession:async()=>({ownerId:'owner',companyId:'company'})},DocumentPicker:{getDocumentAsync:async()=>{calls.push(['picker']);return {canceled:false,assets:[{uri:'file:///cache',name:'Picked.pdf',mimeType:'application/pdf'}]};}},startAttachmentUpload:async(_s,_id,file)=>{calls.push(['start',file]);return {state:'pending',receipt};},recoverAttachmentUpload:async()=>{calls.push(['recover']);return {state:'pending',receipt};},fetchEntries:async()=>calls.push(['refresh']),Alert:{alert:(...args)=>calls.push(['alert',...args])},t:s=>s};vm.createContext(c);vm.runInContext(ts.transpileModule(code+'\nthis.handle=handleAttachFile;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);return {c,calls,receipt};}
test('pending attachment outcomes are labelled unconfirmed and original picker metadata is retained',async()=>{
 const {c,calls}=fixture();await c.handle('entry');assert.equal(calls.find(x=>x[0]==='start')[1].name,'Picked.pdf');assert.equal(calls.some(x=>x[0]==='refresh'),false);
 assert.match(calls.find(x=>x[0]==='alert')[2],/not confirmed/);assert.equal(c.attachmentLock.current,false);
});
test('saved receipt recovery never opens the picker or chooses a new file',async()=>{
 const {c,calls,receipt}=fixture();c.getPendingAttachment=async()=>receipt;await c.handle('entry',true);
 assert.equal(calls.some(x=>x[0]==='picker'||x[0]==='start'),false);assert.equal(calls.filter(x=>x[0]==='recover').length,1);
});
test('dismissal during picker and repeated taps cannot start stale or duplicate uploads',async()=>{
 const {c,calls}=fixture();let resolve;c.DocumentPicker.getDocumentAsync=()=>new Promise(r=>resolve=r);
 const first=c.handle('entry');await new Promise(r=>setImmediate(r));await c.handle('entry');c.currentWriteScope.current=null;
 resolve({canceled:false,assets:[{uri:'file:///cache',name:'Picked.pdf'}]});await first;
 assert.equal(calls.some(x=>x[0]==='start'||x[0]==='alert'),false);assert.equal(c.attachmentLock.current,false);
});
test('confirmed completion refreshes attachments while stale completion cannot alert or close another scope',async()=>{
 for(const stale of [true,false]){const {c,calls}=fixture();c.startAttachmentUpload=async()=>{if(stale)c.writeEpoch.current++;return {state:'completed'};};await c.handle('entry');
  assert.equal(calls.some(x=>x[0]==='refresh'),!stale);assert.equal(calls.some(x=>x[0]==='alert'),!stale);
 }
});
