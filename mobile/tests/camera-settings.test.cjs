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
