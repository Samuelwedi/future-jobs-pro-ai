const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runLucyAgent,validateLucyArguments}=require('../dist/services/lucyAgentRuntime');
const tool=name=>({type:'function',name,description:name,parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}}},strict:false});
const call=(name,id,args={})=>({type:'function_call',name,call_id:id,arguments:JSON.stringify(args)});
const done={model:'mock',output:[],output_text:'Verified result'};
const options=(overrides={})=>({instructions:'Rules',input:[{role:'user',content:'Request'}],tools:[tool('read'),tool('write'),tool('documents')],mutationTools:new Set(['write']),untrustedReadTools:new Set(['documents']),execute:async()=>({data:'ok'}),respond:async()=>done,...overrides});

test('validates tool arguments before execution without accepting extra fields or invalid types',()=>{
  for(const raw of ['null','[]','1','{','{"extra":1}','{"query":null}','{"limit":1.5}','{"limit":51}','{"query":"'+('x'.repeat(4001))+'"}'])assert.throws(()=>validateLucyArguments(tool('read'),raw),raw);
  const required={...tool('read'),parameters:{type:'object',properties:{query:{type:'string'}},required:['query']}};
  for(const raw of ['{}','{"query":" "}'])assert.throws(()=>validateLucyArguments(required,raw));
  assert.deepEqual(validateLucyArguments(tool('read'),'{"query":"north","limit":20}'),{query:'north',limit:20});
});

test('parallelizes at most three reads and retains output order',async()=>{
  let active=0,peak=0,round=0;const completed=[];
  const result=await runLucyAgent(options({respond:async request=>{
    if(round++===0)return {output:Array.from({length:5},(_,i)=>call('read','r'+i,{limit:i+1}))};
    assert.deepEqual(request.input.filter(x=>x.type==='function_call_output').map(x=>x.call_id),['r0','r1','r2','r3','r4']);return done;
  },execute:async(_name,args)=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,6-args.limit));active--;completed.push(args.limit);return {data:args.limit};}}));
  assert.equal(peak,3);assert.equal(completed.length,5);assert.equal(result.status,'completed');
});

test('writes remain ordered and identical mutations execute once per run',async()=>{
  let round=0;const executed=[],published=[];
  const result=await runLucyAgent(options({respond:async()=>round++===0?{output:[call('read','r'),call('write','w1',{query:'task',limit:2}),call('write','w2',{limit:2,query:'task'}),call('read','r2')]}:done,
    execute:async(name)=>{executed.push(name);return {action:{status:'completed'}};},onOutcome:async outcome=>published.push(outcome)}));
  assert.deepEqual(executed,['read','write','read']);assert.equal(result.outcomes[2].reused,true);assert.equal(published.length,3);
});

test('failed or uncertain mutations are not automatically retried within the run',async()=>{
  let round=0,executed=0;
  const result=await runLucyAgent(options({respond:async()=>round++<2?{output:[call('write','w'+round)]}:done,execute:async()=>{executed++;throw new Error('Outcome uncertain');}}));
  assert.equal(executed,1);assert.equal(result.status,'partial');assert.equal(result.outcomes[1].reused,true);
});

test('untrusted lookup and writes in either order are read-only for the entire turn',async()=>{
  for(const calls of [[call('documents','d'),call('write','w')],[call('write','w'),call('documents','d')]]){
    let round=0;const executed=[];
    const result=await runLucyAgent(options({respond:async()=>round++===0?{output:calls}:done,execute:async name=>{executed.push(name);return {};}}));
    assert.deepEqual(executed,['documents']);assert.equal(result.status,'partial');
  }
});

test('unknown tools, malformed JSON and absent-role tools cannot execute',async()=>{
  let round=0,executed=0;
  const result=await runLucyAgent(options({respond:async()=>round++===0?{output:[call('admin','a'),{...call('read','r'),arguments:'null'}]}:done,execute:async()=>{executed++;return {};}}));
  assert.equal(executed,0);assert.equal(result.status,'partial');assert.equal(result.outcomes.length,2);
});

test('rejects a duplicate call ID for the entire batch before writes',async()=>{
  let executed=0;
  const result=await runLucyAgent(options({respond:async()=>({output:[call('write','same',{query:'one'}),call('write','same',{query:'two'})]}),execute:async()=>{executed++;}}));
  assert.equal(executed,0);assert.equal(result.stopReason,'invalid_response');
});

