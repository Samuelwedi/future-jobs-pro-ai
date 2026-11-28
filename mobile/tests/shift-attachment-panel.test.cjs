const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/ShiftAttachmentPanel.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const id=n=>'98dff19c-54dc-4d98-a396-'+String(n).padStart(12,'0');
function fixture(){
 let slot=0,tree,valid=true,foreground,shift=id(3);
 const slots=[],effects=[],requests=[],links=[];
 const react={
  createElement:(type,props,...children)=>({type,props:props||{},children}),
  useRef(value){const i=slot++;return slots[i]??(slots[i]={current:value});},
  useState(value){const i=slot++;if(!(i in slots))slots[i]=value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useEffect(fn,d){const i=slot++;const old=slots[i];if(!old||d.some((v,k)=>v!==old.deps[k])){const next={deps:d,remove:old?.remove};slots[i]=next;effects.push(()=>{next.remove?.();next.remove=fn();});}},
 };
 const rn=new Proxy({AppState:{currentState:'active',addEventListener:(_,cb)=>{foreground=cb;return{remove:()=>{foreground=undefined;}};}},StyleSheet:{create:x=>x},Linking:{openURL:async href=>links.push(href)}},{get:(o,k)=>o[k]??String(k)});
 const module={exports:{}};
 new Function('require','module','exports',source)(name=>{
  if(name==='react')return react;
  if(name==='react-native')return rn;
  if(name==='../context/LanguageContext')return {useLang:()=>({t:x=>x})};
  if(name==='../services/api')return {api:{shiftAttachment:(shift,owner,current,signal,file)=>new Promise(resolve=>requests.push({shift,owner,current,signal,file,resolve}))}};
  throw Error(name);
 },module,module.exports);
 const row={id:id(4),file_name:'field-photo.jpg',file_url:'https://fixture.invalid/photo.jpg',preview_available:true};
 const owner={id:id(1),companyId:id(2),role:'employee'};
 function render(){slot=0;tree=module.exports.default({shiftId:shift,owner,isCurrent:()=>valid,legacyUrl:'https://fixture.invalid/legacy.pdf'});while(effects.length)effects.shift()();return tree;}
 function visit(n,out=[]){if(Array.isArray(n))n.forEach(v=>visit(v,out));else if(n&&typeof n==='object'){out.push(n);visit(n.children,out);}return out;}
 const selector=text=>visit(tree).find(n=>n.type==='TouchableOpacity'&&n.children.some(c=>c?.children?.includes(text)));
 const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();render();};
 async function load(){render();requests[0].resolve({success:true,files:[row]});await tick();}
 const jpeg=()=>Uint8Array.of(255,216,255,0).buffer;
 return {load,render,selector,tick,requests,links,jpeg,image:()=>visit(tree).find(n=>n.type==='Image'),
   background(){foreground('background');},dismiss(){valid=false;},replace(){shift=id(8);render();}};
}
test('scoped JPEG renders without filesystem and original opens only when explicitly selected',async()=>{
 const f=fixture();await f.load();
 const start=f.selector('Preview image').props.onPress;start();start();
 assert.equal(f.requests.length,2);assert.equal(f.requests[1].file,id(4));
 assert.deepEqual(f.links,[]);f.requests[1].resolve(f.jpeg());await f.tick();
 assert.match(f.image().props.source.uri,/^data:image\/jpeg;base64,/);
 f.selector('Close preview').props.onPress();await f.tick();assert.equal(f.image(),undefined);
 f.selector('Open original').props.onPress();assert.deepEqual(f.links,['https://fixture.invalid/photo.jpg']);
});
test('background, shift change and dismissal prevent a pending preview or retained original link',async()=>{
 for(const action of ['background','replace','dismiss']){
  const f=fixture();await f.load();const start=f.selector('Preview image').props.onPress,link=f.selector('Open original').props.onPress;
  start();const read=f.requests[1];f[action]();link();assert.equal(read.current(),false);
  read.resolve(f.jpeg());await f.tick();assert.equal(f.image(),undefined);assert.deepEqual(f.links,[]);
 }
});
