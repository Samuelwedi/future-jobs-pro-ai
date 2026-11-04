import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from './preflight.mjs';
const env={LUCY_OPENAI_API_KEY:'test-key',RAILWAY_API_TOKEN:'test-railway',VERCEL_TOKEN:'test-vercel',BASE_SHA:'a'.repeat(40),RAILWAY_SERVICE_ID:'service',RAILWAY_ENVIRONMENT_ID:'production',VERCEL_TEAM_ID:'team',VERCEL_PROJECT_ID:'portal'};
test('preflight identifies rejected deployment credentials without revealing provider data',async()=>{
 const result=await preflight(env,async()=>({ok:true,json:async()=>({errors:[{message:'private-provider-data'}]})}));
 assert.equal(result[1].ok,false);assert.equal(JSON.stringify(result).includes('private-provider-data'),false);
});
test('preflight requires both live targets on the exact requested source',async()=>{
 const request=async url=>({ok:true,json:async()=>url.includes('railway')?{data:{serviceInstance:{latestDeployment:{status:'SUCCESS',meta:{commitHash:env.BASE_SHA}}}}}:{readyState:'READY',projectId:'portal',meta:{githubCommitSha:env.BASE_SHA}}});
 assert.equal((await preflight(env,request)).every(c=>c.ok),true);
 const stale=await preflight({...env,BASE_SHA:'b'.repeat(40)},request);
 assert.equal(stale[1].ok,false);assert.equal(stale[2].ok,false);
});
