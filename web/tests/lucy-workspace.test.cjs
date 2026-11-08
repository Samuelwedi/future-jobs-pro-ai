const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function handler(name,context){
 const source=fs.readFileSync(path.join(__dirname,'../src/components/LucyWorkspacePanel.tsx'),'utf8');
 const ast=ts.createSourceFile('panel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let found;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found=node.initializer;ts.forEachChild(node,visit);}visit(ast);assert.ok(found,name);
 const code=ts.transpileModule('const run = '+found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return vm.runInNewContext(code+'\nrun',context);
}
test('workspace mutation lock blocks duplicate taps and releases after a failed request',async()=>{
 let calls=0,reject;const errors=[];const lock={current:false};
 const run=handler('mutate',{lock,epoch:{current:1},reads:{current:0},current:()=>true,setBusy:()=>{},setLoading:()=>{},setError:e=>errors.push(e),setNotice:()=>{}});
 const work=()=>{calls++;return new Promise((_,r)=>reject=r);};const first=run(work);await run(work);assert.equal(calls,1);reject(new Error('Not confirmed'));await first;assert.equal(lock.current,false);assert.ok(errors.includes('Not confirmed'));
});
test('late mutation from old view cannot release a newer view lock',async()=>{
 let resolve;const lock={current:false},epoch={current:1};
 const run=handler('mutate',{lock,epoch,reads:{current:0},current:g=>g===epoch.current,setBusy:()=>{},setLoading:()=>{},setError:()=>{},setNotice:()=>{}});
 const first=run(()=>new Promise(r=>resolve=r));epoch.current=2;lock.current=true;resolve();await first;assert.equal(lock.current,true);
});
test('unchanged background prompt reuses request key after uncertain failure',async()=>{
 const pending={current:null};let ids=0,calls=0;const keys=[];
 const run=handler('start',{mutate:fn=>fn(),prompt:' Investigate North ',enabled:true,isSample:false,epoch:{current:1},current:()=>true,pending,crypto:{randomUUID:()=>`key-${++ids}`},client:{post:async(_path,body)=>{keys.push(body.requestKey);if(calls++===0)throw new Error('Lost response');return {job:{id:'job'}};}},setJobs:()=>{},setPrompt:()=>{},setNotice:()=>{}});
 await assert.rejects(run(),/Lost response/);await run();assert.deepEqual(keys,['key-1','key-1']);assert.equal(pending.current,null);
});
test('editing a pending prompt invalidates its idempotency key but locked edits do not',()=>{
 const pending={current:{prompt:'North',requestKey:'same'}},lock={current:false};let value='North';
 const run=handler('changePrompt',{lock,pending,setPrompt:next=>value=next});run('South');assert.equal(pending.current,null);assert.equal(value,'South');lock.current=true;run('West');assert.equal(value,'South');
});
test('late refresh cannot replace state after a mutation invalidated the read',async()=>{
 let release;const reads={current:0};let updates=0;
 const promise=new Promise(r=>release=r);
 const run=handler('refresh',{lock:{current:false},current:()=>true,refreshing:{current:null},reads,setLoading:()=>{},client:{get:()=>promise},setJobs:()=>updates++,setEnabled:()=>updates++,setPreferences:()=>updates++,setError:()=>updates++});
 const refresh=run(1);reads.current++;release({jobs:[],enabled:true,preferences:[],options:{}});await refresh;assert.equal(updates,0);
});
test('slow workspace reads are single-flight and settle initial loading',async()=>{
 let release,calls=0,updates=0;const loading=[],refreshing={current:null};const promise=new Promise(r=>release=r);
 const run=handler('refresh',{lock:{current:false},current:()=>true,refreshing,reads:{current:0},setLoading:value=>loading.push(value),client:{get:()=>{calls++;return promise;}},setJobs:()=>updates++,setEnabled:()=>updates++,setPreferences:()=>updates++,setError:()=>{}});
 const first=run(1,true);await run(1);await run(1);assert.equal(calls,2);release({jobs:[],enabled:true,preferences:[],options:{}});await first;assert.equal(updates,3);assert.equal(refreshing.current,null);assert.equal(loading.at(-1),false);
});
