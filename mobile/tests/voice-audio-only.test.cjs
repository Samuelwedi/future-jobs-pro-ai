const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/VoiceNoteScreen.tsx'),'utf8');
const ast=ts.createSourceFile('VoiceNoteScreen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function expression(name){let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);assert.ok(expression,name);return expression.getText(ast);}
function handler(name,context){return vm.runInNewContext(ts.transpileModule('result = '+expression(name),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}
function fixture(mode=false){
 const calls=[],state={};let valid=true,revision=0;
 const session={ownerId:'worker',companyId:'company',token:'token',revision:0};
 const response={success:true,voiceNoteId:'note',transcriptionStatus:mode?'completed':'skipped',audioUrl:'https://example.test/audio',transcript:null,structuredData:null};
 const c={calls,state,session,response,recordingMode:{current:mode},recordingSession:{current:session},mounted:{current:true},generation:{current:0},current:epoch=>valid&&epoch===c.generation.current,
  busy:{current:false},receiptLoading:false,receiptLoadError:null,savedReceipt:null,retryUri:null,user:{id:'worker',companyId:'company'},projectId:'project',timeEntryId:'shift',t:s=>s,
  setResult:r=>state.result=r,setIsProcessing:v=>state.processing=v,setRetryUri:v=>state.retry=v,setSavedReceipt:v=>state.saved=v,setReceiptLoadError:v=>state.loadError=v,
  Alert:{alert:(...v)=>calls.push(['alert',...v])},Haptics:{NotificationFeedbackType:{Success:'ok'},notificationAsync:async()=>{calls.push(['haptic']);}},
  loadPending:async()=>{calls.push(['reload']);},
  api:{captureVoiceSession:async()=>session,assertVoiceSession:s=>{if(s.revision!==revision)throw Error('Account changed');}},
  startVoiceUpload:async(...args)=>{calls.push(['start',...args]);return {state:'completed',response};},
  recoverVoiceUpload:async(...args)=>{calls.push(['recover',...args]);return {state:'completed',response};},
 };
 c.showOutcome=handler('showOutcome',c);c.stale=()=>{valid=false;};c.changeAccount=()=>{revision++;};return c;
}
test('audio-only saved acknowledgment keeps null content and uses stable original project/shift/mode',async()=>{
 const c=fixture();await handler('processRecording',c)('file:///note.m4a');
 const start=c.calls.find(x=>x[0]==='start');assert.equal(start[2],'project');assert.equal(start[3],'shift');assert.equal(start[4],'audio-only');
 assert.equal(c.state.result,c.response);assert.equal(c.state.result.structuredData,null);assert.equal(c.state.retry,null);assert.equal(c.state.processing,false);
 assert.equal(c.calls.some(x=>x[0]==='haptic'),true);assert.doesNotMatch(source,/recordAIEvent|uploadFileWithData/);
});
test('acknowledged empty transcript remains saved instead of offering duplicate note processing',async()=>{
 const c=fixture(true);c.response.transcript='';await handler('processRecording',c)('local');
 assert.equal(c.calls.find(x=>x[0]==='start')[4],'audio-transcribed');assert.equal(c.state.result,c.response);assert.equal(c.state.retry,null);
 assert.equal(c.calls.some(x=>x[0]==='alert'),false);assert.doesNotMatch(source,/No speech was detected|Please retry your voice note/);
});
test('offline prepared and uncertain submitted outcomes show distinct recovery without a new upload affordance',async()=>{
 for(const phase of ['prepared','submitted']){const c=fixture();const receipt={phase,mode:'audio-only'};
  c.startVoiceUpload=async()=>({state:phase==='prepared'?'prepared':'pending',receipt});
  await handler('processRecording',c)('local');assert.equal(c.state.saved,receipt);assert.equal(c.state.retry,null);assert.equal(c.state.result,null);
  const alert=c.calls.find(x=>x[0]==='alert');assert.match(alert[2],phase==='prepared'?/saved locally/:/will not be uploaded again/);
 }
 assert.match(source,/Send saved recording/);assert.match(source,/Check recording status/);assert.doesNotMatch(source,/Retry saved recording/);
});
test('stale completion after navigation, background or auth revision cannot show saved or success haptics',async()=>{
 for(const stale of ['navigation','background','account']){const c=fixture();c.startVoiceUpload=async()=>{if(stale==='account')c.changeAccount();else if(stale==='background')c.generation.current++;else c.stale();return {state:'completed',response:c.response};};
  await handler('processRecording',c)('local');assert.equal(c.state.result,null);assert.equal(c.calls.some(x=>x[0]==='haptic'),false);
 }
});
test('preparation failure reloads durable receipt state and does not discard the stopped source',async()=>{
 const c=fixture();c.startVoiceUpload=async()=>{throw Error('storage unavailable');};await handler('processRecording',c)('local');
 assert.equal(c.state.retry,'local');assert.equal(c.calls.some(x=>x[0]==='reload'),true);assert.equal(c.state.result,null);
 assert.match(c.calls.find(x=>x[0]==='alert')[2],/storage unavailable/);
});
test('durable preparation disables original-source retry even when final cleanup acknowledgment is lost or blurred',async()=>{
 for(const failure of ['write-acknowledgment','blur']){
  const c=fixture();c.startVoiceUpload=async(...args)=>{args[6]({phase:'prepared',mode:'audio-only'});if(failure==='blur')c.stale();throw Error('cleanup acknowledgment lost');};
  // Simulates a completion that removed the index before rejecting. There is no
  // durable receipt to reload, but the old source must not become a new POST.
  c.loadPending=async()=>{c.setSavedReceipt(null);};
  await handler('processRecording',c)('local');
  assert.equal(c.state.retry,null);assert.equal(c.state.result,null);assert.equal(c.calls.some(x=>x[0]==='haptic'),false);
 }
});
test('recovery uses original saved scope, prevents repeated taps, and fences stale session capture',async()=>{
 const c=fixture();c.savedReceipt={phase:'submitted',mode:'audio-only'};let release;c.api.captureVoiceSession=()=>new Promise(r=>release=r);
 const recover=handler('recoverRecording',c),first=recover();await recover();assert.equal(c.busy.current,true);c.stale();release(c.session);await first;
 assert.equal(c.calls.some(x=>x[0]==='recover'),false);assert.equal(c.busy.current,false);
 const d=fixture();d.savedReceipt={phase:'submitted',mode:'audio-only'};d.timeEntryId='';await handler('recoverRecording',d)();
 const request=d.calls.find(x=>x[0]==='recover');assert.equal(request[2],'project');assert.equal(request[3],null);assert.equal(d.state.result,d.response);
});
test('recording switch is accessible and blocked by pending, loading, failed storage reads and local source',()=>{
 let switchNode;function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='Switch')switchNode=n;ts.forEachChild(n,visit);}visit(ast);
 const attributes=Object.fromEntries(switchNode.attributes.properties.map(p=>[p.name.getText(ast),p.initializer.expression.getText(ast)]));
 assert.equal(attributes.accessibilityLabel,'t("Transcribe and summarize")');
 const base={busy:{current:false},audioRecorder:{hasRecording:false},retryUri:null,isRecording:false,isProcessing:false,receiptLoading:false,receiptLoadError:null,savedReceipt:null};
 for(const override of [{isRecording:true},{isProcessing:true},{retryUri:'saved'},{receiptLoading:true},{receiptLoadError:'unreadable'},{savedReceipt:{phase:'submitted'}}])assert.equal(vm.runInNewContext(attributes.disabled,{...base,...override}),true);
 for(const override of [{busy:{current:true}},{audioRecorder:{hasRecording:true}},{retryUri:'saved'},{receiptLoading:true},{receiptLoadError:'unreadable'},{savedReceipt:{phase:'submitted'}}]){
  const c={...base,...override,setTranscribe:v=>c.value=v};vm.runInNewContext(ts.transpileModule('change = '+attributes.onValueChange,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);c.change(true);assert.equal(c.value,undefined);
 }
});
test('unresolved or unreadable receipts prevent starting a replacement recording before microphone use',async()=>{
 for(const override of [{receiptLoading:true},{receiptLoadError:'storage down'},{savedReceipt:{phase:'submitted'}},{retryUri:'source'}]){
  const c={...fixture(),...override,audioRecorder:{hasRecording:false}};await handler('startRecording',c)();assert.equal(c.calls.length,0);
 }
 assert.match(source,/projectId \|\| ''\}:\$\{route.params\?\.timeEntryId/);
 assert.ok(source.indexOf('if (receiptLoading || receiptLoadError || savedReceipt)')<source.indexOf('if (hasPermission === null)'));
});
test('pending storage read failure blocks replacement and stale reads cannot update another scope',async()=>{
 for(const stale of [false,true]){const c=fixture();c.loadSequence={current:0};c.setReceiptLoading=v=>c.state.loading=v;c.getPendingVoice=async()=>{if(stale)c.stale();throw Error('corrupt local index');};
  await handler('loadPending',c)();assert.equal(c.state.loadError,stale?undefined:'corrupt local index');assert.equal(c.state.saved,undefined);
 }
});

test('confirmed recovery and active processing remain visible when microphone permission is denied',async()=>{
 const c=fixture();c.hasPermission=false;c.savedReceipt={phase:'submitted',mode:'audio-only'};
 await handler('recoverRecording',c)();assert.equal(c.state.result,c.response);assert.equal(c.state.saved,null);
 assert.ok(source.indexOf('if (result) {')<source.indexOf('if (hasPermission === false)'));
 assert.ok(source.indexOf('if (isProcessing) {')<source.indexOf('if (hasPermission === null)'));
});
