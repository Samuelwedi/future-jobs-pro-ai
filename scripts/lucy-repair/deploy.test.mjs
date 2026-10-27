import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { requiresReview } from './policy.mjs';
const base='a'.repeat(40), next='b'.repeat(40);
const source=fs.readFileSync(new URL('./deploy.mjs',import.meta.url),'utf8');
async function scenario(options={}) {
  const calls=[], pushes=[], logs=[];
  let healthCalls=0;
  const env={BASE_SHA:base,REPAIR_SCOPE:options.scope||'support-portal',VERIFIED_PRODUCTION_SHA:options.baseline||base,
    GH_TOKEN:'test',RAILWAY_API_TOKEN:'test',VERCEL_TOKEN:'test',RAILWAY_SERVICE_ID:'service',RAILWAY_ENVIRONMENT_ID:'environment',VERCEL_PROJECT_ID:'project',VERCEL_TEAM_ID:'team'};
  if(options.missing)delete env[options.missing];
  const process={env,exitCode:0};
  const context=vm.createContext({process,Buffer,AbortSignal,setTimeout:resolve=>resolve(),console:{log:s=>logs.push(s),error:s=>logs.push(s)},fetch:async(url,init={})=>{
    const body=init.body?JSON.parse(init.body):undefined;
    calls.push({url,method:init.method||'GET',body});
    if(url==='https://api.github.com/repos/Samuelwedi/future-jobs-pro-ai/')return {ok:false,status:404};
    let data;
    if(url.includes('/api/health')){healthCalls++;data={status:options.unhealthy&&healthCalls>1?'unhealthy':'healthy'};}
    else if(url.includes('backboard.railway.com')) {
      if(body.query.includes('serviceInstance('))data={data:{serviceInstance:{latestDeployment:{status:options.baselinePending?'BUILDING':'SUCCESS',meta:{commitHash:options.baseline||base}}}}};
      else if(body.query.startsWith('mutation'))data={data:{serviceInstanceDeployV2:body.variables.commitSha}};
      else data={data:{deployment:{status:options.failDeployment&&body.variables.id===next?'FAILED':'SUCCESS'}}};
    } else if(url.includes('api.vercel.com')) {
      data=url.includes('future-jobs-pro-ai-z32m.vercel.app')?{readyState:'READY',meta:{githubCommitSha:options.portalBaseline||base},projectId:'project'}:init.method==='POST'?{id:body.gitSource.ref}:{readyState:'READY'};
    } else if(url.includes('/git/ref/heads/'))data={object:{sha:options.stale?'c'.repeat(40):base}};
    else if(url.includes('/git/commits/'))data={tree:{sha:'tree'}};
    else if(url.endsWith('/git/trees'))data={sha:'tree-new'};
    else if(url.endsWith('/git/commits'))data={sha:next};
    else if(url.endsWith('/git/refs'))data={ref:body.ref};
    else data={id:123};
    return {ok:true,status:200,json:async()=>data};
  }});
  const mocks={
    'node:fs':{default:{readFileSync:()=>'{"files":[]}'}},
    'node:child_process':{execFileSync:(_command,args)=>{if(args[0]==='push'){pushes.push(args);if(options.rollbackConflict&&pushes.length===2)throw new Error('Lease rejected');}}},
    './policy.mjs':{requiresReview:(patch,scope)=>options.review||requiresReview(patch,scope),validatePatch:()=>({files:[{path:'webdash/src/App.css',content:'body {}'}]})},
  };
  const module=new vm.SourceTextModule(source,{context});
  await module.link(specifier=>{const exports=mocks[specifier];assert.ok(exports,`Unexpected import ${specifier}`);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});});
  let error;
  try{await module.evaluate();}catch(e){error=e.message;}
  return {calls,pushes,logs,healthCalls,error,exitCode:process.exitCode};
}
test('missing credentials and unverified baseline block all provider mutations',async()=>{
  for(const option of [{missing:'VERCEL_TOKEN'},{baseline:'c'.repeat(40)},{portalBaseline:'c'.repeat(40)},{baselinePending:true}]){
    const r=await scenario(option);assert.ok(r.error);assert.ok(r.calls.every(c=>!c.body?.query?.startsWith('mutation') && !c.url.endsWith('/git/trees')));assert.equal(r.pushes.length,0);
  }
});
test('stale branch prevents commit creation and deployment',async()=>{
  const r=await scenario({stale:true});assert.match(r.error,/Source changed/);assert.ok(r.calls.every(c=>c.method==='GET'||c.body?.query?.startsWith('query')));assert.equal(r.pushes.length,0);
});
test('successful portal repair uses atomic leases and verifies health',async()=>{
  const r=await scenario();assert.equal(r.error,undefined);assert.equal(r.exitCode,0);assert.equal(r.pushes.length,1);assert.ok(r.pushes[0].includes('--atomic'));assert.equal(r.pushes[0].filter(a=>a.startsWith('--force-with-lease=')&&a.endsWith(base)).length,2);assert.equal(r.healthCalls,2);assert.match(r.logs.join('\n'),/Verified deployment/);
});
test('failed deployment rolls both providers back to the original commit',async()=>{
  const r=await scenario({failDeployment:true});assert.equal(r.exitCode,1);assert.equal(r.pushes.length,2);assert.equal(r.pushes[1].filter(a=>a.startsWith('--force-with-lease=')&&a.endsWith(next)).length,2);
  const railway=r.calls.filter(c=>c.body?.query?.startsWith('mutation')).map(c=>c.body.variables.commitSha);
  const vercel=r.calls.filter(c=>c.url.includes('api.vercel.com')&&c.method==='POST').map(c=>c.body.gitSource.ref);
  assert.deepEqual(railway,[next,base]);assert.deepEqual(vercel,[next,base]);assert.equal(r.healthCalls,2);assert.match(r.logs.join('\n'),/previous source redeployed successfully/);
});
test('rollback lease conflict preserves newer source and requests manual recovery',async()=>{
  const r=await scenario({failDeployment:true,rollbackConflict:true});assert.equal(r.exitCode,1);assert.equal(r.calls.filter(c=>c.body?.query?.startsWith('mutation')).length,1);assert.match(r.logs.join('\n'),/Manual recovery is required/);
});
test('unhealthy rollback cannot be reported as successful recovery',async()=>{
  const r=await scenario({unhealthy:true});assert.equal(r.exitCode,1);assert.equal(r.healthCalls,3);assert.match(r.logs.join('\n'),/Manual recovery is required/);assert.doesNotMatch(r.logs.join('\n'),/redeployed successfully/);
});
test('mobile repair publishes only a candidate branch and never deploys or submits',async()=>{
  const r=await scenario({scope:'mobile-audio'});assert.equal(r.error,undefined);assert.equal(r.pushes.length,0);assert.equal(r.healthCalls,0);assert.ok(r.calls.every(c=>c.url.startsWith('https://api.github.com/')));assert.ok(r.calls.some(c=>c.body?.ref===`refs/heads/lucy-repair/mobile-${next.slice(0,12)}`));
});

