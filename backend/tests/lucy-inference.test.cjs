const {test}=require('node:test');const assert=require('node:assert/strict');
const {compatibleMessages,compatibleConfig,lucyResponse}=require('../dist/services/lucyInference');
test('compatible inference retains tool identifiers and receipt outputs across model turns',()=>{
 const result=compatibleMessages('System rules',[{role:'user',content:'Brief me'},{type:'function_call',call_id:'call-1',name:'brief',arguments:'{}'},{type:'function_call_output',call_id:'call-1',output:'{"success":true}'}]);
 assert.equal(result[0].role,'system');assert.equal(result[2].tool_calls[0].id,'call-1');assert.equal(result[3].tool_call_id,'call-1');assert.equal(result[3].content,'{"success":true}');
});
test('remote inference requires HTTPS and rejects embedded credentials',()=>{
 const env={...process.env};try{process.env.LUCY_LLM_MODEL='local-model';for(const url of ['http://public.example/v1','https://user:secret@example.com/v1','https://example.com/v1?key=secret']){process.env.LUCY_LLM_BASE_URL=url;assert.throws(()=>compatibleConfig());}}finally{process.env=env;}
});
test('configured compatible endpoint works without paid credentials, and rate limits do not start paid fallback',async()=>{
 const http=require('http');let status=200,received;const server=http.createServer((req,res)=>{let raw='';req.on('data',x=>raw+=x);req.on('end',()=>{received=JSON.parse(raw);res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status===200?{id:'local-1',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'Ready',tool_calls:[{id:'call-1',type:'function',function:{name:'brief',arguments:'{}'}}]},finish_reason:'tool_calls'}]}:{error:{message:'token quota reached',type:'rate_limit_error'}}));});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env};try{
  process.env.LUCY_LLM_BASE_URL=`http://127.0.0.1:${server.address().port}/v1`;process.env.LUCY_LLM_MODEL='local-model';delete process.env.LUCY_LLM_API_KEY;delete process.env.OPENAI_API_KEY;delete process.env.LUCY_ALLOW_PAID_FALLBACK;
  const response=await lucyResponse({instructions:'Test',input:[{role:'user',content:'Hello'}],tools:[{type:'function',name:'brief',description:'Brief',parameters:{type:'object',properties:{}}}]});assert.equal(response.output_text,'Ready');assert.equal(response.output[0].call_id,'call-1');assert.equal(received.model,'local-model');assert.equal(received.tools[0].function.name,'brief');
  status=429;await assert.rejects(()=>lucyResponse({instructions:'Test',input:[]}),e=>e.status===429);
 }finally{process.env=env;await new Promise(r=>server.close(r));}
});
test('provider configuration status never exposes endpoint credentials or claims capacity',()=>{
 const {lucyInferenceStatus}=require('../dist/services/lucyInference'),env={...process.env};try{
  delete process.env.LUCY_LLM_BASE_URL;delete process.env.LUCY_LLM_MODEL;delete process.env.OPENAI_API_KEY;assert.equal(lucyInferenceStatus().provider,'none');
  process.env.LUCY_LLM_BASE_URL='https://inference.example.test/v1';process.env.LUCY_LLM_MODEL='private-model';process.env.LUCY_LLM_API_KEY='fixture-secret';process.env.OPENAI_API_KEY='fixture-paid-secret';process.env.LUCY_ALLOW_PAID_FALLBACK='true';const status=lucyInferenceStatus();assert.equal(status.provider,'compatible');assert.equal(status.capacityVerified,false);assert.equal(status.paidFallbackEnabled,true);assert.ok(!JSON.stringify(status).includes('secret'));assert.ok(!JSON.stringify(status).includes('example.test'));assert.ok(!JSON.stringify(status).includes('private-model'));
  delete process.env.LUCY_LLM_MODEL;assert.equal(lucyInferenceStatus().configurationValid,false);
 }finally{process.env=env;}
});
test('upstream credit exhaustion is distinct from workspace billing and temporary rate limiting',()=>{
 const{lucyProviderFailure}=require('../dist/services/lucyInference');const credits=lucyProviderFailure({status:429,code:'insufficient_quota',message:'private provider detail'});assert.equal(credits.status,503);assert.equal(credits.code,'provider_credits_exhausted');assert.match(credits.message,/subscription is separate/);assert.ok(!credits.message.includes('private provider detail'));const rate=lucyProviderFailure({status:429});assert.equal(rate.status,429);assert.equal(rate.code,'provider_rate_limited');assert.equal(lucyProviderFailure({status:401}).status,503);
});
