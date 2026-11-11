const {test}=require('node:test'),assert=require('node:assert/strict');
const provider=require('../dist/services/lucyBackgroundProvider');
const now=Date.parse('2026-11-08T12:00:00.000Z');
const grant={id:'explicit-offline',model:'gpt-6.1-sol',maxUsd:'5.00',approvedAt:'2026-11-08T11:00:00.000Z',expiresAt:'2026-11-09T11:00:00.000Z'};
const valid={LUCY_BACKGROUND_WORK_ENABLED:'true',LUCY_BACKGROUND_PROVIDER:'self_hosted',LUCY_BACKGROUND_LLM_BASE_URL:'http://127.0.0.1:11434/v1',LUCY_BACKGROUND_LLM_MODEL:'qwen3:8b'};
test('background selection is explicit, fail-closed, isolated from synchronous and legacy fallback settings',()=>{
 const legacy={LUCY_BACKGROUND_WORK_ENABLED:'true',OPENAI_API_KEY:'present',LUCY_LLM_BASE_URL:'https://legacy.example/v1',LUCY_LLM_MODEL:'legacy',LUCY_ALLOW_PAID_FALLBACK:'true',LUCY_BACKGROUND_BUDGET_GRANT:JSON.stringify(grant)};
 assert.equal(provider.readLucyBackgroundSelection(legacy),null);
 for(const p of [undefined,'','automatic','OPENAI','self-hosted','openai '])assert.equal(provider.readLucyBackgroundSelection({...valid,LUCY_BACKGROUND_PROVIDER:p}),null);
 assert.equal(provider.readLucyBackgroundSelection({...valid,LUCY_BACKGROUND_WORK_ENABLED:'false'}),null);
 const selection=provider.readLucyBackgroundSelection({...legacy,...valid});assert.equal(selection.provider,'self_hosted');assert.equal(selection.model,'qwen3:8b');assert.equal(selection.apiKey,'local-no-key');assert.ok(Object.isFrozen(selection));
});
test('compatible configuration rejects malformed, credential-bearing, unsafe and direct OpenAI destinations',()=>{
 for(const url of ['', 'not a URL','ftp://host/v1','http://public.example/v1','https://user:pass@example.com/v1','https://example.com/v1?secret=x','https://example.com/v1#secret','https://api.openai.com/v1','https://api.openai.com./v1','https://api.openai.com\n/v1',' https://example.com/v1','https://example.com\\v1'])assert.equal(provider.readLucyBackgroundSelection({...valid,LUCY_BACKGROUND_LLM_BASE_URL:url}),null,url);
 for(const model of ['', 'local model','x'.repeat(201),'../secret','qwen\nsecret'])assert.equal(provider.readLucyBackgroundSelection({...valid,LUCY_BACKGROUND_LLM_MODEL:model}),null);
 for(const apiKey of ['', 'secret\nheader','x'.repeat(4097)])assert.equal(provider.readLucyBackgroundSelection({...valid,LUCY_BACKGROUND_LLM_API_KEY:apiKey}),null);
 for(const url of ['http://localhost:11434/v1','http://[::1]:11434/v1','http://lucy.railway.internal:8000/v1','https://approved.example/prefix/v1/'])assert.ok(provider.readLucyBackgroundSelection({...valid,LUCY_BACKGROUND_LLM_BASE_URL:url}),url);
});
test('optional OpenAI mode still requires a valid grant and credentials and never inherits alternate endpoints',()=>{
 const clock=Date.now;Date.now=()=>now;try{
  const paid={...valid,LUCY_BACKGROUND_PROVIDER:'openai',OPENAI_API_KEY:'offline-only',LUCY_BACKGROUND_BUDGET_GRANT:JSON.stringify(grant),OPENAI_BASE_URL:'https://wrong.example'};
  const selection=provider.readLucyBackgroundSelection(paid);assert.equal(selection.baseURL,'https://api.openai.com/v1');assert.equal(selection.model,grant.model);
  for(const change of [{OPENAI_API_KEY:''},{LUCY_BACKGROUND_BUDGET_GRANT:''},{LUCY_BACKGROUND_WORK_ENABLED:'false'}])assert.equal(provider.readLucyBackgroundSelection({...paid,...change}),null);
 }finally{Date.now=clock;}
});
test('selection identity binds endpoint, model, credential, provider, grant and kill switch without public secret leakage',()=>{
 const saved={...process.env};const clock=Date.now;Date.now=()=>now;
 try{
  Object.assign(process.env,valid,{LUCY_BACKGROUND_LLM_API_KEY:'private-secret',OPENAI_API_KEY:'paid-secret',LUCY_BACKGROUND_BUDGET_GRANT:JSON.stringify(grant)});
  const selected=provider.readLucyBackgroundSelection();assert.equal(provider.sameLucyBackgroundSelection(selected),true);
  assert.deepEqual(provider.lucyBackgroundCapability(),{configured:true,provider:'self_hosted',automaticPaidFallback:false});
  assert.doesNotMatch(JSON.stringify(provider.lucyBackgroundCapability()),/qwen|127|secret|fingerprint|grant/);
  for(const change of [{LUCY_BACKGROUND_LLM_MODEL:'different'},{LUCY_BACKGROUND_LLM_BASE_URL:'https://different.example/v1'},{LUCY_BACKGROUND_LLM_API_KEY:'replacement'},{LUCY_BACKGROUND_PROVIDER:'openai'},{LUCY_BACKGROUND_WORK_ENABLED:'false'}]){
   Object.assign(process.env,valid,{LUCY_BACKGROUND_LLM_API_KEY:'private-secret'},change);assert.equal(provider.sameLucyBackgroundSelection(selected),false);
  }
  assert.deepEqual(provider.lucyBackgroundCapability(),{configured:false,provider:null,automaticPaidFallback:false});
 }finally{process.env=saved;Date.now=clock;}
});
test('missing provider prevents queue submission and leaves both model-free work modes independently available',async()=>{
 const saved={...process.env};try{
  Object.assign(process.env,valid);delete process.env.LUCY_BACKGROUND_PROVIDER;
  const work=require('../dist/services/lucyWorkService');assert.equal(work.lucyWorkEnabled(),false);assert.equal(work.lucyWorkModes().record_search,true);assert.equal(work.lucyWorkModes().work_briefing,true);
  await assert.rejects(()=>work.createLucyWork({id:'unqueried',company_id:'unqueried',role:'owner'},'Test','offline'),e=>e.status===503);
  Object.assign(process.env,valid);assert.equal(work.lucyWorkEnabled(),true);
 }finally{process.env=saved;}
});
