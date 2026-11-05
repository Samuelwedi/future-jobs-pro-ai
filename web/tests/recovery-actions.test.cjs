const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function handler(file,name,context){
 const source=fs.readFileSync(path.join(__dirname,'../src/pages',file),'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let found;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found=node.initializer;ts.forEachChild(node,visit);}visit(ast);
 assert.ok(found);const compiled=ts.transpileModule(`const run = ${found.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 return vm.runInNewContext(compiled+'\nrun',context);
}
for(const mode of ['verify','billing'])test(`${mode} ignores overlapping requests and permits retry after failure`,async()=>{
 let calls=0,rejectRequest;const errors=[];const lock={current:false};
 const context={requestLock:lock,token:'test-token',done:false,access:{canManageBilling:true,complimentary:false},API_BASE:'https://example.test',localStorage:{getItem:()=> 'session'},window:{location:{assign:()=>{}}},setBusy:()=>{},setWorking:()=>{},setDone:()=>{},setError:e=>errors.push(e),fetch:()=>{calls++;return new Promise((_,reject)=>{rejectRequest=reject;});}};
 const run=handler(mode==='verify'?'VerifyEmail.tsx':'PaymentRequired.tsx',mode==='verify'?'verify':'manageBilling',context);
 const first=run();await run();assert.equal(calls,1);rejectRequest(new Error('temporary outage'));await first;assert.equal(lock.current,false);assert.ok(errors.includes('temporary outage'));
 const retry=run();assert.equal(calls,2);rejectRequest(new Error('retry outage'));await retry;
});
test('billing recovery does not request a portal without permission or for complimentary access',async()=>{
 for(const access of [null,{canManageBilling:false},{canManageBilling:true,complimentary:true}]){
 let calls=0;const run=handler('PaymentRequired.tsx','manageBilling',{requestLock:{current:false},access,fetch:()=>{calls++;}});await run();assert.equal(calls,0);
 }
});
test('email confirmation ignores incomplete links and already completed verification',async()=>{
 for(const state of [{token:'',done:false},{token:'test',done:true}]){
 const lock={current:false};const run=handler('VerifyEmail.tsx','verify',{requestLock:lock,...state});await run();assert.equal(lock.current,false);
 }
});