test('provider failure after successful actions preserves receipts and does not repeat writes',async()=>{
  let round=0;
  const result=await runLucyAgent(options({respond:async()=>{if(round++===0)return {output:[call('write','w')]};throw new Error('Provider outage');},execute:async()=>({action:{status:'completed',summary:'Task created'}})}));
  assert.equal(result.stopReason,'provider_unavailable');assert.equal(result.outcomes[0].result.action.summary,'Task created');
  await assert.rejects(()=>runLucyAgent(options({respond:async()=>{throw new Error('Unavailable');}})),/Unavailable/);
});

test('sixth model call is synthesis only and cannot run an extra action',async()=>{
  let rounds=0,executed=0;
  const result=await runLucyAgent(options({respond:async request=>{rounds++;if(rounds===6)assert.deepEqual(request.tools,[]);return {output:[call('read','r'+rounds)]};},execute:async()=>{executed++;return {};}}));
  assert.equal(rounds,6);assert.equal(executed,5);assert.equal(result.stopReason,'step_limit');
});

test('bounds total tools and time without starting additional work',async()=>{
  let executed=0;
  const tooMany=await runLucyAgent(options({respond:async()=>({output:Array.from({length:25},(_,i)=>call('write','w'+i))}),execute:async()=>{executed++;}}));
  assert.equal(tooMany.stopReason,'tool_limit');assert.equal(executed,0);
  let ticks=0;
  const expired=await runLucyAgent(options({now:()=>ticks++===0?0:90001,respond:async()=>{throw new Error('Must not call');}}));
  assert.equal(expired.stopReason,'time_limit');assert.equal(expired.modelCalls,0);
});

test('oversized tool evidence is valid JSON and clearly marked incomplete',async()=>{
  let round=0;
  await runLucyAgent(options({respond:async request=>{if(round++===0)return {output:[call('read','r')]};const result=JSON.parse(request.input.at(-1).output);assert.equal(result.truncated,true);assert.ok(result.preview.length<=18000);return done;},execute:async()=>({data:'x'.repeat(25000)})}));
});

test('incomplete provider output is not mislabeled as finished',async()=>{
  const result=await runLucyAgent(options({respond:async()=>({...done,status:'incomplete'})}));
  assert.equal(result.status,'partial');assert.equal(result.stopReason,'invalid_response');
});

test('malformed provider envelopes preserve earlier completed receipts',async()=>{
  for (const invalid of [null,undefined,{output:[null]},{output:[1]},{output:[{type:'function_call',name:null,call_id:'bad'}]}]) {
    let round=0;
    const result=await runLucyAgent(options({respond:async()=>round++===0?{output:[call('write','good')]}:invalid,execute:async()=>({action:{status:'completed'}})}));
    assert.equal(result.stopReason,'invalid_response');assert.equal(result.outcomes[0].result.action.status,'completed');
  }
});

test('ambient classification cannot hide a prior successful action',async()=>{
  let round=0;
  const result=await runLucyAgent(options({tools:[tool('write'),tool('ignore_ambient_speech')],respond:async()=>({output:[round++===0?call('write','w'):call('ignore_ambient_speech','i')]}),execute:async()=>({action:{status:'completed'}})}));
  assert.equal(result.status,'partial');assert.equal(result.outcomes[0].result.action.status,'completed');
});

test('cancelled background work cannot start another model call',async()=>{
 let allowed=true,rounds=0;
 const result=await runLucyAgent(options({shouldContinue:async()=>allowed,respond:async()=>{rounds++;return {output:[call('read','r')]};},execute:async()=>{allowed=false;return {data:'read complete'};}}));
 assert.equal(rounds,1);assert.equal(result.stopReason,'cancelled');assert.equal(result.outcomes.length,1);
});

test('incomplete provider tool batches never execute and cannot erase prior receipts',async()=>{
 let executed=0;const first=await runLucyAgent(options({respond:async()=>({status:'incomplete',output:[call('write','truncated')]}),execute:async()=>{executed++;}}));assert.equal(first.status,'partial');assert.equal(executed,0);
 let round=0;const later=await runLucyAgent(options({respond:async()=>round++===0?{output:[call('write','first')]}:{status:'incomplete',output:[call('write','truncated')]},execute:async()=>{executed++;return {action:{status:'completed'}};}}));assert.equal(executed,1);assert.equal(later.outcomes[0].result.action.status,'completed');assert.equal(later.status,'partial');
});
