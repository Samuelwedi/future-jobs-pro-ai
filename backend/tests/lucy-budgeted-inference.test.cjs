const {test}=require('node:test');const assert=require('node:assert/strict');
const Module=require('node:module');const originalLoad=Module._load;
const budget=require('../dist/services/lucyBackgroundBudget');
let options,events,counted,created,hook,createHook,countValue=30,response,reserveFail=false,durableActive=true;
class OfflineOpenAI{
 constructor(value){options=value;this.responses={inputTokens:{count:async payload=>{events.push('count');counted=payload;await hook?.();return{object:'response.input_tokens',input_tokens:countValue};}},create:async(payload,requestOptions)=>{events.push('create');created={payload,requestOptions};await createHook?.();return response;}};}
}
Module._load=function(name,...args){return name==='openai'?OfflineOpenAI:originalLoad.call(this,name,...args);};
const {lucyBudgetedResponse}=require('../dist/services/lucyBudgetedInference');Module._load=originalLoad;
const originalReserve=budget.reserveLucyBudget,originalFinish=budget.finishLucyReservation;
budget.reserveLucyBudget=async(grant,input)=>{events.push('reserve');assert.equal(input,20000);if(reserveFail)throw new Error('Database unavailable');return 'reservation';};
budget.lucyReservationActive=async()=>durableActive;
budget.finishLucyReservation=async(grant,id,outcome,usage)=>{events.push({outcome,usage});};
const request={instructions:'Rules',input:[{role:'user',content:'Find assigned tasks'}],tools:[{type:'function',name:'tasks',description:'Tasks',parameters:{type:'object',properties:{}}}]};
const now=Date.parse('2026-11-08T12:00:00.000Z');
const grant={id:'offline-only',model:'gpt-6.1-sol',maxUsd:'5.00',approvedAt:'2026-11-08T11:00:00.000Z',expiresAt:'2026-11-09T11:00:00.000Z'};
async function fixture(fn){
 const env={...process.env},clock=Date.now,fetch=global.fetch;Date.now=()=>now;global.fetch=()=>{throw new Error('Network forbidden in offline fixture');};
 process.env.LUCY_BACKGROUND_WORK_ENABLED='true';process.env.LUCY_BACKGROUND_PROVIDER='openai';process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify(grant);process.env.OPENAI_API_KEY='offline-test-no-key';process.env.OPENAI_BASE_URL='https://untrusted.example';process.env.LUCY_LLM_BASE_URL='https://alternate.example';process.env.LUCY_LLM_MODEL='alternate';process.env.LUCY_ALLOW_PAID_FALLBACK='true';
 events=[];options=undefined;counted=undefined;created=undefined;hook=undefined;createHook=undefined;countValue=30;reserveFail=false;durableActive=true;
 response={model:grant.model,service_tier:'default',status:'completed',output:[],output_text:'Done',usage:{input_tokens:30,output_tokens:10,total_tokens:40}};
 try{await fn();}finally{process.env=env;Date.now=clock;global.fetch=fetch;}
}
test('reserves before network; pins official endpoint, exact counted payload, standard tier and zero retries',()=>fixture(async()=>{
 const result=await lucyBudgetedResponse(request,async()=>true);assert.equal(result,response);assert.deepEqual(events.slice(0,3),['reserve','count','create']);
 assert.equal(options.logLevel,'off');assert.equal(options.adminAPIKey,null);assert.equal(options.baseURL,'https://api.openai.com/v1');assert.equal(options.maxRetries,0);assert.equal(options.timeout,20000);
 const {max_output_tokens,service_tier,store,include,background,stream,...context}=created.payload;assert.deepEqual(include,['reasoning.encrypted_content']);assert.deepEqual(context,counted);assert.equal(max_output_tokens,4096);assert.equal(service_tier,'default');assert.equal(store,false);assert.equal(background,false);assert.equal(stream,false);assert.deepEqual(created.requestOptions,{timeout:45000,maxRetries:0});assert.equal(events.at(-1).outcome,'completed');
}));
test('unfunded, disabled, missing credentials, cancellation and reservation failure make zero provider requests',()=>fixture(async()=>{
 for(const mutate of [()=>delete process.env.LUCY_BACKGROUND_BUDGET_GRANT,()=>process.env.LUCY_BACKGROUND_WORK_ENABLED='false',()=>delete process.env.OPENAI_API_KEY]){
 mutate();await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true));assert.ok(!events.includes('count'));
 process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify(grant);process.env.LUCY_BACKGROUND_WORK_ENABLED='true';process.env.LUCY_BACKGROUND_PROVIDER='openai';process.env.OPENAI_API_KEY='offline-test';
 }
 await assert.rejects(()=>lucyBudgetedResponse(request,async()=>false));assert.equal(events.length,0);
 reserveFail=true;await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true));assert.deepEqual(events,['reserve']);
}));
test('invalid token counts, grant replacement, kill switch and cancellation after counting cannot dispatch',()=>fixture(async()=>{
 for(const value of [-1,NaN,Infinity,20001,1.1,'30']){countValue=value;events=[];await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true));assert.ok(!events.includes('create'));assert.equal(events.at(-1).outcome,'not_dispatched');}
 countValue=30;
 for(const mutate of [()=>process.env.LUCY_BACKGROUND_WORK_ENABLED='false',()=>process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify({...grant,id:'replacement'})]){
 process.env.LUCY_BACKGROUND_WORK_ENABLED='true';process.env.LUCY_BACKGROUND_PROVIDER='openai';process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify(grant);events=[];hook=mutate;
 await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true));assert.ok(!events.includes('create'));assert.equal(events.at(-1).outcome,'not_dispatched');
 }
 process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify(grant);events=[];let active=true;hook=()=>{active=false;};await assert.rejects(()=>lucyBudgetedResponse(request,async()=>active));assert.ok(!events.includes('create'));
}));
test('timeout and malformed provider accounting retain reservation and block grant without retries',()=>fixture(async()=>{
 const baseline=response;
 for(const change of [{model:'different'},{service_tier:'priority'},{status:'in_progress'},{usage:null},{usage:{input_tokens:31,output_tokens:10,total_tokens:41}},{usage:{input_tokens:30,output_tokens:4097,total_tokens:4127}},{usage:{input_tokens:30,output_tokens:10,total_tokens:41}}]){
 response={...baseline,...change};events=[];await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true));assert.equal(events.filter(x=>x==='create').length,1);assert.equal(events.at(-1).outcome,'uncertain');
 }
 response=baseline;events=[];createHook=()=>{throw new Error('Secret provider body must not escape');};await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true),e=>!e.message.includes('Secret'));assert.equal(events.at(-1).outcome,'uncertain');
}));
test('incomplete responses retain provider status and full reservation; unavailable token counter never generates',()=>fixture(async()=>{
 response.status='incomplete';const result=await lucyBudgetedResponse(request,async()=>true);assert.equal(result.status,'incomplete');assert.equal(events.at(-1).outcome,'incomplete');
 events=[];hook=()=>{throw new Error('counter unavailable');};await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true));assert.ok(!events.includes('create'));assert.equal(events.at(-1).outcome,'not_dispatched');
}));
test('local argument mutation during counting cannot change the funded inference request',()=>fixture(async()=>{
 const source=structuredClone(request);hook=()=>{source.instructions='Changed';source.input[0].content='Changed';source.tools[0].parameters.properties.unexpected={type:'string'};};await lucyBudgetedResponse(source,async()=>true);
 assert.equal(created.payload.instructions,'Rules');assert.equal(created.payload.input[0].content,'Find assigned tasks');assert.equal(created.payload.tools[0].parameters.properties.unexpected,undefined);
}));

test('durable grant revocation and revocation during an awaited access check block dispatch',()=>fixture(async()=>{
 durableActive=false;await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true));assert.ok(!events.includes('create'));assert.equal(events.at(-1).outcome,'not_dispatched');
 durableActive=true;events=[];let durableChecks=0;await assert.rejects(()=>lucyBudgetedResponse(request,async()=>{if(++durableChecks===3)durableActive=false;return true;}));assert.ok(!events.includes('create'));assert.equal(events.at(-1).outcome,'not_dispatched');
 durableActive=true;events=[];let calls=0;await assert.rejects(()=>lucyBudgetedResponse(request,async()=>{calls++;if(calls===3)process.env.LUCY_BACKGROUND_WORK_ENABLED='false';return true;}));assert.ok(!events.includes('create'));
}));
