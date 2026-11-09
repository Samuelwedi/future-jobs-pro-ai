const {test}=require('node:test');const assert=require('node:assert/strict');
const budget=require('../dist/services/lucyBackgroundBudget');
const {snapshotLucyResearch}=require('../dist/services/lucyBudgetedInference');
const now=Date.parse('2026-11-08T12:00:00.000Z');
const grant={id:'approved-pilot',model:'gpt-6.1-sol',maxUsd:'5.00',approvedAt:'2026-11-08T11:00:00.000Z',expiresAt:'2026-11-09T11:00:00.000Z'};
const env=value=>({LUCY_BACKGROUND_WORK_ENABLED:'true',LUCY_BACKGROUND_BUDGET_GRANT:JSON.stringify(value)});
test('funding is absent by default; every missing, invalid, unlimited or stale grant fails closed',()=>{
 assert.equal(budget.readLucyBudgetGrant({},now),null);assert.equal(budget.readLucyBudgetGrant({...env(grant),LUCY_BACKGROUND_WORK_ENABLED:'false'},now),null);
 for(const change of [{id:''},{model:'gpt-5'},{model:['gpt-6.1-sol']},{model:'__proto__'},{maxUsd:5},{maxUsd:'NaN'},{maxUsd:'Infinity'},{maxUsd:'1e3'},{maxUsd:'-1.00'},{maxUsd:'1000.01'},{maxUsd:'0.00'},{maxUsd:'01.00'},{maxUsd:'1.001'},{extra:true},{approvedAt:'2026-11-09T11:00:00.000Z'},{expiresAt:'2026-11-08T11:00:00.000Z'},{expiresAt:'2026-11-20T11:00:00.000Z'},{approvedAt:'2026-11-31T11:00:00.000Z'},{approvedAt:null}])assert.equal(budget.readLucyBudgetGrant(env({...grant,...change}),now),null,JSON.stringify(change));
 for(const value of [null,[],{},true])assert.equal(budget.readLucyBudgetGrant(env(value),now),null);
 assert.equal(budget.readLucyBudgetGrant({LUCY_BACKGROUND_WORK_ENABLED:'true',LUCY_BACKGROUND_BUDGET_GRANT:'not-json'},now),null);
 assert.equal(budget.readLucyBudgetGrant(env({...grant,approvedAt:'2026-12-07T00:00:00.000Z',expiresAt:'2026-12-09T00:00:00.000Z'}),Date.parse('2026-12-07T01:00:00.000Z')),null);
});
test('money is exact, grants are immutable fingerprints, and full-call reservation includes cache and region headroom',()=>{
 const a=budget.readLucyBudgetGrant(env(grant),now);assert.equal(a.maximum,5000000000n);assert.equal(budget.lucyReservationCost(a,20000),155056000n);
 const b=budget.readLucyBudgetGrant(env({...grant,model:'gpt-6-astra'}),now);assert.equal(budget.lucyReservationCost(b,20000),775280000n);
 for(const input of [-1,0.5,NaN,Infinity,20001,'100'])assert.throws(()=>budget.lucyReservationCost(a,input),budget.LucyBudgetError);
 for(const field of [{maxUsd:'6.00'},{expiresAt:'2026-11-10T11:00:00.000Z'},{model:'gpt-6-astra'}])assert.notEqual(budget.readLucyBudgetGrant(env({...grant,...field}),now).fingerprint,a.fingerprint);
});
test('immutable full context preserves phase/reasoning/tool outputs and denies hosted tools and references',()=>{
 const request={instructions:'Rules',input:[{role:'user',content:'Question'},{type:'reasoning',id:'r',summary:[],encrypted_content:'opaque'},{type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'Checking',annotations:[]}]},{type:'function_call',call_id:'c',name:'tasks',arguments:'{}'},{type:'function_call_output',call_id:'c',output:'{}'}],tools:[{type:'function',name:'tasks',description:'List tasks',parameters:{type:'object',properties:{}},strict:false}]};
 const snapshot=snapshotLucyResearch(request,'gpt-6.1-sol');request.input[0].content='Changed';assert.equal(snapshot.input[0].content,'Question');assert.equal(snapshot.input[2].phase,'commentary');assert.equal(snapshot.input[1].encrypted_content,'opaque');assert.ok(Object.isFrozen(snapshot.input[2].content));
 for(const input of [[{type:'item_reference',id:'remote'}],[{role:'user',content:[{type:'input_image',image_url:'https://example.com'}]}],[{type:'computer_call',id:'x'}]])assert.throws(()=>snapshotLucyResearch({...request,input},'gpt-6.1-sol'));
 assert.throws(()=>snapshotLucyResearch({...request,tools:[{type:'web_search'}]},'gpt-6.1-sol'));
 assert.throws(()=>snapshotLucyResearch({...request,instructions:'x'.repeat(256001)},'gpt-6.1-sol'));
});
test('flag alone cannot create an unfunded background job while local modes remain usable',async()=>{
 const saved={...process.env};try{process.env.LUCY_BACKGROUND_WORK_ENABLED='true';delete process.env.LUCY_BACKGROUND_BUDGET_GRANT;
 const work=require('../dist/services/lucyWorkService');assert.throws(()=>work.parseLucyWorkRequest({prompt:'Research',requestKey:'untrusted',budget:grant}),e=>e.status===400);assert.equal(work.lucyWorkEnabled(),false);assert.equal(work.lucyWorkModes().record_search,true);assert.equal(work.lucyWorkModes().work_briefing,true);
 await assert.rejects(()=>work.createLucyWork({id:'x',company_id:'x',role:'boss'},'Research','no-funding'),e=>e.status===503);
 }finally{process.env=saved;}
});
