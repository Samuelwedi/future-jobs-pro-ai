const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/CameraView.tsx'),'utf8');
const ast=ts.createSourceFile('CameraView.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name,context){let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);assert.ok(expression);return vm.runInNewContext(ts.transpileModule('result = '+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}
function fixture(){return {t:(s,v={})=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]??''),captureLock:{current:false},setIsProcessing(){},hasCameraPermission:true,hasAudioPermission:true,mode:'photo',isMounted:{current:true},Speech:{stop:async()=>{}},DeviceEventEmitter:{emit(){}},Alert:{alert(){}},ImagePicker:{MediaTypeOptions:{Images:'image',Videos:'video'},UIImagePickerControllerQualityType:{High:1}},console};}
test('camera prevents simultaneous launches and releases lock after cancellation or failure',async()=>{
 const c=fixture();let release,calls=0;const pending=new Promise(r=>release=r);
 c.ImagePicker.launchCameraAsync=async()=>{calls++;await pending;return {canceled:true};};
 const launch=handler('launchNativeCamera',c);const first=launch();await launch();await Promise.resolve();assert.equal(calls,1);release();await first;assert.equal(c.captureLock.current,false);
 c.ImagePicker.launchCameraAsync=async()=>{throw Error('camera failed');};await launch();assert.equal(c.captureLock.current,false);
});
test('permission rejection releases the capture lock and does not launch the camera',async()=>{
 const c=fixture();c.hasCameraPermission=false;c.setHasCameraPermission=()=>{};c.ImagePicker.requestCameraPermissionsAsync=async()=>({status:'denied'});c.ImagePicker.launchCameraAsync=()=>{throw Error('must not launch');};
 await handler('launchNativeCamera',c)();assert.equal(c.captureLock.current,false);
});
test('unscored evidence is saved without inventing a failure score or a dispute guarantee',async()=>{
 const c=fixture();let score='unset',message;
 Object.assign(c,{ensureLocation:async()=>null,user:{id:'user'},projectId:'project',timeEntryId:'',watermarkTemplate:'standard',address:null,setLastScore:v=>score=v,goBack(){},api:{uploadFileWithData:async()=>({success:true}),recordAIEvent:async()=>{}},Alert:{alert:(title,body)=>message=body}});
 await handler('uploadFile',c)('photo.jpg',false);assert.equal(score,null);assert.match(message,/assessment is unavailable/);assert.doesNotMatch(message,/hold up in any dispute/);
});
