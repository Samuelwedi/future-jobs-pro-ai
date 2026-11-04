import { pathToFileURL } from 'node:url';
// Read-only checks. Never print provider responses or credentials.
export async function preflight(env = process.env, request = fetch) {
  const checks = [];
  async function check(name, fn) {
    try { await fn(); checks.push({name, ok:true}); }
    catch (error) { checks.push({name, ok:false, reason:error.message}); }
  }
  const required = key => { if (!env[key]?.trim()) throw new Error(`Missing ${key}`); return env[key]; };
  async function json(url, token, body, projectToken=false) {
    const r = await request(url, {method:body?'POST':'GET',headers:{...(projectToken?{'Project-Access-Token':token}:{Authorization:`Bearer ${token}`}), 'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if (!r.ok) throw new Error(`Provider HTTP ${r.status}`);
    return r.json();
  }
  await check('GPT repair credential configured', async()=>{required('LUCY_OPENAI_API_KEY');});
  await check('Railway deployment access and baseline', async()=>{
    const token=required('RAILWAY_API_TOKEN');
    const body={query:'query($serviceId:String!,$environmentId:String!){serviceInstance(serviceId:$serviceId,environmentId:$environmentId){latestDeployment{id status meta}}}',variables:{serviceId:required('RAILWAY_SERVICE_ID'),environmentId:required('RAILWAY_ENVIRONMENT_ID')}};
    let data=await json('https://backboard.railway.com/graphql/v2',token,body);
    if(data.errors?.length)data=await json('https://backboard.railway.com/graphql/v2',token,body,true);
    if(data.errors?.length)throw new Error('Railway rejected deployment credential');
    const d=data.data?.serviceInstance?.latestDeployment;
    if(d?.status!=='SUCCESS'||d.meta?.commitHash!==env.BASE_SHA)throw new Error('Deploy the requested source commit to Railway first');
  });
  await check('Vercel deployment access and baseline', async()=>{
    const d=await json(`https://api.vercel.com/v13/deployments/future-jobs-pro-ai-z32m.vercel.app?teamId=${encodeURIComponent(required('VERCEL_TEAM_ID'))}`,required('VERCEL_TOKEN'));
    if(d.readyState!=='READY'||d.meta?.githubCommitSha!==env.BASE_SHA||d.projectId!==required('VERCEL_PROJECT_ID'))throw new Error('Deploy the requested source commit to the portal first');
  });
  return checks;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const checks=await preflight();
 for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'}: ${c.name}${c.reason?` — ${c.reason}`:''}`);
 if(checks.some(c=>!c.ok))process.exitCode=1;
}
