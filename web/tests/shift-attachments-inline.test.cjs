const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/ShiftAttachments.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const id=n=>'98dff19c-54dc-4d98-a396-'+String(n).padStart(12,'0');
function fixture(){
 let slot=0,tree,auth=1,mounted,shiftId=id(3);
 const slots=[],effects=[],layouts=[],requests=[],revoke=[];
 const track=(queue,fn,deps)=>{const i=slot++;const old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const next={deps,remove:old?.remove};slots[i]=next;queue.push(()=>{next.remove?.();next.remove=fn();});}};
 const react={
  createElement:(type,props,...children)=>({type,props:props||{},children}),
  useRef(value){const i=slot++;return slots[i]??(slots[i]={current:value});},
  useState(value){const i=slot++;if(!(i in slots))slots[i]=value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useEffect:(fn,d)=>track(effects,fn,d),useLayoutEffect:(fn,d)=>track(layouts,fn,d),
 };
 const events=()=>{const handlers=new Map();return{addEventListener:(e,f)=>{handlers.set(e,f)},removeEventListener:(e,f)=>{if(handlers.get(e)===f)handlers.delete(e);},dispatch(e){handlers.get(e)?.();}};};
 const window={...events(),confirm:()=>true}, document={...events(),visibilityState:'visible'};
 const localStorage={getItem:k=>k==='token'?'token-fixture':JSON.stringify({id:id(1),companyId:id(2)})};
 const urls=class extends URL{
  static createObjectURL(){return 'blob:private-jpeg';}
  static revokeObjectURL(url){revoke.push(url);}
 };
 const module={exports:{}};
 new Function('require','module','exports','window','document','localStorage','fetch','URL',source)(name=>{
  if(name==='react')return react;
  if(name==='@mui/material')return new Proxy({}, {get:(_,k)=>String(k)});
  if(name==='../services/api')return {API_BASE:'https://fixture.invalid'};
  if(name==='../services/authSession')return {getAuthRevision:()=>auth,captureAuthSession:()=>{const c=auth;return{isCurrent:()=>c===auth};}};
  throw Error(name);
 },module,module.exports,window,document,localStorage,(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),urls);
 const row={id:id(4),file_name:'field-photo.jpg',file_url:'https://fixture.invalid/photo.jpg',preview_available:true};
 function render(){slot=0;tree=module.exports.default({shiftId,oldUrl:'https://fixture.invalid/legacy.pdf'});while(layouts.length)layouts.shift()();while(effects.length)effects.shift()();return tree;}
 function visit(n,out=[]){if(Array.isArray(n))n.forEach(v=>visit(v,out));else if(n&&typeof n==='object'){out.push(n);visit(n.children,out);}return out;}
 const selector=text=>visit(tree).find(n=>n.type==='Button'&&n.children.includes(text));
 const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();render();};
 async function load(){render();requests[0].resolve({ok:true,json:async()=>({success:true,files:[row,{...row,id:id(5),file_name:'schedule.pdf',preview_available:false}]})});await tick();}
 const image=()=>visit(tree).find(n=>n.props.component==='img');
 const jpeg=()=>({ok:true,headers:{get:k=>k==='content-type'?'image/jpeg':'4'},blob:async()=>new Blob([Uint8Array.of(255,216,255,0)],{type:'image/jpeg'})});
 return {load,selector,requests,tick,revoke,image,jpeg,render,replace(){auth++;window.dispatch('auth-session-changed');},switchShift(){shiftId=id(8);render();}};
}
test('preview uses authenticated scoped bytes and is rendered inline; unsupported or legacy files keep explicit open links',async()=>{
 const f=fixture();await f.load();
 assert.ok(f.selector('Open earlier attachment'));assert.ok(f.selector('Open original'));
 f.selector('Preview image').props.onClick(); const req=f.requests[1];
 assert.match(req.url,/\/shift\/.+\/file\/.+\/preview$/);
 assert.equal(req.options.headers['X-Project-Company'],id(2));assert.equal(req.options.cache,'no-store');
 req.resolve(f.jpeg());await f.tick();assert.equal(f.image().props.src,'blob:private-jpeg');
 f.selector('Close preview').props.onClick();await f.tick();assert.equal(f.image(),undefined);
 assert.deepEqual(f.revoke,['blob:private-jpeg']);
});
test('shift or account replacement aborts pending preview and does not read stale response bytes',async()=>{
 for(const action of ['replace','switchShift']){
  const f=fixture();await f.load();const stale=f.selector('Preview image').props.onClick;stale();const req=f.requests[1];
  f[action]();f.render();assert.equal(req.options.signal.aborted,true);stale();
  let read=false;req.resolve({...f.jpeg(),blob:async()=>{read=true;}});
  await f.tick();assert.equal(read,false);assert.equal(f.image(),undefined);
 }
});
