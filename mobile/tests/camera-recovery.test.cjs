const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/CameraView.tsx'),'utf8');
const ast=ts.createSourceFile('CameraView.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name,context){let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);assert.ok(expression);return vm.runInNewContext(ts.transpileModule('result = '+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}
function fixture(){return {captureRecoveryReady:true,currentScope:{current:'scope'},pendingCapture:{current:null},setHasPendingCapture(){},api:{getToken:async()=>'token'},createEvidenceRequestKey:()=>'evidence-test-key',t:(s,v={})=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]??''),captureLock:{current:false},setIsProcessing(){},hasCameraPermission:true,hasAudioPermission:true,mode:'photo',isMounted:{current:true},Speech:{stop:async()=>{}},DeviceEventEmitter:{emit(){}},Alert:{alert(){}},recording:{current:false},cameraReady:true,cameraRef:{current:{}},session:{current:1},previewActive:{current:true},setIsRecording(){},MAX_VIDEO_BYTES:996147200,console};}
test('camera prevents simultaneous launches and releases lock after cancellation or failure',async()=>{
 const c=fixture();let release,calls=0;const pending=new Promise(r=>release=r);
 c.cameraRef.current.takePictureAsync=async()=>{calls++;await pending;return undefined;};
 const launch=handler('captureInApp',c);const first=launch();await launch();await new Promise(setImmediate);assert.equal(calls,1);release();await first;assert.equal(c.captureLock.current,false);
 c.cameraRef.current.takePictureAsync=async()=>{throw Error('camera failed');};await launch();assert.equal(c.captureLock.current,false);
});
test('permission rejection releases the capture lock and does not launch the camera',async()=>{
 const c=fixture();c.hasCameraPermission=false;c.setHasCameraPermission=()=>{};c.requestCameraPermissionsAsync=async()=>({status:'denied'});c.cameraRef.current.takePictureAsync=()=>{throw Error('must not launch');};
 await handler('captureInApp',c)();assert.equal(c.captureLock.current,false);
});
test('unscored evidence is saved without inventing a failure score or a dispute guarantee',async()=>{
 const c=fixture();let score='unset',message;
 Object.assign(c,{ensureLocation:async()=>null,user:{id:'user'},projectId:'project',timeEntryId:'',watermarkTemplate:'standard',address:null,setLastScore:v=>score=v,goBack(){},api:{getToken:async()=>'token',uploadFileWithData:async()=>({success:true,requestKey:'evidence-test-key'}),recordAIEvent:async()=>{}},Alert:{alert:(title,body)=>message=body}});
 await handler('uploadFile',c)('photo.jpg',false);assert.equal(score,null);assert.match(message,/assessment is unavailable/);assert.doesNotMatch(message,/hold up in any dispute/);
});

test('permission and speech completion cannot launch camera after account or project change',async()=>{
 for(const stage of ['camera','audio','speech']) {
  const c=fixture();let resolve,called=0;const pending=new Promise(r=>resolve=r);
  c.cameraRef.current.takePictureAsync=async()=>{called++;return undefined;};
  if(stage==='camera'){c.hasCameraPermission=false;c.setHasCameraPermission=()=>{};c.requestCameraPermissionsAsync=()=>pending;}
  if(stage==='audio'){c.mode='video';c.hasAudioPermission=false;c.setHasAudioPermission=()=>{};c.requestRecordingPermissionsAsync=()=>pending;}
  if(stage==='speech')c.Speech.stop=()=>pending;
  const task=handler('captureInApp',c)();await Promise.resolve();await Promise.resolve();
  c.currentScope.current='changed';resolve({status:'granted'});await task;
  assert.equal(called,0,stage);assert.equal(c.captureLock.current,false);
 }
});
test('recovery blocks new capture until loaded and retries original pending capture instead of retaking',async()=>{
 const c=fixture();let sent; c.uploadFile=async(...args)=>sent=args;c.captureRecoveryReady=false;
 const launch=handler('captureInApp',c);await launch();assert.equal(sent,undefined);
 c.captureRecoveryReady=true;c.pendingCapture.current={uri:'saved.mov',isVideo:true,fileInfo:{name:'saved.mov'}};
 await launch();assert.deepEqual(Array.from(sent),['saved.mov',true,c.pendingCapture.current.fileInfo]);
 assert.equal(c.captureLock.current,false);
});
test('rejected native camera after scope change cannot alter current processing state or show stale error',async()=>{
 const c=fixture();let reject,alerts=0,writes=0;
 c.Alert.alert=()=>alerts++;c.setIsProcessing=()=>writes++;
 c.cameraRef.current.takePictureAsync=()=>new Promise((_,r)=>reject=r);
 const task=handler('captureInApp',c)();await new Promise(setImmediate);
 c.currentScope.current='new-scope';const before=writes;reject(Error('camera interrupted'));await task;
 assert.equal(writes,before);assert.equal(alerts,0);assert.equal(c.captureLock.current,false);
});

