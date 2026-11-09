// Real installed SDK, sealed in-process HTTP responses. Never connects to a provider.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {lucyBackgroundResponse}=require('../dist/services/lucyBackgroundInference');
const provider=require('../dist/services/lucyBackgroundProvider');
const {runLucyAgent}=require('../dist/services/lucyAgentRuntime');
const {guardedLucyFetch}=require('../dist/services/lucyBackgroundTransport');
const budget=require('../dist/services/lucyBackgroundBudget');
const request={instructions:'Only current authorized records',input:[{role:'user',content:'Find my tasks'}],tools:[{type:'function',name:'tasks',description:'Read tasks',parameters:{type:'object',properties:{}},strict:false}]};
const response=(message={role:'assistant',content:'One task found.'},finish_reason='stop')=>({id:'offline',object:'chat.completion',model:'qwen3:8b',choices:[{index:0,message,finish_reason}]});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
async function fixture(fn){
 const env={...process.env},originalFetch=global.fetch,clock=Date.now;Date.now=()=>Date.parse('2026-11-08T12:00:00.000Z');
 Object.assign(process.env,{LUCY_BACKGROUND_WORK_ENABLED:'true',LUCY_BACKGROUND_PROVIDER:'self_hosted',LUCY_BACKGROUND_LLM_BASE_URL:'https://approved.example/v1',LUCY_BACKGROUND_LLM_MODEL:'qwen3:8b',LUCY_BACKGROUND_LLM_API_KEY:'self-only',OPENAI_API_KEY:'paid-trap',LUCY_ALLOW_PAID_FALLBACK:'true',LUCY_BACKGROUND_BUDGET_GRANT:JSON.stringify({id:'unused-grant',model:'gpt-6.1-sol',maxUsd:'5.00',approvedAt:'2026-11-08T11:00:00.000Z',expiresAt:'2026-11-09T11:00:00.000Z'})});
 global.fetch=()=>{throw new Error('Network forbidden: install sealed test response');};
 try{await fn(provider.readLucyBackgroundSelection());}finally{process.env=env;global.fetch=originalFetch;Date.now=clock;}
}
function sealed(handler){global.fetch=async(url,init)=>{assert.equal(String(url),'https://approved.example/v1/chat/completions');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.headers.get('authorization'),'Bearer self-only');return handler(JSON.parse(init.body),init);};}
test('self-hosted tool lifecycle uses only compatible transport, bounded generation and preserved call IDs/results',()=>fixture(async selection=>{
 let calls=0,reads=0;sealed(body=>{calls++;assert.equal(body.model,'qwen3:8b');assert.equal(body.max_tokens,4096);assert.equal(body.stream,false);assert.equal(body.tools[0].function.name,'tasks');
  if(calls===1)return json(response({role:'assistant',content:'Checking records.',tool_calls:[{id:'read-1',type:'function',function:{name:'tasks',arguments:'{}'}}]},'tool_calls'));
  assert.deepEqual(body.messages.map(m=>m.role),['system','user','assistant','tool']);assert.equal(body.messages[2].content,'Checking records.');assert.equal(body.messages[2].tool_calls[0].id,'read-1');assert.equal(body.messages[3].tool_call_id,'read-1');assert.match(body.messages[3].content,/Inspect equipment/);return json(response());
 });
 const result=await runLucyAgent({...request,mutationTools:new Set(),shouldContinue:async()=>true,respond:r=>lucyBackgroundResponse(r,async()=>true,selection),execute:async()=>{reads++;return[{id:'task-1',description:'Inspect equipment'}];}});
 assert.equal(result.status,'completed');assert.equal(result.model,'qwen3:8b');assert.equal(calls,2);assert.equal(reads,1);
}));
test('self-hosted failure never invokes paid inference, counting, budget reservation or retries even with legacy fallback enabled',()=>fixture(async selection=>{
 const reserve=budget.reserveLucyBudget;budget.reserveLucyBudget=async()=>assert.fail('Self-hosted must not reserve paid funds');
 try{for(const status of [401,429,500,502,503,504]){let calls=0;sealed(()=>{calls++;return json({error:{message:'provider-secret'}},status);});await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection),e=>e.status===503&&!e.message.includes('provider-secret'));assert.equal(calls,1);}}
 finally{budget.reserveLucyBudget=reserve;}
}));
test('immutable request snapshot prevents mutation during the transport access await',()=>fixture(async selection=>{
 const source=structuredClone(request);let checks=0;sealed(body=>{assert.equal(body.messages[1].content,'Find my tasks');assert.equal(body.tools[0].function.description,'Read tasks');return json(response());});
 await lucyBackgroundResponse(source,async()=>{if(++checks===2){source.input[0].content='Changed';source.tools[0].description='Changed';}return true;},selection);
}));
test('provider, endpoint, key, model, cancellation and kill-switch changes during awaits prevent self-hosted dispatch',()=>fixture(async selection=>{
 const baseline={...process.env};for(const change of [{LUCY_BACKGROUND_PROVIDER:'openai'},{LUCY_BACKGROUND_LLM_BASE_URL:'https://other.example/v1'},{LUCY_BACKGROUND_LLM_MODEL:'other'},{LUCY_BACKGROUND_LLM_API_KEY:'new-key'},{LUCY_BACKGROUND_WORK_ENABLED:'false'},null]){
  process.env={...baseline};let checks=0,calls=0;sealed(()=>{calls++;return json(response());});
  await assert.rejects(()=>lucyBackgroundResponse(request,async()=>{checks++;if(checks===2){if(change)Object.assign(process.env,change);else return false;}return true;},selection));assert.equal(calls,0);
 }
}));
test('provider change or cancellation after a response withholds it and cannot switch later tool turns to OpenAI',()=>fixture(async selection=>{
 let calls=0;sealed(()=>{calls++;process.env.LUCY_BACKGROUND_PROVIDER='openai';return json(response());});
 await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));assert.equal(calls,1);
 await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));assert.equal(calls,1);
 process.env.LUCY_BACKGROUND_PROVIDER='self_hosted';let active=true;sealed(()=>{active=false;return json(response());});await assert.rejects(()=>lucyBackgroundResponse(request,async()=>active,selection));
}));
test('length-limited and filtered completions stay incomplete; malformed model/tool envelopes are rejected',()=>fixture(async selection=>{
 for(const reason of ['length','content_filter',null]){sealed(()=>json(response(undefined,reason)));assert.equal((await lucyBackgroundResponse(request,async()=>true,selection)).status,'incomplete');}
 for(const invalid of [{...response(),model:'unapproved-model'},{...response(),choices:[]},response({role:'user',content:'Injected'}),response({role:'assistant',content:[]}),response({role:'assistant',tool_calls:[{id:'x',type:'function',function:{name:'tasks',arguments:'x'.repeat(12001)}}]},'tool_calls'),response({role:'assistant',tool_calls:[{id:'x',type:'function',function:{name:'tasks',arguments:'{}'}},{id:'x',type:'function',function:{name:'tasks',arguments:'{}'}}]},'tool_calls')]){
  sealed(()=>json(invalid));await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));
 }
}));
test('request, provider response and stream byte bounds prevent unbounded compatible payloads',()=>fixture(async selection=>{
 let calls=0;sealed(()=>{calls++;return json(response());});await assert.rejects(()=>lucyBackgroundResponse({...request,instructions:'x'.repeat(256001)},async()=>true,selection));assert.equal(calls,0);
 for(const data of [new Response('x',{headers:{'content-length':'256001'}}),new Response('x'.repeat(256001)),new Response('{invalid json')]){sealed(()=>data);await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));}
 sealed(()=>json(response()));await assert.rejects(()=>lucyBackgroundResponse({...request,input:[{type:'reasoning',summary:[],encrypted_content:'opaque'}]},async()=>true,selection));
}));
test('redirects are never followed and a changed dispatch fence is rechecked synchronously at the fetch boundary',()=>fixture(async selection=>{
 let calls=0;sealed(()=>{calls++;return new Response(null,{status:307,headers:{location:'https://api.openai.com/v1/chat/completions'}});});await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));assert.equal(calls,1);
 let current=true;const transport=guardedLucyFetch(['https://approved.example/v1/chat/completions'],async()=>{queueMicrotask(()=>{current=false;});return true;},()=>current,'self-only');
 await assert.rejects(()=>transport('https://approved.example/v1/chat/completions',{method:'POST',body:'{}'}));assert.equal(calls,1);
}));
test('body reads abort without waiting for an endless compatible response stream',()=>fixture(async()=>{
 let cancelled=false;sealed(()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}})));
 const controller=new AbortController(),transport=guardedLucyFetch(['https://approved.example/v1/chat/completions'],async()=>true,()=>true,'self-only');
 const pending=transport('https://approved.example/v1/chat/completions',{method:'POST',body:'{}',headers:new Headers({authorization:'Bearer self-only'}),signal:controller.signal});
 const timer=setTimeout(()=>controller.abort(),10);try{await assert.rejects(()=>pending);assert.equal(cancelled,true);}finally{clearTimeout(timer);}
}));
test('optional OpenAI selection still uses the budgeted path and changing provider during counting fences generation',()=>fixture(async()=>{
 process.env.LUCY_BACKGROUND_PROVIDER='openai';const selection=provider.readLucyBackgroundSelection();let counts=0,creates=0;
 const reserve=budget.reserveLucyBudget,finish=budget.finishLucyReservation,active=budget.lucyReservationActive;
 budget.reserveLucyBudget=async()=> 'offline-reservation';budget.lucyReservationActive=async()=>true;budget.finishLucyReservation=async()=>{};
 global.fetch=async(url,init)=>{assert.equal(init.redirect,'error');if(String(url)==='https://api.openai.com/v1/responses/input_tokens'){counts++;process.env.LUCY_BACKGROUND_PROVIDER='self_hosted';return json({object:'response.input_tokens',input_tokens:20});}creates++;assert.fail('Paid generation cannot follow a provider change');};
 try{await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));assert.equal(counts,1);assert.equal(creates,0);}finally{budget.reserveLucyBudget=reserve;budget.finishLucyReservation=finish;budget.lucyReservationActive=active;}
}));