test('repository metadata uses canonical URL without trailing slash',async()=>{
 const r=await scenario();
 assert.equal(r.exitCode,0);
 assert.ok(r.calls.some(c=>c.url==='https://api.github.com/repos/Samuelwedi/future-jobs-pro-ai'));
 assert.ok(!r.calls.some(c=>c.url==='https://api.github.com/repos/Samuelwedi/future-jobs-pro-ai/'));
});
test('broader backend and sensitive candidates never invoke production providers',async()=>{
 const r=await scenario({scope:'backend',review:true});
 assert.equal(r.error,undefined);assert.equal(r.pushes.length,0);
 assert.ok(r.calls.every(c=>c.url.startsWith('https://api.github.com/')));
 assert.ok(r.calls.some(c=>c.body?.ref===`refs/heads/lucy-repair/review-${next.slice(0,12)}`));
 assert.match(r.logs.join('\n'),/Owner review required/);
});
test('customer web repairs cannot publish to the support portal project',async()=>{
 const r=await scenario({scope:'customer-web'});
 assert.equal(r.error,undefined);assert.equal(r.exitCode,0);
 assert.equal(r.pushes.length,0);assert.equal(r.healthCalls,0);
 assert.ok(r.calls.every(c=>c.url.startsWith('https://api.github.com/')));
 assert.ok(r.calls.some(c=>c.body?.ref===`refs/heads/lucy-repair/review-${next.slice(0,12)}`));
});
