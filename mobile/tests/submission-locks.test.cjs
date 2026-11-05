const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function handler(screen,name,context){
 const filename=path.join(__dirname,'../src/screens/'+screen+'Screen.tsx');
 const ast=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);
 assert.ok(expression,name);const code=ts.transpileModule('result = '+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 return vm.runInNewContext(code,context);
}
const t=(s,v={})=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]??'');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
test('kiosk rapid actions share a lock and release it after a failed request',async()=>{
 const wait=deferred();let posts=0,alerts=0;
 const c={t,actionLock:{current:false},pin:'1234',mode:'clock-in',projectId:'project',setWorking(){},setMessage(){},setPin(){},Vibration:{vibrate(){}},Alert:{alert(){alerts++}},api:{post:async()=>{posts++;await wait.promise;throw Error('offline');}}};
 const action=handler('Kiosk','handleAction',c);const first=action();await action();assert.equal(posts,1);wait.resolve();await first;assert.equal(c.actionLock.current,false);assert.equal(alerts,1);await action();assert.equal(posts,2);
});
test('store purchase blocks other plans and restore until store resolution; failure unlocks',async()=>{
 const wait=deferred();let purchases=0,restores=0;
 const product={id:'product',displayPrice:'$10',platform:'android',subscriptionOffers:[{offerTokenAndroid:'offer'}]};
 const c={t,purchaseLock:{current:false},storeReady:true,status:{},ACTIVE_STATUSES:new Set(['active','trialing','in_trial','grace_period']),billing:{canPurchase:true,googleAccountId:'account'},connected:true,productsByPlan:new Map([['team_10',product],['team_35',product]]),Platform:{OS:'android'},user:{id:'user'},setProcessingProductId(){},Alert:{alert(){}},friendlyError:String,requestPurchase:async()=>{purchases++;await wait.promise;throw Error('cancelled');},getAvailablePurchases:async()=>{restores++;}};
 const purchase=handler('Subscription','startPurchase',c),restore=handler('Subscription','restore',c);
 const first=purchase('team_10');await purchase('team_35');await restore();assert.equal(purchases,1);assert.equal(restores,0);wait.resolve();await first;assert.equal(c.purchaseLock.current,false);await restore();assert.equal(restores,1);
});
test('existing active, trial and grace subscriptions block duplicate subscriptions; expired subscription can recover',async()=>{
 let purchases=0;const product={id:'product',displayPrice:'$10',platform:'apple'};
 const c={t,purchaseLock:{current:false},storeReady:true,status:{},ACTIVE_STATUSES:new Set(['active','trialing','in_trial','grace_period']),billing:{canPurchase:true,googleAccountId:'account'},connected:true,productsByPlan:new Map([['team_10',product]]),Platform:{OS:'ios'},user:{id:'user'},setProcessingProductId(){},Alert:{alert(){}},friendlyError:String,requestPurchase:async()=>{purchases++;}};
 const action=handler('Subscription','startPurchase',c);
 for(const status of c.ACTIVE_STATUSES){c.status={status,provider:'apple',currentPeriodEnd:'2099-01-01'};await action('team_10');}
 assert.equal(purchases,0);c.status={status:'active',provider:'apple',currentPeriodEnd:'2000-01-01'};await action('team_10');assert.equal(purchases,1);
});
test('payroll request lock rejects overlapping actions, clears old preview and releases after failure',async()=>{
 const wait=deferred();let calls=0,result='old',notice='';
 const c={t,actionLock:{current:false},setBusy(){},setNotice:v=>notice=v,setResult:v=>result=v};
 const run=handler('PayrollRules','run',c);
 const first=run(async()=>{calls++;await wait.promise;throw Error('save failed');});
 await run(async()=>calls++);assert.equal(calls,1);assert.equal(result,null);
 wait.resolve();await first;assert.equal(notice,'save failed');assert.equal(c.actionLock.current,false);
 await run(async()=>calls++);assert.equal(calls,2);
});
test('payroll failed reload hides old editable data and preview',async()=>{
 const values={};const c={setResult:v=>values.result=v,setRules:v=>values.rules=v,setMetadata:v=>values.metadata=v,setHistory:v=>values.history=v,api:{get:async()=>{throw Error('offline');}}};
 const load=handler('PayrollRules','load',c);await assert.rejects(load(),/offline/);
 assert.equal(values.rules,null);assert.equal(values.metadata,null);assert.equal(values.result,null);assert.equal(values.history.length,0);
});
test('Lucy approval and rejection share a lock and allow retry after failure',async()=>{
 const wait=deferred();let posts=0;
 const c={approvalLock:{current:false},generation:{current:1},setApprovalBusy(){},current:()=>true,Alert:{alert(){}},t,api:{post:async()=>{posts++;await wait.promise;throw Error('offline');}}};
 const approve=handler('AIAssistant','handleApprove',c),reject=handler('AIAssistant','handleReject',c);
 const first=approve('id');await reject('id');assert.equal(posts,1);wait.resolve();await first;
 assert.equal(c.approvalLock.current,false);await reject('id');assert.equal(posts,2);
});
test('localized task actions preserve machine status values and navigation identifiers',async()=>{
 let payload,route;const context={t:()=> 'traduit',api:{patch:async(_path,body)=>{payload=body;}},setTasks(){},Alert:{alert(){}},setSelectedSchedule(){},navigation:{navigate:name=>{route=name;}}};
 await handler('Tasks','advance',context)({id:'task',status:'in_progress'});assert.equal(payload.status,'completed');
 await handler('Tasks','advance',context)({id:'task',status:'completed'});assert.equal(payload.status,'pending');
 handler('Home','handleScheduleSelect',context)({date:'2026-11-05'});assert.equal(route,'Schedule');
});
