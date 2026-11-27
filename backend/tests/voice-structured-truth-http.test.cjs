const assert = require('node:assert/strict');
const {before,after,test} = require('node:test');
const {once} = require('node:events');
const Module = require('node:module');
process.env.TS_NODE_PROJECT=require('node:path').join(__dirname,'../tsconfig.json');
require('ts-node/register/transpile-only');
const express = require('express'), jwt = require('jsonwebtoken');
process.env.JWT_SECRET='local-synthetic-only';
Object.assign(process.env,{CLOUDINARY_CLOUD_NAME:'local',CLOUDINARY_API_KEY:'local',CLOUDINARY_API_SECRET:'local'});
const empty={actions:[],parts:[],measurements:[],issues:[],nextSteps:[],people:[]};
const writes=[], events=[], extractionCalls=[], speechCalls=[];
let spoken, mode, server, url;
const pool={query:async(sql,params)=>{
  if (/FROM users/.test(sql)) return {rowCount:1,rows:[{id:'actor',company_id:'tenant'}]};
  if (/FROM projects/.test(sql)) return {rowCount:1};
  if (/INSERT INTO voice_notes/.test(sql)) {writes.push(params);return {rows:[{id:'synthetic'}]};}
  throw Error('Unexpected statement');
}};
const original=Module._load;
Module._load=function(spec,...rest){
  if(spec.endsWith('/config/database'))return {pool};
  if(spec.endsWith('/adaptiveAIService') || spec==='./adaptiveAIService')return {recordUserEvent:async data=>events.push(data)};
  if(spec==='openai')return class Provider {
    audio={transcriptions:{create:async input=>{
      speechCalls.push([input.language,input.response_format]);
      for await(const chunk of input.file) assert.ok(chunk.length);
      return {text:spoken};
    }}};
    chat={completions:{create:async input=>{
      if(!input.messages[0].content.startsWith('Extract field-note'))return {choices:[{message:{content:''}}]};
      extractionCalls.push(input.messages);
      if(mode==='error')throw Error('no structured extraction');
      if(mode==='empty')return {choices:[]};
      const content= mode==='invalid' ? 'not JSON' : mode==='wrong-shape' ?
        JSON.stringify({...empty, actions:[{done:true}]}) :
        JSON.stringify({...empty,actions:['replaced','tested'],measurements:[{value:40,unit:'psi',context:'pressure'}]});
      return {choices:[{message:{content}}]};
    }}};
  };
  return original.call(this,spec,...rest);
};
const service=require.resolve('../src/services/voiceService'), route=require.resolve('../src/routes/voiceRoutes');
function load(enabled) {
  delete require.cache[service];delete require.cache[route];
  if(enabled)process.env.OPENAI_API_KEY='synthetic-unused';
  else delete process.env.OPENAI_API_KEY;
  return require(route).default;
}
const unavailableRouter=load(false), configuredRouter=load(true);
Module._load=original;
require('cloudinary').v2.uploader.upload=async()=>({secure_url:'https://fixture.invalid/audio'});
before(async()=>{
  const app=express();app.use(express.json());app.use('/configured',configuredRouter);app.use('/unavailable',unavailableRouter);
  server=app.listen(0,'127.0.0.1');await once(server,'listening');url='http://127.0.0.1:'+server.address().port;
});
after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
async function run(lane,text,state){
  mode=state;spoken=text;
  const auth={Authorization:'Bearer '+jwt.sign({id:'actor'},process.env.JWT_SECRET)};
  let response, metadata, row, trace;
  if(lane==='audio'){
    const body=new FormData();body.set('projectId','project');body.set('audio',new Blob(['synthetic'],{type:'audio/mp4'}),'voice.m4a');
    response=await fetch(url+'/configured/process',{method:'POST',body,headers:auth});
    row=writes.at(-1);
    metadata=JSON.parse(row[8]);
    assert.deepEqual(JSON.parse(row[9]),metadata.structured);
    assert.equal(row[5],text);
    assert.deepEqual(speechCalls.at(-1),[undefined,'json']);
  }else{
    response=await fetch(url+(state==='none'?'/unavailable':'/configured')+'/process-transcript',{method:'POST',
      headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({projectId:'project',transcript:text})});
    row=writes.at(-1);metadata=JSON.parse(row[6]);assert.equal(row[4],text);
  }
  assert.equal(response.status,200);
  trace=events.at(-1).eventData;
  const result=await response.json();
  assert.equal(result.transcript,text);assert.equal(trace.transcript,text);
  assert.deepEqual(trace.extractedData,metadata.structured);
  assert.deepEqual(result.structuredData,metadata.structured);
  if(state!=='none'){
    const messages=extractionCalls.at(-1);
    assert.equal(messages[1].content,text);
    assert.match(messages[0].content,/negated/);
  }
  return result.structuredData;
}
for(const lane of ['audio','transcript']){
  test(lane+' fallback never labels negated, instructed, future or non-Latin work completed', async()=>{
    const inputs=[
      ['The valve was not replaced. Need to order a gasket.','error'],
      ['The pump was checked. Do not say it was repaired.','empty'],
      ['Check the valve tomorrow.','invalid'],
      ['वाल्व बदला नहीं गया। कल जाँच करें।','wrong-shape'],
    ];
    for(const [input,state] of inputs) assert.deepEqual(await run(lane,input,state),{extractionStatus:'unavailable',...empty});
  });
  test(lane+' accepts a positive structured draft and preserves the source',async()=>{
    const s=await run(lane,'Valve replaced and pressure tested at 40 psi.','positive');
    assert.equal(s.extractionStatus,'model_draft');
    assert.deepEqual(s.actions,['replaced','tested']);assert.equal(s.measurements[0].value,40);
  });
}
test('transcript without a provider stays reviewable, with no synthetic completed work',async()=>{
  const seen=extractionCalls.length;
  assert.deepEqual(await run('transcript','The valve was not replaced.','none'),{extractionStatus:'unavailable',...empty});
  assert.equal(extractionCalls.length,seen);
});
