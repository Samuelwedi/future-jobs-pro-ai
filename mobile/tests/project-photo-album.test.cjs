const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const src=fs.readFileSync(path.join(__dirname,'../src/screens/ProjectAlbumScreen.tsx'),'utf8');
const source=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const target='6cb2f513-8d6b-4ff7-8a04-000000000007';
function fixture({role='manager',reference=false}={}){
 const photo={id:'photo',company_id:'tenant',project_id:reference?'Intake':'source',album_project_id:'source',
  s3_key:'https://example.invalid/synthetic.jpg',file_type:'image',copied_at:reference?'fixture-date':null};
 const user={id:'actor',companyId:'tenant',role}; const route={key:'entry',params:{projectId:'source',projectName:'East Gate',ownerId:'actor',companyId:'tenant'}};
 let i=0,tree,active=true,client=true,expo,focused=true;
 const hooks=[],effects=[],requests=[];
 const effect=(fn,d)=>{const index=i++;const old=hooks[index];if(!old||d.some((v,j)=>v!==old.d[j])){const next={d,remove:old?.remove};hooks[index]=next;effects.push(()=>{next.remove?.();next.remove=fn();});}};
 const react={createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const j=i++;if(!(j in hooks))hooks[j]=typeof initial==='function'?initial():initial;return[hooks[j],v=>{hooks[j]=typeof v==='function'?v(hooks[j]):v}];},useRef(value){const j=i++;return hooks[j]??(hooks[j]={current:value});},useEffect:effect,useCallback(fn,d){const j=i++;const old=hooks[j];if(!old||d.some((value,k)=>old.d[k]!==value))hooks[j]={d,fn};return hooks[j].fn;}};
 const appState={currentState:'active',addEventListener:(type,fn)=>{expo=fn;return{remove(){expo=null;}}}};
 const module={exports:{}};
 new Function('require','module','exports',source)(name=>{
  if(name==='react')return react;
  if(name==='react-native')return new Proxy({StyleSheet:{create:styles=>styles},AppState:appState},{get:(o,k)=>o[k]??String(k)});
  if(name==='@react-navigation/native')return {useNavigation:()=>({}),useRoute:()=>route,useIsFocused:()=>focused,useFocusEffect:fn=>effect(()=>focused?fn():void 0,[focused,fn])};
  if(name==='../context/AuthContext')return{useAuth:()=>({user})};
  if(name==='../context/LanguageContext')return{useLang:()=>({t:key=>key})};
  if(name==='../utils/responsiveLayout')return{albumThumbnailSize:()=>50};
  if(name==='../components/AdaptiveModal')return{AdaptiveModal:'Modal'};
  if(name==='@expo/vector-icons')return{MaterialIcons:'Icon'};
  if(name==='../services/api')return{api:{projectPhotos:(project,actor,current,op='album')=>{
   let resolve;const promise=new Promise(done=>{resolve=done});requests.push({project,actor,current,op,resolve});return promise;
  }}};
  throw Error(name);
 },module,module.exports);
 const render=()=>{i=0;tree=module.exports.default();while(effects.length)effects.shift()();return tree;};
 const tick=async()=>{for(let x=0;x<10;x++)await Promise.resolve();render();};
 const visit=(n,out=[])=>{if(Array.isArray(n))n.forEach(child=>visit(child,out));else if(n&&typeof n==='object'){
  if(n.type==='Modal'&&!n.props.visible)return out;
  out.push(n);if(n.children!==undefined)visit(n.children,out);}return out;};
 const nodes=()=>visit(tree);
 const btn=text=>nodes().find(n=>n.type==='TouchableOpacity'&&n.children.some(c=>c?.children?.includes(text)));
 const send=(index,data)=>requests[index].resolve({data,isSessionCurrent:()=>client});
 async function load(){render();send(0,{success:true,photos:[photo]});await tick();}
 function open(){const list=nodes().find(n=>n.type==='FlatList');list.props.renderItem({item:list.props.data[0]}).props.onPress();render();}
 async function choose(){btn('Copy to another project').props.onPress();send(1,{success:true,projects:[{id:target,name:'Target Yard'}]});await tick();btn('Target Yard').props.onPress();render();}
 return{requests,render,tick,load,open,choose,btn,nodes,send,background(){active=false;expo('background');},replace(){client=false;},project:route.params};
}
test('manager must choose a destination, send explicit source and get exact authoritative copy receipt',async()=>{
 const f=fixture();await f.load();f.open();await f.choose();const old=f.btn('Copy photo reference').props.onPress;
 old();old();
 assert.equal(f.requests.length,3);
 assert.deepEqual(f.requests[2].op,{targetProjectId:target,photoId:'photo'});
 assert.equal(f.requests[2].project,'source');
 f.send(2,{success:true,reference:{id:'photo',source_project_id:'source',album_project_id:target,copied_at:'verified-fixture'}});
 await f.tick();assert.ok(JSON.stringify(f.nodes()).includes('Photo copied.'));old();assert.equal(f.requests.length,3);
});
test('background and replaced session immediately revoke a retained confirmation handler',async()=>{
 for(const invalidate of ['background','replace']){
  const f=fixture();await f.load();f.open();await f.choose();const send=f.btn('Copy photo reference').props.onPress;
  f[invalidate]();send();assert.equal(f.requests.length,2);
 }
});
test('copied reference remains visible with provenance and cannot masquerade as an original',async()=>{
 const f=fixture({reference:true});await f.load();f.open();
 assert.ok(JSON.stringify(f.nodes()).includes('Reference from another project.'));
 assert.equal(f.btn('Copy to another project'),undefined);
 const worker=fixture({role:'employee'});await worker.load();worker.open();
 assert.equal(worker.btn('Copy to another project'),undefined);
});
