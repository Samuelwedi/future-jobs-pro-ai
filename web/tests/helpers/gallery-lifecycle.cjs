const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
function fixture(){
 const actor={projectId:'A',yearMonth:'2026-11',mediaType:'photo',id:'owner-A',company:'company-A',role:'employee',token:'token-A'};
 const listeners=new Map(),dl=new Map();const events=map=>({addEventListener:(k,f)=>{if(!map.has(k))map.set(k,new Set());map.get(k).add(f)},removeEventListener:(k,f)=>map.get(k)?.delete(f),dispatchEvent:e=>{for(const f of [...map.get(e.type)||[]])f(e)}});
 const window={...events(listeners),location:{origin:'https://fixture.invalid',pathname:'/A',search:'',hash:''},history:{state:{key:'entry-A'}},setTimeout:()=>0};
 const document={...events(dl),visibilityState:'visible'};const storage=new Map();const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const store=()=>{storage.set('token',actor.token);storage.set('user',JSON.stringify({id:actor.id,companyId:actor.company,role:actor.role}));};store();
 const auth={exports:{}};new Function('exports','localStorage','window','Event','CustomEvent',compile('src/services/authSession.ts'))(auth.exports,localStorage,window,class{constructor(type){this.type=type}},class{constructor(type,details){this.type=type;Object.assign(this,details)}});
 let slot=0,tree;const hooks=[],layouts=[],effects=[],requests=[],downloads=[],audios=[];
 const effect=(queue,fn,deps)=>{const i=slot++;const prev=hooks[i];if(!prev||deps.some((v,j)=>v!==prev.deps[j])){const next={deps,cleanup:prev?.cleanup,fn};hooks[i]=next;queue.push(()=>{next.cleanup?.();next.cleanup=fn();});}};
 const react={createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const i=slot++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];},useRef(initial){const i=slot++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},useEffect:(fn,d)=>effect(effects,fn,d),useLayoutEffect:(fn,d)=>effect(layouts,fn,d)};
 class Audio{constructor(url){this.url=url;this.pauses=0;this.loads=0;this.playGate=deferred();audios.push(this)}play(){return this.playGate.promise}pause(){this.pauses++}removeAttribute(){this.url=''}load(){this.loads++}}
 const module={exports:{}};
 new Function('require','module','exports','localStorage','fetch','window','document','Audio','AbortController',compile('src/pages/MonthMediaType.tsx'))(name=>{
  if(name==='react')return react;if(name.startsWith('@mui/'))return new Proxy({}, {get:(_,k)=>String(k)});
  if(name==='react-router-dom')return{useNavigate:()=>()=>{},useParams:()=>actor,useLocation:()=>({...window.location,key:window.history.state.key,state:{projectName:actor.projectId}})};
  if(name==='../services/api')return{API_BASE:'https://fixture.invalid'};
  if(name==='../services/authSession')return auth.exports;
  if(name==='../utils/photoRecordProvenance')return{photoRecordProvenanceLines:item=>['Record '+item.id]};
  if(name==='../services/mediaDownload')return{downloadMedia:(item,current)=>{const gate=deferred();downloads.push({item,current,...gate});return gate.promise}};
  assert.fail('Unexpected import '+name);
 },module,module.exports,localStorage,(url,options)=>{const gate=deferred();requests.push({url,options,...gate});return gate.promise},window,document,Audio,AbortController);
 const render=()=>{slot=0;tree=module.exports.default();return tree};const flush=q=>{while(q.length)q.shift()()};
 const nodes=(n=tree,out=[])=>{if(Array.isArray(n))n.forEach(v=>{if(v!==undefined)nodes(v,out)});else if(n&&typeof n==='object'){if(n.type==='Dialog'&&!n.props.open)return out;out.push(n);if(n.children!==undefined)nodes(n.children,out)}return out};
 const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
 const row=(id,type=actor.mediaType)=>({id,type,url:'https://res.cloudinary.com/test/'+id+'.jpg',taken_at:'2020-01-01T00:00:00Z',transcript:'private-'+id});
 const resolve=async(i,id)=>{requests[i].resolve({ok:true,json:async()=>({media:[row(id)]})});await tick();render()};
 const layout=()=>flush(layouts),passive=()=>flush(effects),settle=()=>{layout();passive()};
 const route=p=>{actor.projectId=p;window.location.pathname='/'+p;window.history.state.key='entry-'+p;};
 const announce=()=>{store();window.dispatchEvent({type:'auth-session-changed'})};
 const unmount=()=>{for(const h of hooks)if(h?.cleanup){h.cleanup();h.cleanup=undefined}};
 return{actor,window,document,storage,auth:auth.exports,render,layout,passive,settle,nodes,requests,downloads,audios,tick,row,resolve,route,announce,store,unmount,
 images:()=>nodes().filter(n=>n.type==='img').map(n=>n.props.src),find:label=>nodes().find(n=>n.props['aria-label']===label),
 async loaded(id='private-A'){render();settle();await resolve(0,id);layout();},
 replaySetup(){for(const h of hooks)if(h?.fn){h.cleanup?.();h.cleanup=h.fn();}}};
}
module.exports={fixture,deferred};
