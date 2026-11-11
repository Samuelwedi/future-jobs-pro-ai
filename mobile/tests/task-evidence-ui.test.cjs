const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/components/TaskEvidence.tsx'),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function fixture(storage=new Map()){
 const slots=[],effects=[];let cursor=0,dead=false,tree;
 const f={active:true,revision:0,posts:[],reads:[],picks:[],storage};
 const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,v=>{assert.equal(dead,false,'no state updates after unmount');slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++;if(!slots[i]){slots[i]={deps};effects.push(()=>slots[i].cleanup=fn());}}};
 const api={captureAttachmentSession:async()=>({revision:f.revision}),assertAttachmentSession:s=>{if(s.revision!==f.revision)throw Error('Account changed');},taskEvidence:async(s,id,current,data,beforeDispatch)=>{api.assertAttachmentSession(s);assert.equal(current(),true);if(beforeDispatch)await beforeDispatch();const d=deferred();(data?f.posts:f.reads).push({...d,data});return d.promise;}};
 const context={exports:{},console,require:name=>{
  if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='react-native')return new Proxy({},{get:(_,key)=>key});
  if(name==='@react-native-async-storage/async-storage')return {default:{getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)}};
  if(name==='expo-document-picker')return {getDocumentAsync:()=>{const d=deferred();f.picks.push(d);return d.promise;}};
  if(name==='../services/api')return {api,createEvidenceRequestKey:()=>`request-key-${f.posts.length}-123456`};
  if(name==='./MediaAttachment')return {default:'MediaAttachment'};
  if(name==='../context/LanguageContext')return {useLang:()=>({t:x=>x})};throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 f.render=()=>{if(dead)return;cursor=0;tree=context.exports.default({taskId:'task',ownerId:'owner',companyId:'company',isCurrent:()=>f.active});effects.splice(0).forEach(fn=>fn());};
 f.nodes=type=>{const nodes=[];function visit(n){if(!n||typeof n!=='object')return;if(n.type===type)nodes.push(n);const kids=n.props?.children;(Array.isArray(kids)?kids.flat():[kids]).forEach(visit);}visit(tree);return nodes;};
 f.button=label=>f.nodes('TouchableOpacity').find(n=>n.props.children?.props?.children===label)?.props;
 f.text=()=>f.nodes('Text').map(n=>n.props.children).join(' ');
 f.flush=async()=>{await new Promise(setImmediate);f.render();};
 f.ready=async()=>{await f.flush();f.reads.at(-1).resolve({evidence:[]});await f.flush();};
 f.note=text=>{f.nodes('TextInput')[0].props.onChangeText(text);f.render();};
 f.unmount=()=>{slots.forEach(s=>s?.cleanup?.());dead=true;};f.render();return f;
}
test('double save sends once and persists request identity before dispatch',async()=>{const f=fixture();await f.ready();f.note('Supplies');const save=f.button('Save receipt or note').onPress;save();save();await f.flush();assert.equal(f.posts.length,1);assert.equal([...f.storage.values()][0],f.posts[0].data.requestKey);f.posts[0].reject(Error('connection lost'));await f.flush();assert.match(f.text(),/awaiting confirmation/);assert.equal(f.button('Save receipt or note'),undefined);});
test('restart checks pending upload read-only and matching completed evidence clears it',async()=>{const storage=new Map([['task-evidence-pending-v1:["owner","company","task"]','known-request-key']]);const f=fixture(storage);await f.ready();assert.equal(f.posts.length,0);assert.match(f.text(),/awaiting confirmation/);f.button('Check save status').onPress();await f.flush();f.reads.at(-1).resolve({evidence:[{id:'e',request_key:'known-request-key',note:'Saved'}]});await f.flush();assert.equal(storage.size,0);assert.ok(f.button('Save receipt or note'));assert.match(f.text(),/Saved/);});
test('picker cancel preserves note; close or account change fences late picker completion',async()=>{for(const outcome of ['cancel','close','revision','unmount']){const f=fixture();await f.ready();f.note('Draft');f.button('Choose receipt (PDF or photo)').onPress();await f.flush();if(outcome==='close')f.active=false;if(outcome==='revision')f.revision++;if(outcome==='unmount')f.unmount();f.picks[0].resolve(outcome==='cancel'?{canceled:true}:{canceled:false,assets:[{uri:'file:///receipt.pdf',name:'receipt.pdf',size:100}]});await f.flush();assert.equal(f.posts.length,0);if(outcome==='cancel')assert.equal(f.nodes('TextInput')[0].props.value,'Draft');else assert.doesNotMatch(f.text(),/receipt.pdf/);}});
test('late save success after closing does not clear pending identity or reload old data',async()=>{const f=fixture();await f.ready();f.note('Supplies');f.button('Save receipt or note').onPress();await f.flush();f.active=false;f.unmount();f.posts[0].resolve({state:'completed',evidence:{request_key:f.posts[0].data.requestKey}});await f.flush();assert.equal(f.storage.size,1);assert.equal(f.reads.length,1);});
test('definite pre-admission rejection releases pending guard, ambiguous failures retain it',async()=>{for(const status of [400,403,500]){const f=fixture();await f.ready();f.note('Supplies');f.button('Save receipt or note').onPress();await f.flush();f.posts[0].reject({response:{status,data:{retryAllowed:status!==500,message:'Not saved'}}});await f.flush();assert.equal(f.storage.size,status===500?1:0);}});
