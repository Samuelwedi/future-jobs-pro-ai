import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validatePatch, requiresReview } from './policy.mjs';
const repo = 'Samuelwedi/future-jobs-pro-ai';
const sourceBranch = 'fix/tester-release-20261022';
const portalBranch = 'release/lucy-verified-dashboard';
const base = process.env.BASE_SHA;
const scope = process.env.REPAIR_SCOPE;
if (!/^[a-f0-9]{40}$/.test(base || '')) throw new Error('Invalid source commit');
const patch = validatePatch(fs.readFileSync('/tmp/verified-repair/lucy-repair-patch.json','utf8'), scope);
const review = requiresReview(patch, scope);
const native = scope === 'mobile-audio' || scope === 'mobile';
const autoDeploy = !review && !native;
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
async function request(url, token, method='GET', body) {
  const response = await fetch(url, {method, headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json', Accept:'application/json'}, body:body ? JSON.stringify(body):undefined, signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Provider request failed: HTTP ${response.status}`);
  return response.status===204 ? null : response.json();
}
const gh = (url,method,body)=>request(`https://api.github.com/repos/${repo}${url ? `/${url}` : ''}`,process.env.GH_TOKEN,method,body);
const vercel = (url,method,body)=>request(`https://api.vercel.com${url}${url.includes('?')?'&':'?'}teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}`,process.env.VERCEL_TOKEN,method,body);
async function railway(query,variables) {
  const result=await request('https://backboard.railway.com/graphql/v2',process.env.RAILWAY_API_TOKEN,'POST',{query,variables});
  if(result.errors?.length)throw new Error('Railway rejected request');
  return result.data;
}
async function poll(check,label) {
  for(let n=0;n<90;n++) {const state=await check();if(state===true)return; if(state===false)throw new Error(`${label} failed`);await wait(10000);}
  throw new Error(`${label} timed out`);
}
async function deployRailway(sha) {
  const vars={serviceId:process.env.RAILWAY_SERVICE_ID,environmentId:process.env.RAILWAY_ENVIRONMENT_ID,commitSha:sha};
  const result=await railway('mutation($serviceId:String!,$environmentId:String!,$commitSha:String!){serviceInstanceDeployV2(serviceId:$serviceId,environmentId:$environmentId,commitSha:$commitSha)}',vars);
  const id=result.serviceInstanceDeployV2;
  if(typeof id!=='string')throw new Error('No Railway deployment ID returned');
  await poll(async()=>{
    const {deployment}=await railway('query($id:String!){deployment(id:$id){status}}',{id});
    if(deployment.status==='SUCCESS')return true;
    if(['FAILED','CRASHED','REMOVED','CANCELED','SKIPPED'].includes(deployment.status))return false;
  },'Railway deployment');
}
async function deployPortal(sha) {
  const repository=await gh('');
  const result=await vercel('/v13/deployments','POST',{name:'future-jobs-pro-ai-z32m',project:process.env.VERCEL_PROJECT_ID,target:'production',gitSource:{type:'github',repoId:repository.id,ref:sha}});
  await poll(async()=>{
    const deployment=await vercel(`/v13/deployments/${result.id}`);
    if(deployment.readyState==='READY')return true;
    if(['ERROR','CANCELED'].includes(deployment.readyState))return false;
  },'Portal deployment');
}
async function verifyHealth() {
  const response=await fetch('https://future-jobs-pro-ai-production.up.railway.app/api/health',{signal:AbortSignal.timeout(15000)});
  if(!response.ok || (await response.json()).status!=='healthy')throw new Error('Post-deployment health failed');
}
// Credential checks happen before any publication or deployment.
for(const key of ['GH_TOKEN',...(autoDeploy?['RAILWAY_API_TOKEN','RAILWAY_SERVICE_ID','RAILWAY_ENVIRONMENT_ID','VERCEL_TOKEN','VERCEL_PROJECT_ID','VERCEL_TEAM_ID']:[])]){
  if(!process.env[key])throw new Error(`Missing ${key}`);
}
// Read the actual live baseline on every repair. This permits successive
// verified repairs without granting the worker repository-variable write access.
// A newer, failed or unfinished deployment blocks publication conservatively.
async function verifyProductionBaseline() {
  const {serviceInstance}=await railway('query($serviceId:String!,$environmentId:String!){serviceInstance(serviceId:$serviceId,environmentId:$environmentId){latestDeployment{id status meta}}}',{serviceId:process.env.RAILWAY_SERVICE_ID,environmentId:process.env.RAILWAY_ENVIRONMENT_ID});
  const active=serviceInstance?.latestDeployment;
  const portal=await vercel('/v13/deployments/future-jobs-pro-ai-z32m.vercel.app');
  if(active?.status!=='SUCCESS' || active.meta?.commitHash!==base || portal.readyState!=='READY' || portal.meta?.githubCommitSha!==base || portal.projectId!==process.env.VERCEL_PROJECT_ID) {
    throw new Error('Production baseline differs from requested source or is not healthy');
  }
  await verifyHealth();
}
if(autoDeploy)await verifyProductionBaseline();
const branches=autoDeploy?[sourceBranch,portalBranch]:[sourceBranch];
for(const branch of branches){const ref=await gh(`git/ref/heads/${branch}`);if(ref.object.sha!==base)throw new Error('Source changed since repair was requested; request a new repair');}
const parent=await gh(`git/commits/${base}`);
const tree=await gh('git/trees','POST',{base_tree:parent.tree.sha,tree:patch.files.map(f=>({path:f.path,mode:'100644',type:'blob',content:f.content}))});
const commit=await gh('git/commits','POST',{message:`fix: Lucy verified ${scope} repair`,tree:tree.sha,parents:[base]});
// No generated code executes in this privileged job. Git arguments are fixed
// except for validated SHA/ref names. Atomic compare-and-swap protects both refs.
const auth=Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64');
const env={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:`AUTHORIZATION: basic ${auth}`};
const git=args=>execFileSync('git',args,{env,stdio:'pipe'});
git(['fetch','--no-tags','origin',commit.sha]);
if(autoDeploy)git(['push','--atomic',...branches.map(b=>`--force-with-lease=refs/heads/${b}:${base}`),'origin',...branches.map(b=>`${commit.sha}:refs/heads/${b}`)]);
if(native || review) {
  const candidate=`lucy-repair/${review?'review': 'mobile'}-${commit.sha.slice(0,12)}`;
  await gh('git/refs','POST',{ref:`refs/heads/${candidate}`,sha:commit.sha});
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`review_required=${review}\n`);
  console.log(`${review?'Owner review required.':'Native build required.'} Candidate ${candidate} committed: ${commit.sha}. No production deployment or store submission performed.`);

} else {
  try {
    const outcomes=await Promise.allSettled([deployRailway(commit.sha),deployPortal(commit.sha)]);
    outcomes.forEach((r,i)=>{if(r.status==='rejected')console.error(`${i===0?'Railway':'Vercel'} deployment failed: ${r.reason?.message || 'provider error'}`);});
    if(outcomes.some(r=>r.status==='rejected'))throw new Error('Deployment did not complete successfully');
    await verifyHealth();
    console.log(`Verified deployment: ${commit.sha}. Incident requires affected-workflow verification.`);
  } catch(error) {
    // Roll back only refs still pointing at this repair. Never overwrite a later human change.
    try {
      git(['push','--atomic',...branches.map(b=>`--force-with-lease=refs/heads/${b}:${commit.sha}`),'origin',...branches.map(b=>`${base}:refs/heads/${b}`)]);
      const rollback=await Promise.allSettled([deployRailway(base),deployPortal(base)]);
      rollback.forEach((r,i)=>{if(r.status==='rejected')console.error(`${i===0?'Railway':'Vercel'} rollback failed: ${r.reason?.message || 'provider error'}`);});
      if(rollback.some(r=>r.status==='rejected'))throw new Error('Rollback failed');
      await verifyHealth();
      console.error('Repair deployment failed; previous source redeployed successfully.');
    } catch {console.error('Rollback could not be verified. Manual recovery is required.');}
    process.exitCode=1;
  }
}