test('photo capture uses full quality and preserves the originating token',async()=>{
 const c=fixture();let options,sent;
 c.cameraRef.current.takePictureAsync=async value=>{options=value;return {uri:'file:///photo.jpg'};};
 c.FileSystem={getInfoAsync:async()=>({exists:true,size:100})};c.uploadFile=async(...args)=>sent=args;
 await handler('captureInApp',c)();assert.equal(options.quality,1);assert.equal(options.skipProcessing,false);
 assert.deepEqual(Array.from(sent),['file:///photo.jpg',false,undefined,'token']);
});
test('video records within evidence limits and stop never starts a second recording',async()=>{
 const c=fixture();c.mode='video';let resolve,options,stops=0,sent;
 c.cameraRef.current.recordAsync=value=>{options=value;return new Promise(r=>resolve=r);};
 c.cameraRef.current.stopRecording=()=>{stops++;resolve({uri:'file:///clip.mov'});};
 c.FileSystem={getInfoAsync:async()=>({exists:true,size:100})};c.uploadFile=async(...args)=>sent=args;
 const capture=handler('captureInApp',c);const first=capture();await new Promise(setImmediate);
 assert.equal(c.recording.current,true);await capture();await first;
 assert.equal(stops,1);assert.equal(options.maxDuration,1800);assert.ok(options.maxFileSize<1024**3);
 assert.deepEqual(Array.from(sent),['file:///clip.mov',true,undefined,'token']);assert.equal(c.recording.current,false);
});
test('blur or background during capture prevents uploading stale media',async()=>{
 for(const interrupt of ['session','preview']){
 const c=fixture();let resolve,sent=false;
 c.cameraRef.current.takePictureAsync=()=>new Promise(r=>resolve=r);c.uploadFile=async()=>sent=true;
 const task=handler('captureInApp',c)();await new Promise(setImmediate);
 if(interrupt==='session')c.session.current++;else c.previewActive.current=false;
 resolve({uri:'file:///photo.jpg'});await task;assert.equal(sent,false);assert.equal(c.captureLock.current,false);
 }
});
test('capture waits for preview readiness and permission grant requires another tap',async()=>{
 const c=fixture();let captures=0;c.cameraRef.current.takePictureAsync=async()=>captures++;
 c.cameraReady=false;await handler('captureInApp',c)();assert.equal(captures,0);
 c.cameraReady=true;c.hasCameraPermission=false;c.setHasCameraPermission=()=>{};
 c.requestCameraPermissionsAsync=async()=>({status:'granted'});await handler('captureInApp',c)();assert.equal(captures,0);
});
test('selecting the current mode does not reset a ready camera',async()=>{
 const c=fixture();c.hasPendingCapture=false;c.setCameraReady=()=>assert.fail('must retain readiness');c.setMode=()=>assert.fail('must retain mode');
 await handler('selectMode',c)('photo');assert.equal(c.captureLock.current,false);
});
test('mode selection is single-flight and ignores rejected permission after interruption',async()=>{
 const c=fixture();c.hasPendingCapture=false;let reject,calls=0,alerts=0;
 c.requestRecordingPermissionsAsync=()=>{calls++;return new Promise((_,r)=>reject=r);};c.Alert.alert=()=>alerts++;
 const select=handler('selectMode',c);const first=select('video');await select('video');
 assert.equal(calls,1);c.session.current++;reject(Error('interrupted'));await first;
 assert.equal(alerts,0);assert.equal(c.captureLock.current,false);
});
