// Loopback-only integration with the real installed SDK. Fetch is sealed to one exact URL.
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {lucyBackgroundResponse}=require('../dist/services/lucyBackgroundInference');
const {readLucyBackgroundSelection}=require('../dist/services/lucyBackgroundProvider');
test('real loopback HTTP honors compatible tool transport and refuses redirects without leaking to another path',async()=>{
 const env={...process.env},originalFetch=global.fetch;let calls=0,redirect=false,leaked=0;
 const server=http.createServer((req,res)=>{
  if(req.url!=='/v1/chat/completions'){leaked++;res.writeHead(500);return res.end();}
  calls++;let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
   const body=JSON.parse(raw);assert.equal(body.model,'offline-model');assert.equal(body.max_tokens,4096);assert.equal(req.headers.authorization,'Bearer local-no-key');assert.equal(req.headers['openai-organization'],undefined);assert.equal(req.headers['openai-project'],undefined);
   if(redirect){res.writeHead(307,{location:'/unapproved-paid-proxy'});return res.end();}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:'offline-model',choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'task-read',type:'function',function:{name:'tasks',arguments:'{}'}}]}}]}));
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}/v1`;
  Object.assign(process.env,{LUCY_BACKGROUND_WORK_ENABLED:'true',LUCY_BACKGROUND_PROVIDER:'self_hosted',LUCY_BACKGROUND_LLM_BASE_URL:base,LUCY_BACKGROUND_LLM_MODEL:'offline-model',OPENAI_API_KEY:'paid-trap',LUCY_ALLOW_PAID_FALLBACK:'true',OPENAI_ORG_ID:'private-org-trap',OPENAI_PROJECT_ID:'private-project-trap'});delete process.env.LUCY_BACKGROUND_LLM_API_KEY;
  global.fetch=(url,init)=>{assert.equal(String(url),base+'/chat/completions');assert.equal(init.redirect,'error');return originalFetch(url,init);};
  const selection=readLucyBackgroundSelection(),request={instructions:'Offline test',input:[{role:'user',content:'List tasks'}],tools:[{type:'function',name:'tasks',description:'Tasks',parameters:{type:'object',properties:{}},strict:false}]};
  const result=await lucyBackgroundResponse(request,async()=>true,selection);assert.equal(result.output[0].call_id,'task-read');assert.equal(result.status,'completed');
  redirect=true;await assert.rejects(()=>lucyBackgroundResponse(request,async()=>true,selection));assert.equal(calls,2);assert.equal(leaked,0);
 }finally{process.env=env;global.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));}
});
