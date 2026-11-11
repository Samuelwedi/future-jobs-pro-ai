import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from './preflight.mjs';
const env={LUCY_OPENAI_API_KEY:'test-key',LUCY_REPAIR_MODEL:'test-repair-model',LUCY_REPAIR_SPEND_APPROVED:'true',RAILWAY_API_TOKEN:'test-railway',VERCEL_TOKEN:'test-vercel',BASE_SHA:'a'.repeat(40),RAILWAY_SERVICE_ID:'service',RAILWAY_ENVIRONMENT_ID:'production',VERCEL_TEAM_ID:'team',VERCEL_PROJECT_ID:'portal'};
const request=async url=>({ok:true,json:async()=>url.includes('api.openai.com')?{id:env.LUCY_REPAIR_MODEL}:url.includes('railway')?{data:{serviceInstance:{latestDeployment:{status:'SUCCESS',meta:{commitHash:env.BASE_SHA}}}}}:{readyState:'READY',projectId:'portal',meta:{githubCommitSha:env.BASE_SHA}}});
test('preflight identifies rejected deployment credentials without revealing provider data',async()=>{
 const result=await preflight(env,async()=>({ok:true,json:async()=>({errors:[{message:'private-provider-data'}]})}));
 assert.equal(result[1].ok,false);assert.equal(JSON.stringify(result).includes('private-provider-data'),false);
});
test('preflight requires both live targets on the exact requested source',async()=>{
 assert.equal((await preflight(env,request)).every(c=>c.ok),true);
 const stale=await preflight({...env,BASE_SHA:'b'.repeat(40)},request);
 assert.equal(stale[1].ok,false);assert.equal(stale[2].ok,false);
});
test('project-scoped Railway tokens use the documented project header',async()=>{
 const headers=[];
 const checks=await preflight(env,async(url,options)=>{
  if(!url.includes('railway'))return request(url);
  headers.push(options.headers);
  return {ok:true,json:async()=>options.headers['Project-Access-Token']?{data:{serviceInstance:{latestDeployment:{status:'SUCCESS',meta:{commitHash:env.BASE_SHA}}}}}:{errors:[{message:'Not authorized'}]}};
 });
 assert.equal(checks.every(c=>c.ok),true);assert.equal(headers.length,2);
 assert.equal(headers[1]['Project-Access-Token'],'test-railway');assert.equal(headers[1].Authorization,undefined);
});
test('all repair scopes require explicit model and separate spend approval before any OpenAI request',async()=>{
 for(const change of [{LUCY_REPAIR_MODEL:''},{LUCY_REPAIR_MODEL:'../secrets'},{LUCY_REPAIR_SPEND_APPROVED:''},{LUCY_OPENAI_API_KEY:''}]){
  const calls=[];const checks=await preflight({...env,REPAIR_SCOPE:'backend',...change},async url=>{calls.push(url);return request(url);});
  assert.equal(checks.length,1);assert.equal(checks[0].ok,false);assert.equal(calls.length,0);
 }
});
test('model access uses metadata GET only, not inference; review candidates need no deploy credentials',async()=>{
 const calls=[];
 const checks=await preflight({...env,REPAIR_SCOPE:'mobile',RAILWAY_API_TOKEN:'',VERCEL_TOKEN:''},async(url,options)=>{calls.push({url,options});return request(url);});
 assert.equal(checks.length,1);assert.equal(checks[0].ok,true);
 assert.equal(calls[0].url,'https://api.openai.com/v1/models/test-repair-model');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
});
test('unavailable or mismatched models fail closed without leaking provider response',async()=>{
 for(const response of [{ok:false,status:403},{ok:true,json:async()=>({id:'other-model',private:'do not report'})}]){
  const checks=await preflight({...env,REPAIR_SCOPE:'backend'},async()=>response);
  assert.equal(checks[0].ok,false);assert.equal(JSON.stringify(checks).includes('do not report'),false);
 }
});
