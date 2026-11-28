const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/cameraSettings.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const {highestPictureSize}=context.exports;
test('maximum resolution follows actual dimensions or the iOS full-photo preset',()=>{
 assert.equal(highestPictureSize(['1920x1080','4032x3024','3840x2160']),'4032x3024');
 assert.equal(highestPictureSize(['3840x2160','Photo','High']),'Photo');
 assert.equal(highestPictureSize(['Low','High']),'High');
 assert.equal(highestPictureSize(['invalid','0x100','100x0']),undefined);
 assert.equal(highestPictureSize([]),undefined);
});
test('screen uses embedded preview with high resolution and no native camera launcher',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/screens/CameraView.tsx'),'utf8');
 assert.match(source,/<EmbeddedCamera/);assert.match(source,/videoQuality="2160p"/);
 assert.doesNotMatch(source,/launchCameraAsync|expo-image-picker|native app/);
 assert.match(source,/hasCameraPermission && isFocused && appActive/);
 assert.match(source,/onMountError/);assert.match(source,/AppState.addEventListener/);
});
test('the photo-only data saver is an accessible opt-in and cannot change an in-flight capture',()=>{
 const filename=path.join(__dirname,'../src/screens/CameraView.tsx');
 const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let section;
 function visit(n){
  if(ts.isJsxExpression(n)&&n.expression&&n.expression.getText(source).startsWith("mode === 'photo' &&")&&n.getText(source).includes('Photo data saver: On')) section=n.expression;
  ts.forEachChild(n,visit);
 }
 visit(source);assert.ok(section);
 const code=ts.transpileModule(section.getText(source),{fileName:filename,compilerOptions:{jsx:ts.JsxEmit.React}}).outputText;
 function render(extra={}){
  let change='untouched';
  const c={React:{createElement:(tag,props,...children)=>({tag,props,children})},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',
    t:v=>v,styles:{},mode:'photo',dataSavingPhoto:false,isProcessing:false,hasPendingCapture:false,captureRecoveryReady:true,
    captureLock:{current:false},pendingCapture:{current:null},currentScope:{current:'current'},scope:'current',
    setDataSavingScope:fn=>{change=fn(extra.dataSavingPhoto?'current':null);},...extra};
  const tree=vm.runInNewContext(code,c);
  return {tree,switchView:tree?.children?.[0],changed:()=>change};
 }
 const off=render();
 assert.equal(off.switchView.props.accessibilityRole,'switch');
 assert.equal(off.switchView.props.accessibilityState.checked,false);
 assert.match(off.switchView.children[0].children[0],/Off/);
 off.switchView.props.onPress();assert.equal(off.changed(),'current');
 const on=render({dataSavingPhoto:true});
 assert.equal(on.switchView.props.accessibilityState.checked,true);
 on.switchView.props.onPress();assert.equal(on.changed(),null);
 assert.equal(render({mode:'video'}).tree,false);
 for(const input of [{hasPendingCapture:true},{isProcessing:true},{captureRecoveryReady:false}])
  assert.equal(render(input).switchView.props.disabled,true);
 for(const input of [{pendingCapture:{current:{}}},{captureLock:{current:true}},{currentScope:{current:'other'}}]){
  const stale=render(input);stale.switchView.props.onPress();assert.equal(stale.changed(),'untouched');
 }
});
