const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
test('language initialization runs without calling hooks inside effects and preserves a new selection',async()=>{
 const effects=[];let rendering=true,resolveSaved,current='en',provided;
 const saved=new Promise(r=>resolveSaved=r);
 const react={createContext:()=>({Provider:'Provider'}),useState:init=>[current=init(),v=>current=v],useRef:v=>({current:v}),useEffect:fn=>effects.push(fn),useCallback:fn=>{assert.ok(rendering,'Hook called outside render');return fn;},createElement:(_type,props)=>{provided=props.value;return null;}};
 const storage={getItem:()=>saved,setItem:async()=>{}};
 const context={exports:{},require:name=>name==='react'?react:name==='expo-localization'?{getLocales:()=>[{languageTag:'es-MX'}]}:name.includes('async-storage')?{default:storage}:name.includes('i18n')?{deviceLanguage:()=> 'es',t:s=>s}:null};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/context/LanguageContext.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 // ES module interop expects the storage module's default export.
 const original=context.require;context.require=name=>name.includes('async-storage')?{__esModule:true,default:storage}:original(name);
 vm.runInNewContext(code,context);context.exports.LanguageProvider({children:null});rendering=false;
 const cleanups=effects.map(fn=>fn());assert.equal(current,'es');await provided.setLang('fr');resolveSaved('en');await saved;await Promise.resolve();assert.equal(current,'fr');cleanups.forEach(fn=>fn?.());
});
