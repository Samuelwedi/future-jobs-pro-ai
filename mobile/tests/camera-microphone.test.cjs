const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(){const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/cameraMicrophone.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
test('camera ownership awaits wake microphone release and overlapping leases remain held',async()=>{
 const m=setup();let resolve,released=0;
 const unobserve=m.observeCameraMicrophone(held=>held?new Promise(r=>resolve=r):Promise.resolve(released++));
 let ready=false;const pending=m.acquireCameraMicrophone().then(release=>{ready=true;return release;});
 await Promise.resolve();assert.equal(ready,false);assert.equal(m.cameraMicrophoneHeld(),true);
 resolve();const release1=await pending;unobserve();const release2=await m.acquireCameraMicrophone();
 m.observeCameraMicrophone(async held=>{if(!held)released++;});release1();assert.equal(m.cameraMicrophoneHeld(),true);
 release2();assert.equal(m.cameraMicrophoneHeld(),false);assert.equal(released,1);release2();assert.equal(released,1);
});
test('failed wake release abandons lease instead of opening microphone',async()=>{
 const m=setup();m.observeCameraMicrophone(async held=>{if(held)throw Error('stop failed');});
 await assert.rejects(m.acquireCameraMicrophone(),/stop failed/);assert.equal(m.cameraMicrophoneHeld(),false);
});
test('wake stop waits for native startup before handing microphone to camera',async()=>{
 const context={exports:{},require:name=>name==='react-native'?{DeviceEventEmitter:{emit(){}}}:name==='expo-audio'?{}:name.includes('LucyMobileWakeService')?{}:name.includes('LucyWakeAudio')?{}:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/wakeWordService.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const service=new context.exports.WakeWordService(()=>{});let resolve,stopped=false,complete=false;
 service.starting=new Promise(r=>resolve=r).then(()=>{service.service={stop:async()=>{stopped=true;}};});
 const task=service.stop().then(()=>complete=true);await Promise.resolve();assert.equal(complete,false);
 resolve();await task;assert.equal(stopped,true);assert.equal(complete,true);
});
test('real wake stop rejects failed native cleanup, retains handle and permits a successful retry',async()=>{
 const m=setup(),statuses=[];
 const context={exports:{},require:name=>name==='react-native'?{DeviceEventEmitter:{emit:(event,value)=>statuses.push(value.status)}}:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/wakeWordService.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const wake=new context.exports.WakeWordService(()=>{});let stops=0;
 const native={stop:async()=>{if(++stops===1)throw Error('native stop failed');}};wake.service=native;
 m.observeCameraMicrophone(async held=>{if(held)await wake.stop();});
 await assert.rejects(m.acquireCameraMicrophone(),/native stop failed/);
 assert.equal(wake.service,native);assert.equal(m.cameraMicrophoneHeld(),false);assert.ok(!statuses.includes('off'));
 const release=await m.acquireCameraMicrophone();assert.equal(stops,2);assert.equal(wake.service,undefined);assert.equal(statuses.at(-1),'off');release();
});
test('App handoff serialization retries retained handle after rejection instead of poisoning chain',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='stopWakeWord')expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);
 let calls=0;const service={stop:async()=>{if(++calls===1)throw Error('native stop failed');}};
 const c={wakeSyncGenerationRef:{current:0},wakeWordRef:{current:service},wakeStoppingRef:{current:Promise.resolve()}};
 const stop=vm.runInNewContext(ts.transpileModule('result = '+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 await assert.rejects(stop(),/native stop failed/);assert.equal(c.wakeWordRef.current,service);
 await stop();assert.equal(calls,2);assert.equal(c.wakeWordRef.current,null);
});
test('failed startup plus failed cleanup retains native handle until stop is verified',async()=>{
 let stops=0;
 class NativeDetector {async start(){throw Error('start failed');}async stop(){if(++stops<3)throw Error('stop failed');}}
 const context={exports:{},require:name=>name==='react-native'?{DeviceEventEmitter:{emit(){}}}:name==='expo-audio'?{getRecordingPermissionsAsync:async()=>({granted:true})}:name.includes('LucyMobileWakeService')?{LucyMobileWakeService:NativeDetector}:name.includes('LucyWakeAudio')?{LucyWakeAudio:{isAvailable:true}}:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/wakeWordService.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const wake=new context.exports.WakeWordService(()=>{});
 await assert.rejects(wake.start(),/start failed/);assert.ok(wake.service);
 await assert.rejects(wake.stop(),/stop failed/);assert.ok(wake.service);
 await wake.stop();assert.equal(wake.service,undefined);assert.equal(stops,3);
});
test('overlapping wake preference reads start only the newest detector and camera stop invalidates pending start',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8'),ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function handler(name,c){let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);return vm.runInNewContext(ts.transpileModule('result = '+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);}
 let starts=0;const reads=[];
 const c={wakeSyncGenerationRef:{current:0},wakeWordRef:{current:null},wakeStoppingRef:{current:Promise.resolve()},disposed:false,microphoneBusy:false,cameraMicrophoneHeld:()=>false,isAuthenticated:true,user:{},AppState:{currentState:'active'},AsyncStorage:{getItem:()=>new Promise(r=>reads.push(r))},WakeWordService:class {async start(){starts++;}async stop(){}},console};
 c.stopWakeWord=handler('stopWakeWord',c);const sync=handler('syncWakeWord',c);
 const first=sync(),second=sync();await new Promise(setImmediate);reads[1]('true');await second;reads[0]('true');await first;assert.equal(starts,1);
 const pending=sync();await new Promise(setImmediate);await c.stopWakeWord();reads[2]('true');await pending;assert.equal(starts,1);assert.equal(c.wakeWordRef.current,null);
});
