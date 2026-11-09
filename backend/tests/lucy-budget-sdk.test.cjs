// Real installed SDK with a sealed in-process fetch. No external HTTP or credentials.
const {test}=require('node:test'),assert=require('node:assert/strict');
const budget=require('../dist/services/lucyBackgroundBudget');
budget.reserveLucyBudget=async()=> 'offline-reservation';budget.lucyReservationActive=async()=>true;const outcomes=[];budget.finishLucyReservation=async(_g,_id,outcome)=>outcomes.push(outcome);
const {lucyBudgetedResponse}=require('../dist/services/lucyBudgetedInference');
test('installed OpenAI SDK sends the same typed context to count and create with no automatic retry',async()=>{
 const env={...process.env},clock=Date.now,originalFetch=global.fetch;const seen=[];let failProvider=false;
 Date.now=()=>Date.parse('2026-11-08T12:00:00.000Z');
 process.env.OPENAI_API_KEY='offline-test-only';process.env.LUCY_BACKGROUND_WORK_ENABLED='true';process.env.LUCY_BACKGROUND_PROVIDER='openai';process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify({id:'sdk-test',model:'gpt-6.1-sol',maxUsd:'5.00',approvedAt:'2026-11-08T11:00:00.000Z',expiresAt:'2026-11-09T11:00:00.000Z'});
 global.fetch=async(url,init)=>{
  const target=String(url);assert.ok(['https://api.openai.com/v1/responses/input_tokens','https://api.openai.com/v1/responses'].includes(target));
  seen.push({target,body:JSON.parse(init.body)});
  if(target.endsWith('/input_tokens'))return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:100}),{status:200,headers:{'content-type':'application/json'}});
  if(failProvider)return new Response(JSON.stringify({error:{message:'offline 429'}}),{status:429,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({id:'offline-response',object:'response',created_at:1794139200,model:'gpt-6.1-sol',service_tier:'default',status:'completed',output:[{type:'message',id:'message',status:'completed',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'Verified answer',annotations:[]}]}],usage:{input_tokens:100,output_tokens:10,total_tokens:110}}),{status:200,headers:{'content-type':'application/json'}});
 };
 const request={instructions:'Do not mutate',input:[{role:'user',content:'Question'},{type:'reasoning',id:'r',summary:[],encrypted_content:'opaque'},{type:'message',id:'m',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'I will check',annotations:[]}]},{type:'function_call',call_id:'c',name:'tasks',arguments:'{}'},{type:'function_call_output',call_id:'c',output:'[]'}],tools:[{type:'function',name:'tasks',description:'Tasks',parameters:{type:'object',properties:{}},strict:false}]};
 try{
  const result=await lucyBudgetedResponse(request,async()=>true);assert.equal(result.output_text,'Verified answer');assert.equal(seen.length,2);assert.deepEqual(seen[0].body.input,request.input);assert.deepEqual(seen[0].body.input,seen[1].body.input);assert.deepEqual(seen[0].body.tools,seen[1].body.tools);assert.equal(seen[1].body.service_tier,'default');assert.equal(seen[1].body.max_output_tokens,4096);assert.equal(outcomes.at(-1),'completed');
  seen.length=0;failProvider=true;await assert.rejects(()=>lucyBudgetedResponse(request,async()=>true));assert.equal(seen.length,2);assert.equal(outcomes.at(-1),'uncertain');
 }finally{process.env=env;Date.now=clock;global.fetch=originalFetch;}
});


test('real SDK preserves encrypted reasoning and commentary through a complete read-and-synthesize lifecycle',async()=>{
 const env={...process.env},clock=Date.now,originalFetch=global.fetch;const {runLucyAgent}=require('../dist/services/lucyAgentRuntime');let creates=0,counts=0,reads=0;
 Date.now=()=>Date.parse('2026-11-08T12:00:00.000Z');process.env.OPENAI_API_KEY='offline-test-only';process.env.LUCY_BACKGROUND_WORK_ENABLED='true';process.env.LUCY_BACKGROUND_PROVIDER='openai';process.env.LUCY_BACKGROUND_BUDGET_GRANT=JSON.stringify({id:'two-step',model:'gpt-6.1-sol',maxUsd:'5.00',approvedAt:'2026-11-08T11:00:00.000Z',expiresAt:'2026-11-09T11:00:00.000Z'});
 global.fetch=async(url,init)=>{
  assert.ok(['https://api.openai.com/v1/responses/input_tokens','https://api.openai.com/v1/responses'].includes(String(url)));const body=JSON.parse(init.body);
  if(String(url).endsWith('/input_tokens')){counts++;return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:100}),{status:200,headers:{'content-type':'application/json'}});}
  creates++;assert.deepEqual(body.include,['reasoning.encrypted_content']);
  if(creates===2){assert.equal(body.input.find(item=>item.type==='reasoning').encrypted_content,'opaque-first-step');assert.equal(body.input.find(item=>item.type==='message').phase,'commentary');assert.ok(body.input.some(item=>item.type==='function_call_output'&&item.call_id==='tasks-call'));}
  const output=creates===1?[{type:'reasoning',id:'r1',summary:[],...(body.include?.includes('reasoning.encrypted_content')?{encrypted_content:'opaque-first-step'}:{})},{type:'message',id:'m1',role:'assistant',status:'completed',phase:'commentary',content:[{type:'output_text',text:'Checking tasks.',annotations:[]}]},{type:'function_call',id:'fc1',call_id:'tasks-call',name:'tasks',arguments:'{}',status:'completed'}]:[{type:'message',id:'m2',role:'assistant',status:'completed',phase:'final_answer',content:[{type:'output_text',text:'There is one open task: Inspect equipment.',annotations:[]}]}];
  return new Response(JSON.stringify({id:'offline-'+creates,object:'response',model:'gpt-6.1-sol',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:10,total_tokens:110}}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const run=await runLucyAgent({instructions:'Use current records',input:[{role:'user',content:'Summarize open tasks'}],tools:[{type:'function',name:'tasks',description:'List tasks',parameters:{type:'object',properties:{}},strict:false}],mutationTools:new Set(),shouldContinue:async()=>true,respond:request=>lucyBudgetedResponse(request,async()=>true),execute:async()=>{reads++;return{data:[{id:'task-1',description:'Inspect equipment',status:'pending'}]};}});
  assert.equal(run.status,'completed');assert.equal(run.modelCalls,2);assert.equal(creates,2);assert.equal(counts,2);assert.equal(reads,1);assert.match(run.text,/Inspect equipment/);
 }finally{process.env=env;Date.now=clock;global.fetch=originalFetch;}
});
