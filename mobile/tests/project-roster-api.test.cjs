const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const owner={id:'owner',companyId:'company',role:'manager'};
function setup(){
 let interceptor;
 const f={sent:[], read:async()=>JSON.stringify(owner), beforeDispatch:()=>{}, afterDispatch:()=>({data:{success:true}})};
 const send=async (method,url,config)=>{f.beforeDispatch();await interceptor(config);f.sent.push({method,url,config});return f.afterDispatch();};
 const client={interceptors:{request:{use:fn=>interceptor=fn},response:{use:()=>{}}},
  get:(url,c)=>send('get',url,c),request:c=>send(c.method,c.url,c)};
 const c={exports:{},__DEV__:false,process:{env:{}},console,require:name=>{
  if(name==='axios')return {default:{create:()=>client}};
  if(name==='expo-secure-store')return {getItemAsync:()=>f.read()};
  if(name==='react-native')return {Platform:{OS:'ios'}};
  if(['./offlineService','../utils/uploadMetadata','expo-file-system/legacy'].includes(name))return {};
  throw Error(name);
 }};
 vm.runInNewContext(source,c);f.api=c.exports.api;f.api.token='token';return f;
}
test('roster sends a scoped read and idempotent member-specific add/remove without generic offline queue',async()=>{
 const f=setup();
 for (const change of [undefined,{userId:'worker /',assigned:true},{userId:'worker /',assigned:false}]) {
  assert.equal((await f.api.projectRoster('a/b',owner,()=>true,change)).success,true);
 }
 assert.deepEqual(f.sent.map(x=>[x.method,x.url]),[
  ['get','/projects/a%2Fb/roster'],['put','/projects/a%2Fb/roster/worker%20%2F'],['delete','/projects/a%2Fb/roster/worker%20%2F']
 ]);
 for(const x of f.sent){
  assert.equal(x.config.headers.Authorization,'Bearer token');
  assert.equal(x.config.headers['X-Project-Actor'],owner.id);
  assert.equal(x.config.headers['X-Project-Company'],owner.companyId);
  assert.equal(x.config.fenceUnauthorizedToCurrent,true);
 }
});
test('account and view fences apply after storage, before dispatch, and after response',async()=>{
 for(const stage of ['storage','dispatch','result'])for(const change of ['token','revision','view']){
  const f=setup(); let current=true;
  const mutate=()=>{if(change==='token')f.api.token='changed';else if(change==='revision')f.api.authRevision++;else current=false;};
  if(stage==='storage')f.read=async()=>{mutate();return JSON.stringify(owner);};
  if(stage==='dispatch')f.beforeDispatch=mutate;
  if(stage==='result')f.afterDispatch=()=>{mutate();return {data:{success:true}};};
  await assert.rejects(f.api.projectRoster('project',owner,()=>current,{userId:'person',assigned:true}),/changed/i);
  assert.equal(f.sent.length,stage==='result'?1:0);
 }
});
test('changing stored tenant or role prevents mutation from stale screen',async()=>{
 for(const changed of [{id:'replacement'},{companyId:'replacement'},{role:'worker'}]){
  const f=setup();f.read=async()=>JSON.stringify({...owner,...changed});
  await assert.rejects(f.api.projectRoster('project',owner,()=>true,{userId:'person',assigned:true}),/changed/i);
  assert.equal(f.sent.length,0);
 }
});

const modalSource=fs.readFileSync(path.join(__dirname,'../src/components/ProjectRosterModal.tsx'),'utf8');
const ast=ts.createSourceFile('modal.tsx',modalSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function modalFixture(){
 let handler;
 function walk(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='refresh')handler=node;ts.forEachChild(node,walk);}
 walk(ast);
 const c={active:{current:true},busy:{current:false},generation:{current:0},project:{id:'project'},owner,
  setMembers:v=>{c.members=v;},setPending:v=>{c.pending=v;},setFailed:v=>{c.error=v;},calls:[],session:true,Error,
  api:{captureSessionGuard:()=>()=>c.session,projectRoster:async(...args)=>{c.calls.push(args);return c.reply(args);}},
  reply:async args=>args[3]?{success:true,assigned:args[3].assigned}:{success:true,members:[{id:'person',name:'Avery',role:'employee',assigned:true}]},
 };
 const js=ts.transpileModule(handler.getText(ast)+'\nrefresh;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return {...c,c,refresh:vm.runInNewContext(js,c)};
}
test('the project-team screen changes one member, then displays confirmed data instead of optimistic state',async()=>{
 const {c,refresh}=modalFixture();
 let release;
 const original=c.reply;c.reply=async args=>{if(args[3])await new Promise(resolve=>release=resolve);return original(args);};
 const first=refresh({userId:'person',assigned:true});
 await refresh({userId:'person',assigned:false});
 assert.equal(c.calls.length,1);assert.equal(c.pending,true);assert.equal(c.members,undefined);
 release();await first;
 assert.equal(c.calls.length,2);assert.equal(c.calls[1][3],undefined);assert.equal(c.members[0].assigned,true);assert.equal(c.pending,false);
});
test('an ambiguous write requires a fresh read and a replaced screen ignores completion',async()=>{
 const initial=modalFixture(), c=initial.c;
 const original=c.reply;c.reply=async args=>{if(args[3])throw Error('lost acknowledgment');return original(args);};
 await initial.refresh({userId:'person',assigned:true});
 assert.equal(c.error,true);assert.equal(c.members.length,0);assert.equal(c.calls.length,1);
 await initial.refresh();assert.equal(c.calls.length,2);assert.equal(c.calls[1][3],undefined);assert.equal(c.members[0].assigned,true);assert.equal(c.error,false);
 const stale=modalFixture();stale.c.reply=async args=>{stale.c.generation.current++;return original(args);};
 await stale.refresh({userId:'person',assigned:true});
 assert.equal(stale.c.calls.length,1);assert.equal(stale.c.members,undefined);
});