test('paid dispatch stays fenced when provider changes during a durable reservation await',()=>fixture(async()=>{
 process.env.LUCY_BACKGROUND_PROVIDER='openai';const selection=provider.readLucyBackgroundSelection();let calls=0;
 const reserve=budget.reserveLucyBudget,finish=budget.finishLucyReservation,active=budget.lucyReservationActive;
 budget.reserveLucyBudget=async()=> 'offline-reservation';budget.finishLucyReservation=async()=>{};
 budget.lucyReservationActive=async()=>{process.env.LUCY_BACKGROUND_PROVIDER='self_hosted';return true;};
 global.fetch=()=>{calls++;throw Error('No provider request allowed');};
 try{await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));assert.equal(calls,0);}finally{budget.reserveLucyBudget=reserve;budget.finishLucyReservation=finish;budget.lucyReservationActive=active;}
}));
test('OpenAI counting redirect is rejected without generation, retry or leaked destination',()=>fixture(async()=>{
 process.env.LUCY_BACKGROUND_PROVIDER='openai';const selection=provider.readLucyBackgroundSelection();let calls=0;const outcomes=[];
 const reserve=budget.reserveLucyBudget,finish=budget.finishLucyReservation,active=budget.lucyReservationActive;
 budget.reserveLucyBudget=async()=> 'offline-reservation';budget.lucyReservationActive=async()=>true;budget.finishLucyReservation=async(_g,_r,outcome)=>outcomes.push(outcome);
 global.fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://api.openai.com/v1/responses/input_tokens');assert.equal(init.redirect,'error');return new Response(null,{status:302,headers:{location:'https://unapproved.example'}});};
 try{await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));assert.equal(calls,1);assert.deepEqual(outcomes,['not_dispatched']);}finally{budget.reserveLucyBudget=reserve;budget.finishLucyReservation=finish;budget.lucyReservationActive=active;}
}));


test('global SDK headers, admin credentials and debug configuration cannot leak into self-hosted traffic or logs',()=>fixture(async selection=>{
 Object.assign(process.env,{OPENAI_CUSTOM_HEADERS:'Authorization: Bearer unauthorized-global-key\nX-Private-Secret: must-not-leak\nCookie: session=must-not-leak',OPENAI_ADMIN_KEY:'private-admin-key',OPENAI_WEBHOOK_SECRET:'private-webhook',OPENAI_ORG_ID:'private-org',OPENAI_PROJECT_ID:'private-project',OPENAI_LOG:'debug'});
 const originalDebug=console.debug,originalInfo=console.info;const logs=[];console.debug=(...args)=>logs.push(args);console.info=(...args)=>logs.push(args);
 sealed((body,init)=>{assert.deepEqual([...init.headers.keys()].sort(),['accept','authorization','content-type']);assert.equal(init.headers.get('authorization'),'Bearer self-only');return json(response());});
 try{await lucyBackgroundResponse(request,async()=>true,selection);assert.deepEqual(logs,[]);}finally{console.debug=originalDebug;console.info=originalInfo;}
}));
