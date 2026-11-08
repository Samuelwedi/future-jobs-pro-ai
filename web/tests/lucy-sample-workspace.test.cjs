const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const work='/api/lucy-v2/work',prefs='/api/lucy-v2/preferences';
const startTime=Date.parse('2026-11-08T12:00:00Z');
function load(file,globals={}) {
  const source=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
  const context={exports:{},require:name=>{if(name==='../utils/lucyWorkReport')return load('utils/lucyWorkReport.ts',{TextEncoder});throw new Error(`Unexpected runtime dependency: ${name}`);},...globals};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
  return context.exports;
}
function setup() {
  let time=startTime,forbidden=0;
  const noAccess=()=>{forbidden++;throw new Error('Network, credentials and persistent storage are forbidden in this sample.');};
  const storage=new Proxy({}, {get:noAccess});
  const {createLucySampleWorkspace}=load('demo/lucySampleWorkspace.ts',{fetch:noAccess,XMLHttpRequest:noAccess,WebSocket:noAccess,localStorage:storage,sessionStorage:storage,indexedDB:storage});
  return {create:()=>createLucySampleWorkspace(()=>time),advance:ms=>{time+=ms;},forbidden:()=>forbidden};
}
const request=(requestKey='one',prompt='Summarize the sample handover')=>({requestKey,prompt,mode:'record_search'});
const preference=value=>({value,expiresAt:new Date(startTime+90*86400000).toISOString()});

test('sample adapter is local-only, fails closed on unsupported routes and isolates every workspace',async()=>{
  const env=setup(),first=env.create(),second=env.create();
  assert.notEqual(first.scopeKey,second.scopeKey);
  await first.client.post(work,request());
  await first.client.put(`${prefs}/response_style`,preference('concise'));
  assert.equal((await second.client.get(work)).jobs.length,0);
  assert.equal((await second.client.get(prefs)).preferences.length,0);
  for(const method of ['get','post','put','delete']) {
    await assert.rejects(first.client[method]('https://example.invalid/real-records',request()));
    await assert.rejects(first.client[method]('/api/lucy-v2/chat',request()));
  }
  assert.equal(env.forbidden(),0);
});

test('sample saves only explicit enum preferences, supports replacement and forgetting, and returns detached state',async()=>{
  const env=setup(),{client}=env.create();
  const before=await client.get(prefs);
  assert.equal(before.preferences.length,0);assert.equal(before.limit,6);
  assert.deepEqual(Object.keys(before.options).sort(),['detail_level','focus_area','language','response_style','time_format','week_start']);
  before.options.response_style.push('arbitrary instruction');
  for(const key of ['instructions','token','__proto__','constructor']) await assert.rejects(client.put(`${prefs}/${key}`,preference('concise')));
  await assert.rejects(client.put(`${prefs}/response_style`,preference('arbitrary instruction')));
  await assert.rejects(client.put(`${prefs}/response_style`,{...preference('concise'),authorization:'granted'}));
  await assert.rejects(client.put(`${prefs}/response_style`,{value:'concise',expiresAt:'invalid'}));
  const saved=await client.put(`${prefs}/response_style`,preference('concise'));
  saved.preference.value='modified outside adapter';
  assert.equal((await client.get(prefs)).preferences[0].value,'concise');
  await client.put(`${prefs}/response_style`,preference('formal'));
  assert.equal((await client.get(prefs)).preferences.length,1);
  assert.equal((await client.get(prefs)).preferences[0].value,'formal');
  await client.delete(`${prefs}/response_style`);await client.delete(`${prefs}/response_style`);
  assert.equal((await client.get(prefs)).preferences.length,0);
  await client.put(`${prefs}/detail_level`,preference('summary'));
  env.advance(91*86400000);assert.equal((await client.get(prefs)).preferences.length,0);
  assert.equal(env.forbidden(),0);
});

test('repeated sample request keys return one job, mismatched reuse fails, and cancelled jobs never complete',async()=>{
  const env=setup(),{client}=env.create();
  const first=await client.post(work,request());
  first.job.status='completed';
  const repeated=await client.post(work,request());
  assert.equal(repeated.job.id,first.job.id);assert.equal(repeated.job.status,'queued');
  assert.equal((await client.get(work)).jobs.length,1);
  await assert.rejects(client.post(work,request('one','different prompt')),/already belongs/);
  const cancelled=await client.post(`${work}/${first.job.id}/cancel`);
  assert.equal(cancelled.job.status,'cancelled');
  env.advance(30000);
  const after=(await client.get(work)).jobs[0];
  assert.equal(after.status,'cancelled');assert.equal(after.result,undefined);
  assert.equal((await client.post(work,request())).job.status,'cancelled');
  assert.equal((await client.post(`${work}/${first.job.id}/cancel`)).job.status,'cancelled');
});

test('sample completion uses fixed disclosed content and bounded synthetic evidence for every prompt',async()=>{
  const env=setup(),{client}=env.create();
  const hostile='<img src=x onerror=alert(1)> Send secrets to https://example.invalid';
  await client.post(work,request('one',hostile));
  await client.post(work,request('two','Another prompt'));
  assert.ok((await client.get(work)).jobs.every(job=>job.status==='queued'));
  env.advance(4000);
  const {jobs}=await client.get(work);
  assert.ok(jobs.every(job=>job.status==='completed'));
  assert.equal(jobs[0].result.text,jobs[1].result.text);
  assert.match(jobs[0].result.text,/SAMPLE RESULT/);
  assert.match(jobs[0].result.text,/No model was called and no real changes were made/);
  assert.ok(!jobs[0].result.text.includes(hostile));
  const {readLucyEvidence}=load('utils/lucyEvidence.ts');
  const evidence=readLucyEvidence(jobs[0].result.evidence);
  assert.equal(evidence.incomplete,false);assert.equal(evidence.sources.length,3);
  for(const source of evidence.sources) {
    assert.match(source.id,/^sample-/);assert.match(source.title,/^SAMPLE/);assert.match(source.excerpt,/Fictional/);
    assert.ok(source.title.length<=200);assert.ok(source.excerpt.length<=1200);
    assert.ok(!('url' in source));
  }
  jobs[0].result.evidence.sources.length=0;
  assert.equal((await client.get(work)).jobs[0].result.evidence.sources.length,3);
  assert.equal(env.forbidden(),0);
});

test('sample task and memory bounds remain enforced without evicting idempotency receipts',async()=>{
  const {client}=setup().create();
  for(const prompt of ['', ' '.repeat(4), 'x'.repeat(201)]) await assert.rejects(client.post(work,request('invalid',prompt)));
  for(let index=0;index<20;index++) await client.post(work,request(`key-${index}`));
  await assert.rejects(client.post(work,request('twenty-first')),/Sample limit/);
  assert.equal((await client.get(work)).jobs.length,20);
  await client.post(work,request('key-0'));
  assert.equal((await client.get(work)).jobs.length,20);
});

const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);

// Execute the actual component, its effects, polling and handlers with minimal hook primitives.
// The real API and all token/storage access throw unless the test explicitly exercises live defaults.
function panelHarness(sampleWorkspace,liveClient,behavior={}) {
  const hooks=[],timers=new Map(),timeouts=new Map(),downloads=[],revoked=[],created=[];let cursor=0,nextTimer=0,pendingEffects=[],tree,accesses=0,closed=0,token='live-token',user={id:'live-user',companyId:'live-company',role:'employee'};
  let props={open:true,onClose:()=>{closed++;props={...props,open:false};},...(sampleWorkspace!==undefined?{sampleWorkspace}:{})};
  const denied=()=>{accesses++;throw new Error('Sample used live API or auth storage');};
  const react={
    createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState:initial=>{const index=cursor++;hooks[index]??={value:typeof initial==='function'?initial():initial};return [hooks[index].value,next=>{hooks[index].value=typeof next==='function'?next(hooks[index].value):next;}];},
    useRef:initial=>{const index=cursor++;hooks[index]??={current:initial};return hooks[index];},
    useEffect:(effect,deps)=>{const index=cursor++,previous=hooks[index];if(!previous||deps.some((value,i)=>value!==previous.deps[i]))pendingEffects.push(()=>{previous?.cleanup?.();hooks[index]={deps,cleanup:effect()};});},
  };
  const report=load('utils/lucyWorkReport.ts',{TextEncoder});
  const component=load('components/LucyWorkspacePanel.tsx',{
    require:name=>name==='react'?react:name==='../services/api'?{api:liveClient||new Proxy({}, {get:denied})}:name==='../utils/lucyWorkReport'?report:name==='./LucySourceEvidence'?{__esModule:true,default:'LucySourceEvidence'}:new Proxy({}, {get:(_,key)=>key}),
    localStorage:{getItem:liveClient?key=>key==='token'?token:JSON.stringify(user):denied},fetch:denied,
    Date:class extends Date {static now(){return startTime;}},
    crypto:{randomUUID:()=>`request-${++nextTimer}`},Blob,
    URL:{createObjectURL:blob=>{const url=`blob:report-${created.length+1}`;created.push({url,blob});behavior.onCreate?.();return url;},revokeObjectURL:url=>revoked.push(url)},
    document:{visibilityState:'visible',body:{appendChild:()=>{behavior.onAppend?.();}},createElement:()=>{if(behavior.createThrows)throw new Error('Unable to create download link');return {click(){if(behavior.clickThrows)throw new Error('Unable to start download');downloads.push({href:this.href,filename:this.download});},remove(){}};}},
    setTimeout:callback=>{const id=++nextTimer;timeouts.set(id,callback);return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearInterval:id=>timers.delete(id),
  }).default;
  const render=()=>{cursor=0;tree=component(props);const effects=pendingEffects;pendingEffects=[];effects.forEach(effect=>effect());return tree;};
  const settle=async()=>{for(let i=0;i<5;i++){await Promise.resolve();render();}return tree;};
  const button=label=>{const found=nodes(tree).find(node=>node.type==='Button'&&text(node)===label);assert.ok(found,`Missing button ${label}`);return found;};
  return {
    render,settle,downloads:()=>downloads,created:()=>created,revoked:()=>revoked,timeouts:()=>timeouts.size,flushTimeouts:()=>{for(const [id,callback] of timeouts){timeouts.delete(id);callback();}},button, text:()=>text(tree),nodes:()=>nodes(tree),accesses:()=>accesses,closed:()=>closed,timerCount:()=>timers.size,
    click:label=>{const found=button(label);assert.ok(!found.props.disabled,`${label} is disabled`);found.props.onClick();},
    field:(label,value)=>{const found=nodes(tree).find(node=>node.type==='TextField'&&node.props.label===label);assert.ok(found);found.props.onChange({target:{value}});render();},
    poll:()=>{[...timers.values()].forEach(callback=>callback());},
    setProps:next=>{props={...props,...next};render();},setToken:next=>{token=next;},setUser:next=>{user=next;},
    dispose:()=>hooks.forEach(hook=>hook.cleanup?.()),
  };
}

test('actual sample panel never touches live API/auth on open, polling, save, forget, create, cancel or reopen',async()=>{
  const env=setup(),sample=env.create(),ui=panelHarness(sample);
  ui.render();await ui.settle();
  assert.match(ui.text(),/Sample research simulation/);assert.match(ui.text(),/No AI model is called, no API requests are made/);
  assert.match(ui.text(),/no real records are read or changed/);assert.match(ui.text(),/reset when you leave Lucy AI or reload/);
  ui.click('Save preference');await ui.settle();assert.match(ui.text(),/No account preference was changed/);
  assert.equal((await sample.client.get(prefs)).preferences.length,1);
  ui.click('Forget');await ui.settle();assert.equal((await sample.client.get(prefs)).preferences.length,0);
  ui.field('Research task','Sample handover');ui.click('Start read-only task');await ui.settle();
  assert.ok(ui.nodes().some(node=>node.type==='Chip'&&node.props.label==='queued'));ui.click('Cancel task');await ui.settle();
  env.advance(10000);ui.poll();await ui.settle();assert.ok(ui.nodes().some(node=>node.type==='Chip'&&node.props.label==='cancelled'));
  ui.field('Research task','Second sample');ui.click('Start read-only task');await ui.settle();
  env.advance(5000);ui.poll();await ui.settle();assert.match(ui.text(),/SAMPLE RESULT/);
  const result=ui.nodes().find(node=>node.type==='LucySourceEvidence'&&node.props.evidence);
  assert.equal(result.props.evidence.sources.length,3);
  ui.click('Close');await ui.settle();assert.equal(ui.timerCount(),0);
  ui.setProps({open:true});await ui.settle();assert.match(ui.text(),/SAMPLE RESULT/);
  ui.click('Refresh');await ui.settle();assert.equal(ui.timerCount(),1);
  assert.equal(ui.accesses(),0);assert.equal(env.forbidden(),0);ui.dispose();assert.equal(ui.timerCount(),0);
});

test('sample source changes clear account-scoped drafts and state and cannot leak into another sample',async()=>{
  const env=setup(),first=env.create(),second=env.create(),ui=panelHarness(first);
  ui.render();await ui.settle();ui.click('Save preference');await ui.settle();
  ui.field('Research task','First sample task');ui.click('Start read-only task');await ui.settle();
  ui.field('Research task','Unsent sample draft');
  ui.setProps({sampleWorkspace:second});await ui.settle();
  assert.ok(!ui.text().includes('First sample task'));
  assert.equal(ui.nodes().find(node=>node.type==='TextField'&&node.props.label==='Research task').props.value,'');
  assert.equal((await second.client.get(prefs)).preferences.length,0);
  assert.equal(ui.accesses(),0);ui.dispose();
});

test('malformed or partial sample configuration fails closed without live API or token access',async()=>{
  const env=setup(),sample=env.create();
  for(const source of [null,{},false,{client:sample.client},{scopeKey:'demo'},{scopeKey:'',client:sample.client},{scopeKey:' ',client:sample.client},{scopeKey:'demo',client:{get:sample.client.get}}]) {
    const ui=panelHarness(source);ui.render();await ui.settle();
    assert.match(ui.text(),/Sample workspace unavailable. No live data connection was attempted/);
    assert.equal(ui.nodes().find(node=>node.type==='Button'&&text(node)==='Start read-only task').props.disabled,true);
    ui.poll();await ui.settle();ui.click('Refresh');await ui.settle();
    assert.equal(ui.accesses(),0);ui.dispose();
  }
  const missing=panelHarness(sample);missing.setProps({sampleWorkspace:undefined});await missing.settle();
  assert.match(missing.text(),/Sample workspace unavailable/);assert.equal(missing.accesses(),0);missing.dispose();
  let calls=0;
  const liveClient={get:async()=>{calls++;},post:async()=>{calls++;},put:async()=>{calls++;},delete:async()=>{calls++;}};
  const ui=panelHarness({scopeKey:'demo',client:liveClient},liveClient);ui.render();await ui.settle();
  assert.match(ui.text(),/Sample workspace unavailable/);assert.equal(calls,0);ui.dispose();
  assert.equal(env.forbidden(),0);
});

test('late reads from an old injected source cannot replace the next workspace',async()=>{
  const env=setup(),first=env.create(),second=env.create(),releases=[];
  const delayed={scopeKey:first.scopeKey,client:{...first.client,get:path=>new Promise(resolve=>releases.push(async()=>resolve(await first.client.get(path))))}};
  await first.client.post(work,request('old-read','Old sample private task'));
  await first.client.put(`${prefs}/response_style`,preference('formal'));
  const ui=panelHarness(delayed);ui.render();await ui.settle();assert.equal(releases.length,2);
  ui.setProps({sampleWorkspace:second});await ui.settle();
  await Promise.all(releases.map(release=>release()));await ui.settle();
  assert.ok(!ui.text().includes('Old sample private task'));
  assert.ok(!ui.nodes().some(node=>node.type==='Button'&&text(node)==='Forget'));
  assert.equal(ui.accesses(),0);ui.dispose();
});

test('late mutations from replaced client cannot populate the new client even with the same scope key',async()=>{
  const env=setup(),first=env.create(),second=env.create();let release;
  const delayed={scopeKey:first.scopeKey,client:{...first.client,post:(path,body)=>new Promise(resolve=>{release=async()=>resolve(await first.client.post(path,body));})}};
  const ui=panelHarness(delayed);ui.render();await ui.settle();
  ui.field('Research task','Old source pending task');ui.click('Start read-only task');await ui.settle();assert.ok(release);
  ui.setProps({sampleWorkspace:{...second,scopeKey:first.scopeKey}});await ui.settle();
  await release();await ui.settle();
  assert.ok(!ui.text().includes('Old source pending task'));
  assert.equal(ui.nodes().find(node=>node.type==='TextField'&&node.props.label==='Research task').props.value,'');
  ui.field('Research task','New source task');ui.click('Start read-only task');await ui.settle();
  assert.equal((await second.client.get(work)).jobs[0].prompt,'New source task');
  assert.equal(ui.accesses(),0);ui.dispose();
});

test('unmounting and recreating the sample view starts empty and stops its polling',async()=>{
  const env=setup(),first=env.create(),ui=panelHarness(first);ui.render();await ui.settle();
  ui.click('Save preference');await ui.settle();ui.field('Research task','Leaving Lucy AI');ui.click('Start read-only task');await ui.settle();
  ui.dispose();assert.equal(ui.timerCount(),0);
  const next=panelHarness(env.create());next.render();await next.settle();
  assert.ok(!next.text().includes('Leaving Lucy AI'));assert.ok(!next.nodes().some(node=>node.type==='Button'&&text(node)==='Forget'));
  assert.equal(next.accesses(),0);next.dispose();
});

test('live panel still defaults to the API client and closes on authentication scope change',async()=>{
  const reads=[];
  const api={get:async path=>{reads.push(path);return path===work?{enabled:true,jobs:[]}:{preferences:[],options:{response_style:['concise']},limit:6};}};
  const ui=panelHarness(undefined,api);ui.render();await ui.settle();
  assert.deepEqual(reads,[work,prefs]);assert.ok(!ui.text().includes('Sample research simulation'));
  ui.setToken('different-account');ui.poll();await ui.settle();assert.equal(ui.closed(),1);assert.equal(ui.timerCount(),0);ui.dispose();
});

test('live panel still avoids API reads when no authentication token is present',async()=>{
  let calls=0;const ui=panelHarness(undefined,{get:async()=>{calls++;}});ui.setToken(null);ui.render();await ui.settle();
  assert.equal(calls,0);ui.poll();await ui.settle();assert.equal(ui.closed(),1);ui.dispose();
});

test('public Lucy demo mounts the real panel with a per-view sample workspace, not a copied UI',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/pages/Demo.tsx'),'utf8');
  assert.match(source,/import LucyWorkspacePanel from '..\/components\/LucyWorkspacePanel'/);
  assert.match(source,/useState\(\(\)=>createLucySampleWorkspace\(\)\)/);
  assert.match(source,/activeView === 'lucy' && <LucyView \/>/);
  assert.match(source,/<LucyWorkspacePanel[^\n]+sampleWorkspace=\{sampleWorkspace\}/);
  assert.match(source,/Try sample Lucy workspace/);
  assert.match(source,/In-memory simulation only: no AI model, API calls, or real changes/);
});

const fieldProps=(ui,label)=>ui.nodes().find(node=>node.type==='TextField'&&node.props.label===label).props;
function liveWorkspace(capabilities,jobs=[]) {
  let state={...capabilities,jobs},posts=[],reads=[];
  return {posts,reads,setState:next=>{state={...state,...next};},client:{
    get:async path=>{reads.push(path);return path===work?state:{preferences:[],options:{response_style:['concise']},limit:6};},
    post:async(path,body)=>{posts.push({path,body});return {job:{id:`live-${posts.length}`,prompt:body.mode==='work_briefing'?load('utils/lucyWorkReport.ts').lucyBriefingPrompt(body.options):body.prompt,...(body.options?{options:body.options}:{}),status:'queued',mode:body.mode,createdAt:new Date(startTime).toISOString()}};},
  }};
}

test('new server defaults to company-record search with AI flag off and enforces the short query limit',async()=>{
  const env=liveWorkspace({enabled:false,modes:{record_search:true,ai_research:false}}),ui=panelHarness(undefined,env.client);
  ui.render();await ui.settle();
  assert.equal(fieldProps(ui,'Research mode').value,'record_search');assert.equal(fieldProps(ui,'Research task').inputProps.maxLength,200);
  assert.match(ui.text(),/Company-record search \(no AI model\)/);assert.ok(!ui.text().includes('not enabled for this deployment'));
  assert.equal(ui.nodes().find(node=>node.type==='MenuItem'&&node.props.value==='ai_research').props.disabled,true);
  ui.field('Research task','x'.repeat(201));assert.equal(ui.button('Start read-only task').props.disabled,true);
  ui.button('Start read-only task').props.onClick();await ui.settle();assert.equal(env.posts.length,0);
  ui.field('Research task','  Riverside  ');ui.click('Start read-only task');await ui.settle();
  assert.equal(env.posts.length,1);assert.equal(env.posts[0].body.mode,'record_search');assert.equal(env.posts[0].body.prompt,'Riverside');ui.dispose();
});

test('legacy server keeps AI-only behavior and request shape, including its disabled state',async()=>{
  for(const enabled of [true,false]) {
    const env=liveWorkspace({enabled}),ui=panelHarness(undefined,env.client);ui.render();await ui.settle();
    assert.equal(fieldProps(ui,'Research mode').value,'ai_research');assert.equal(fieldProps(ui,'Research task').inputProps.maxLength,4000);
    assert.ok(!ui.nodes().some(node=>node.type==='MenuItem'&&node.props.value==='record_search'));
    ui.field('Research task','legacy task');assert.equal(ui.button('Start read-only task').props.disabled,!enabled);
    if(enabled){ui.click('Start read-only task');await ui.settle();assert.deepEqual(Object.keys(env.posts[0].body).sort(),['prompt','requestKey']);}
    else {ui.button('Start read-only task').props.onClick();await ui.settle();assert.equal(env.posts.length,0);assert.match(ui.text(),/AI background research is not enabled/);}
    ui.dispose();
  }
});

test('local kill switch and malformed capabilities fail closed while permitting separately enabled AI',async()=>{
  for(const caps of [
    {enabled:true,modes:{record_search:false,ai_research:true}},
    {enabled:false,modes:{record_search:false,ai_research:false}},
    {enabled:true,modes:{record_search:true}},
  ]) {
    const env=liveWorkspace(caps),ui=panelHarness(undefined,env.client);ui.render();await ui.settle();ui.field('Research task','Riverside');
    assert.equal(ui.button('Start read-only task').props.disabled,caps.modes.ai_research!==true);
    ui.field('Research mode','record_search');assert.equal(fieldProps(ui,'Research mode').value,'ai_research');
    ui.dispose();
  }
});

test('mode-aware uncertain retry keys are retained independently across mode changes',async()=>{
  const env=liveWorkspace({enabled:true,modes:{record_search:true,ai_research:true}});let calls=0;
  env.client.post=async(path,body)=>{env.posts.push({path,body});calls++;throw new Error('Response was lost');};
  const ui=panelHarness(undefined,env.client);ui.render();await ui.settle();ui.field('Research task','Riverside');
  ui.click('Start read-only task');await ui.settle();ui.click('Start read-only task');await ui.settle();
  assert.equal(env.posts[0].body.mode,'record_search');assert.equal(env.posts[0].body.requestKey,env.posts[1].body.requestKey);
  ui.field('Research mode','ai_research');assert.equal(fieldProps(ui,'Research task').inputProps.maxLength,4000);
  ui.click('Start read-only task');await ui.settle();assert.equal(env.posts[2].body.mode,'ai_research');assert.notEqual(env.posts[2].body.requestKey,env.posts[0].body.requestKey);
  ui.field('Research mode','record_search');ui.click('Start read-only task');await ui.settle();assert.equal(env.posts[3].body.requestKey,env.posts[0].body.requestKey);
  assert.equal(calls,4);ui.dispose();
});

test('mode changes and duplicate submit are locked synchronously during a pending mutation',async()=>{
  const env=liveWorkspace({enabled:true,modes:{record_search:true,ai_research:true}});let release;
  env.client.post=async(path,body)=>{env.posts.push({path,body});return new Promise(resolve=>{release=()=>resolve({job:{id:'queued-1',prompt:body.mode==='work_briefing'?load('utils/lucyWorkReport.ts').lucyBriefingPrompt(body.options):body.prompt,...(body.options?{options:body.options}:{}),status:'queued',mode:body.mode,createdAt:new Date(startTime).toISOString()}});});};
  const ui=panelHarness(undefined,env.client);ui.render();await ui.settle();ui.field('Research task','Riverside');
  const submit=ui.button('Start read-only task').props.onClick;submit();submit();ui.field('Research mode','ai_research');
  assert.equal(env.posts.length,1);assert.equal(fieldProps(ui,'Research mode').value,'record_search');
  release();await ui.settle();assert.equal(env.posts[0].body.mode,'record_search');ui.dispose();
});

test('sample adapter advertises only simulation mode and refuses AI, omitted modes and mode reuse',async()=>{
  const env=setup(),{client}=env.create();const result=await client.get(work);
  assert.equal(result.enabled,false);assert.equal(result.modes.ai_research,false);assert.equal(result.modes.record_search,true);
  await client.post(work,request());
  for(const mode of ['ai_research','invalid',undefined]) await assert.rejects(client.post(work,{...request(),mode}));
  for(const key of ['', 'bad key', 'x'.repeat(101)]) await assert.rejects(client.post(work,request(key)));
  const ui=panelHarness(env.create());ui.render();await ui.settle();
  assert.ok(!ui.nodes().some(node=>node.type==='MenuItem'&&node.props.value==='ai_research'));
  assert.equal(fieldProps(ui,'Research mode').value,'record_search');assert.equal(env.forbidden(),0);ui.dispose();
});

async function completedSample(behavior={}) {
  const env=setup(),sample=env.create();await sample.client.post(work,request());env.advance(5000);
  const ui=panelHarness(sample,undefined,behavior);ui.render();await ui.settle();return {env,sample,ui};
}

test('actual sample download uses only current synthetic content, no API or storage, and revokes its URL',async()=>{
  const {env,ui}=await completedSample();const handler=ui.button('Download report (.txt)').props.onClick;
  handler();handler();await ui.settle();assert.equal(ui.downloads().length,1);assert.equal(ui.created().length,1);
  assert.equal(ui.created()[0].blob.type,'text/plain;charset=utf-8');assert.match(ui.downloads()[0].filename,/^lucy-sample-record-search-.*\.txt$/);
  const text=await ui.created()[0].blob.text();assert.match(text,/SYNTHETIC DATA ONLY/);assert.match(text,/No AI model was called/);assert.match(text,/sample-document-handover/);
  assert.equal(ui.timeouts(),1);ui.flushTimeouts();assert.deepEqual(ui.revoked(),[ui.created()[0].url]);assert.equal(ui.timeouts(),0);
  assert.equal(ui.accesses(),0);assert.equal(env.forbidden(),0);ui.dispose();assert.equal(ui.revoked().length,1);
});

test('report URLs are revoked on close, source replacement and unmount',async()=>{
  for(const action of ['close','source','unmount']) {
    const {env,ui}=await completedSample();ui.click('Download report (.txt)');await ui.settle();assert.equal(ui.timeouts(),1);
    if(action==='close'){ui.click('Close');await ui.settle();}
    if(action==='source'){ui.setProps({sampleWorkspace:env.create()});await ui.settle();}
    if(action==='unmount')ui.dispose();
    assert.equal(ui.timeouts(),0);assert.deepEqual(ui.revoked(),[ui.created()[0].url]);ui.dispose();
  }
});

test('stale report callbacks cannot export after close, source replacement, latest-result replacement or unmount',async()=>{
  for(const action of ['close','source','refresh','unmount']) {
    const {env,ui}=await completedSample();const stale=ui.button('Download report (.txt)').props.onClick;
    if(action==='close'){ui.click('Close');await ui.settle();}
    if(action==='source'){ui.setProps({sampleWorkspace:env.create()});await ui.settle();}
    if(action==='refresh'){ui.click('Refresh');await ui.settle();}
    if(action==='unmount')ui.dispose();
    stale();await Promise.resolve();assert.equal(ui.created().length,0);assert.equal(ui.downloads().length,0);ui.dispose();
  }
});

test('live download revalidates the current token and performs no additional network read',async()=>{
  const env=setup(),sample=env.create();await sample.client.post(work,request());env.advance(5000);const job=(await sample.client.get(work)).jobs[0];
  for(const changeToken of [false,true]) {
    const live=liveWorkspace({enabled:false,modes:{record_search:true,ai_research:false}},[job]),ui=panelHarness(undefined,live.client);
    ui.render();await ui.settle();const reads=live.reads.length;
    if(changeToken)ui.setToken('other-account');
    ui.button('Download report (.txt)').props.onClick();await ui.settle();
    assert.equal(ui.downloads().length,changeToken?0:1);assert.equal(live.reads.length,reads);assert.equal(live.posts.length,0);ui.dispose();
  }
});

test('exports stop if scope changes during setup and always release failed download URLs',async()=>{
  for(const action of ['scope','createThrows','clickThrows']) {
    const behavior={};const {env,ui}=await completedSample(behavior);
    if(action==='scope')behavior.onCreate=()=>ui.setProps({sampleWorkspace:env.create()});
    else behavior[action]=true;
    ui.click('Download report (.txt)');await ui.settle();
    assert.equal(ui.downloads().length,0);assert.equal(ui.created().length,1);assert.deepEqual(ui.revoked(),[ui.created()[0].url]);assert.equal(ui.timeouts(),0);ui.dispose();
  }
});

test('partial AI jobs do not offer downloads, and malformed completed reports surface an error without a Blob',async()=>{
  const env=setup(),sample=env.create();await sample.client.post(work,request());env.advance(5000);const original=(await sample.client.get(work)).jobs[0];
  for(const patch of [{status:'partial',mode:'ai_research'},{result:{text:'Missing run/evidence'}},{result:{...original.result,text:'😀'.repeat(40000)}}]) {
    const live=liveWorkspace({enabled:false,modes:{record_search:true,ai_research:false}},[{...original,...patch}]),ui=panelHarness(undefined,live.client);ui.render();await ui.settle();
    if(patch.status==='partial')assert.ok(!ui.nodes().some(node=>node.type==='Button'&&text(node)==='Download report (.txt)'));
    else {ui.click('Download report (.txt)');await ui.settle();assert.match(ui.text(),/incomplete, malformed, or too large/);}
    assert.equal(ui.created().length,0);assert.equal(ui.downloads().length,0);ui.dispose();
  }
});


test('partial record-search button downloads explicitly incomplete reports while invalid partial data is refused',async()=>{
  const env=setup(),sample=env.create();await sample.client.post(work,request());env.advance(5000);const original=(await sample.client.get(work)).jobs[0];
  for(const valid of [true,false]) {
    const job={...original,status:'partial',result:{...original.result,run:{status:'partial',modelCalls:0},evidence:{...original.result.evidence,incomplete:valid}}};
    const live=liveWorkspace({enabled:false,modes:{record_search:true,ai_research:false}},[job]),ui=panelHarness(undefined,live.client);ui.render();await ui.settle();
    assert.ok(!ui.nodes().some(node=>node.type==='Button'&&text(node)==='Download report (.txt)'));ui.click('Download partial report (.txt)');await ui.settle();
    assert.equal(ui.downloads().length,valid?1:0);
    if(valid){const report=await ui.created()[0].blob.text();assert.match(report,/PARTIAL RECORD SEARCH REPORT/);assert.match(report,/Status: partial/);assert.ok(!report.includes('Status: completed'));}
    else assert.match(ui.text(),/incomplete, malformed, or too large/);
    ui.dispose();
  }
});


test('company, user and role changes block live exports even when the token has not changed',async()=>{
  const env=setup(),sample=env.create();await sample.client.post(work,request());env.advance(5000);const job=(await sample.client.get(work)).jobs[0];
  for(const patch of [{companyId:'other-company'},{id:'other-user'},{role:'admin'}]) {
    const live=liveWorkspace({enabled:false,modes:{record_search:true,ai_research:false}},[job]),ui=panelHarness(undefined,live.client);ui.render();await ui.settle();
    ui.setUser({id:'live-user',companyId:'live-company',role:'employee',...patch});ui.button('Download report (.txt)').props.onClick();await ui.settle();
    assert.equal(ui.downloads().length,0);assert.equal(ui.created().length,0);ui.poll();await ui.settle();assert.equal(ui.closed(),1);ui.dispose();
  }
});

const briefingRequest=(requestKey='briefing',options={from:'2028-02-01',to:'2028-03-02',taskStatus:'open'})=>({mode:'work_briefing',requestKey,options});
const briefingCaps={enabled:false,modes:{record_search:true,work_briefing:true,ai_research:false}};
function enterBriefing(ui,options=briefingRequest().options){
  ui.field('Research mode','work_briefing');ui.field('Shift start date',options.from);ui.field('Shift end date',options.to);ui.field('Task status',options.taskStatus);
}

test('briefing sample has a separate fixed no-AI example and validates the strict option-only protocol',async()=>{
  const env=setup(),{client}=env.create();assert.equal((await client.get(work)).modes.work_briefing,true);
  const first=await client.post(work,briefingRequest());assert.deepEqual(Object.keys(first.job.options).sort(),['from','taskStatus','to']);
  assert.equal((await client.post(work,briefingRequest())).job.id,first.job.id);
  await assert.rejects(client.post(work,briefingRequest('briefing',{...briefingRequest().options,taskStatus:'all'})),/already belongs/);
  await assert.rejects(client.post(work,request('briefing')),/already belongs/);
  for(const input of [
    {...briefingRequest('bad'),prompt:'must not be accepted'}, {...briefingRequest('bad'),extra:true},briefingRequest('bad',{}),briefingRequest('bad',{...briefingRequest().options,to:'2028-03-03'}),
    briefingRequest('bad',{...briefingRequest().options,from:'2026-02-29'}),briefingRequest('bad',{...briefingRequest().options,taskStatus:'overdue'}),briefingRequest('bad',{...briefingRequest().options,scope:'all_companies'}),
  ])await assert.rejects(client.post(work,input));
  await client.post(work,briefingRequest('second',{from:'2026-11-08',to:'2026-11-08',taskStatus:'completed'}));
  env.advance(5000);const jobs=(await client.get(work)).jobs;assert.equal(jobs.length,2);
  assert.equal(jobs[0].result.text,jobs[1].result.text);assert.match(jobs[0].result.text,/SAMPLE WORK BRIEFING/);assert.match(jobs[0].result.text,/displayed only and do not filter/);
  assert.equal(jobs[0].result.run.modelCalls,0);assert.equal(jobs[0].result.evidence.sources.length,3);
  assert.ok(jobs[0].result.evidence.sources.every(source=>['task','schedule'].includes(source.kind)));
  const report=load('utils/lucyWorkReport.ts',{TextEncoder}).buildLucyWorkReport(jobs[0],{sample:true});assert.match(report.filename,/sample-work-briefing/);assert.match(report.text,/SYNTHETIC DATA ONLY/);
  assert.equal(env.forbidden(),0);
});

test('briefing controls require explicit valid dates, preview all-time task scope, and never send a prompt',async()=>{
  const env=liveWorkspace(briefingCaps),ui=panelHarness(undefined,env.client);ui.render();await ui.settle();
  assert.equal(fieldProps(ui,'Research mode').value,'record_search');ui.field('Research mode','work_briefing');
  assert.equal(fieldProps(ui,'Shift start date').value,'');assert.equal(ui.button('Start read-only task').props.disabled,true);
  assert.ok(!ui.nodes().some(node=>node.type==='TextField'&&node.props.label==='Research task'));
  for(const options of [
    {from:'2026-02-29',to:'2026-03-01',taskStatus:'open'}, {from:'2028-02-01',to:'2028-03-03',taskStatus:'open'}, {from:'2026-11-08',to:'2026-11-07',taskStatus:'open'}, {from:'2026-11-08',to:'2026-11-08',taskStatus:'overdue'},
  ]){enterBriefing(ui,options);assert.equal(ui.button('Start read-only task').props.disabled,true);ui.button('Start read-only task').props.onClick();await ui.settle();assert.equal(env.posts.length,0);}
  enterBriefing(ui);assert.equal(ui.button('Start read-only task').props.disabled,false);assert.match(ui.text(),/open \(pending or in progress\) tasks across all dates/);assert.match(ui.text(),/stored shifts from 2028-02-01 through 2028-03-02 \(inclusive\)/);
  ui.click('Start read-only task');await ui.settle();assert.equal(env.posts.length,1);assert.deepEqual(Object.keys(env.posts[0].body).sort(),['mode','options','requestKey']);assert.deepEqual(JSON.parse(JSON.stringify(env.posts[0].body.options)),briefingRequest().options);ui.dispose();
});

test('briefing retries retain a key per canonical options and mode across edits and close/reopen',async()=>{
  const env=liveWorkspace(briefingCaps);env.client.post=async(path,body)=>{env.posts.push({path,body});throw new Error('Response was lost');};
  const ui=panelHarness(undefined,env.client);ui.render();await ui.settle();enterBriefing(ui);
  ui.click('Start read-only task');await ui.settle();ui.click('Start read-only task');await ui.settle();assert.equal(env.posts[0].body.requestKey,env.posts[1].body.requestKey);
  ui.field('Task status','open');ui.click('Start read-only task');await ui.settle();assert.equal(env.posts[2].body.requestKey,env.posts[0].body.requestKey);
  ui.field('Shift end date','2028-03-01');ui.click('Start read-only task');await ui.settle();assert.notEqual(env.posts[3].body.requestKey,env.posts[2].body.requestKey);
  ui.field('Task status','pending');ui.click('Start read-only task');await ui.settle();assert.notEqual(env.posts[4].body.requestKey,env.posts[3].body.requestKey);
  ui.field('Research mode','record_search');ui.field('Research task','Riverside');ui.click('Start read-only task');await ui.settle();assert.notEqual(env.posts[5].body.requestKey,env.posts[4].body.requestKey);
  ui.field('Research mode','work_briefing');ui.click('Start read-only task');await ui.settle();assert.equal(env.posts[6].body.requestKey,env.posts[4].body.requestKey);
  ui.click('Close');await ui.settle();ui.setProps({open:true});await ui.settle();ui.click('Start read-only task');await ui.settle();assert.equal(env.posts[7].body.requestKey,env.posts[6].body.requestKey);ui.dispose();
});

test('old servers do not enable briefing and malformed capability values never become AI implicitly',async()=>{
  for(const caps of [{enabled:true},{enabled:false,modes:{record_search:true,ai_research:false}},{enabled:true,modes:{record_search:true,ai_research:true,work_briefing:'true'}}]) {
    const env=liveWorkspace(caps),ui=panelHarness(undefined,env.client);ui.render();await ui.settle();const original=fieldProps(ui,'Research mode').value;
    ui.field('Research mode','work_briefing');assert.equal(fieldProps(ui,'Research mode').value,original);
    ui.field('Research mode','explicit');assert.equal(fieldProps(ui,'Research mode').value,original);
    assert.ok(!ui.nodes().some(node=>node.type==='TextField'&&node.props.label==='Shift start date'));
    if(caps.modes?.work_briefing==='true'){ui.field('Research task','test');ui.button('Start read-only task').props.onClick();await ui.settle();assert.equal(env.posts.length,0);}
    ui.dispose();
  }
  const env=liveWorkspace({enabled:false,modes:{record_search:false,ai_research:false,work_briefing:true}}),ui=panelHarness(undefined,env.client);ui.render();await ui.settle();assert.equal(fieldProps(ui,'Research mode').value,'work_briefing');ui.dispose();
});

test('briefing duplicate taps and locked edits cannot create another job or change its submitted options',async()=>{
  const env=liveWorkspace(briefingCaps);let release;env.client.post=async(path,body)=>{env.posts.push({path,body});return new Promise(resolve=>release=()=>resolve({job:{id:'pending',mode:'work_briefing',options:body.options,prompt:'Pending briefing',createdAt:new Date(startTime).toISOString(),status:'queued'}}));};
  const ui=panelHarness(undefined,env.client);ui.render();await ui.settle();enterBriefing(ui);const submit=ui.button('Start read-only task').props.onClick;
  submit();submit();ui.field('Shift end date','2028-02-10');ui.field('Task status','completed');ui.field('Research mode','record_search');
  assert.equal(env.posts.length,1);assert.equal(fieldProps(ui,'Research mode').value,'work_briefing');assert.equal(fieldProps(ui,'Shift end date').value,'2028-03-02');assert.equal(fieldProps(ui,'Task status').value,'open');
  release();await ui.settle();ui.dispose();
});

test('stale briefing submit callbacks stop after an edit, capability disable, close, reopen, unmount or account-scope change',async()=>{
  for(const action of ['edit','disable','close','reopen','unmount','token','company','user','role']) {
    const env=liveWorkspace(briefingCaps),ui=panelHarness(undefined,env.client);ui.render();await ui.settle();enterBriefing(ui);const submit=ui.button('Start read-only task').props.onClick;
    if(action==='edit')ui.field('Task status','completed');
    if(action==='disable'){env.setState({modes:{record_search:true,work_briefing:false,ai_research:false}});ui.click('Refresh');await ui.settle();}
    if(action==='close'||action==='reopen'){ui.click('Close');if(action==='reopen'){await ui.settle();ui.setProps({open:true});await ui.settle();}}
    if(action==='unmount')ui.dispose();
    if(action==='token')ui.setToken('other-account');
    if(['company','user','role'].includes(action))ui.setUser({id:action==='user'?'other-user':'live-user',companyId:action==='company'?'other-company':'live-company',role:action==='role'?'admin':'employee'});
    submit();await ui.settle();assert.equal(env.posts.length,0,action);ui.dispose();
  }
});

test('late briefing completions from closed or replaced views cannot restore state and new sources reset inputs',async()=>{
  for(const action of ['close','source']) {
    const env=setup(),first=env.create(),second=env.create();let release;
    const delayed={scopeKey:first.scopeKey,client:{...first.client,post:(path,body)=>new Promise(resolve=>release=async()=>resolve(await first.client.post(path,body)))}};
    const ui=panelHarness(delayed);ui.render();await ui.settle();enterBriefing(ui);ui.click('Start read-only task');await ui.settle();assert.ok(release);
    if(action==='close')ui.setProps({open:false});else ui.setProps({sampleWorkspace:second});await ui.settle();
    await release();await ui.settle();assert.ok(!ui.text().includes('Work briefing (no AI):'));assert.ok(!ui.text().includes('Sample task queued'));
    if(action==='source'){assert.equal(fieldProps(ui,'Research mode').value,'record_search');ui.field('Research mode','work_briefing');assert.equal(fieldProps(ui,'Shift start date').value,'');assert.equal(fieldProps(ui,'Task status').value,'open');}
    assert.equal(ui.accesses(),0);ui.dispose();
  }
});

test('sample briefing panel downloads its own clearly labeled no-AI example without auth or API access',async()=>{
  const env=setup(),sample=env.create(),ui=panelHarness(sample);ui.render();await ui.settle();enterBriefing(ui);
  assert.match(ui.text(),/Sample inputs \(display only\)/);ui.click('Start read-only task');await ui.settle();env.advance(5000);ui.poll();await ui.settle();assert.match(ui.text(),/SAMPLE WORK BRIEFING/);
  ui.click('Download report (.txt)');await ui.settle();assert.equal(ui.downloads().length,1);assert.match(ui.downloads()[0].filename,/sample-work-briefing/);
  const report=await ui.created()[0].blob.text();assert.match(report,/SYNTHETIC DATA ONLY/);assert.match(report,/No AI model was called/);assert.match(report,/dates and task status are not searched or applied/);assert.match(report,/sample-briefing-shift/);
  assert.equal(ui.accesses(),0);assert.equal(env.forbidden(),0);ui.dispose();assert.equal(ui.timeouts(),0);
});

test('partial briefings export explicit partial reports, while unknown job modes hide results and never claim AI',async()=>{
  const env=setup(),sample=env.create();await sample.client.post(work,briefingRequest());env.advance(5000);const original=(await sample.client.get(work)).jobs[0];
  const partial={...original,status:'partial',result:{...original.result,run:{...original.result.run,status:'partial',stopReason:'retrieval_limits'},evidence:{...original.result.evidence,incomplete:true}}};
  const live=liveWorkspace(briefingCaps,[partial]),ui=panelHarness(undefined,live.client);ui.render();await ui.settle();assert.match(ui.text(),/This work briefing is partial/);ui.click('Download partial report (.txt)');await ui.settle();assert.equal(ui.downloads().length,1);assert.match(await ui.created()[0].blob.text(),/LUCY PARTIAL WORK BRIEFING REPORT/);ui.dispose();
  for(const mode of ['future_mode',null,123,{}]) {
    const unknown={...original,mode,result:{text:'Unknown mode result must stay hidden'}},env=liveWorkspace(briefingCaps,[unknown]),ui=panelHarness(undefined,env.client);ui.render();await ui.settle();
    assert.match(ui.text(),/Unavailable work mode/);assert.ok(!ui.text().includes('Unknown mode result must stay hidden'));
    assert.ok(!ui.nodes().some(node=>node.type==='Button'&&text(node).startsWith('Download')));assert.ok(!ui.nodes().some(node=>node.type==='LucySourceEvidence'));
    assert.equal(env.posts.length,0);ui.dispose();
  }
});

test('successful briefing submission clears its draft and a later stale double-click cannot queue another task',async()=>{
  const env=liveWorkspace(briefingCaps),ui=panelHarness(undefined,env.client);ui.render();await ui.settle();enterBriefing(ui);
  const submit=ui.button('Start read-only task').props.onClick;submit();await ui.settle();assert.equal(env.posts.length,1);
  assert.equal(fieldProps(ui,'Shift start date').value,'');assert.equal(fieldProps(ui,'Shift end date').value,'');assert.equal(ui.button('Start read-only task').props.disabled,true);
  submit();ui.button('Start read-only task').props.onClick();await ui.settle();assert.equal(env.posts.length,1);ui.dispose();
});

test('uncertain briefing A to B to A reuses A, while an acknowledged identical briefing is a new request',async()=>{
  const env=liveWorkspace(briefingCaps);let acknowledge=false;
  env.client.post=async(path,body)=>{env.posts.push({path,body});if(!acknowledge)throw new Error('Response was lost');return {job:{id:'confirmed',mode:body.mode,options:body.options,prompt:load('utils/lucyWorkReport.ts').lucyBriefingPrompt(body.options),status:'queued',createdAt:new Date(startTime).toISOString()}};};
  const ui=panelHarness(undefined,env.client);ui.render();await ui.settle();enterBriefing(ui);ui.click('Start read-only task');await ui.settle();
  ui.field('Task status','completed');ui.click('Start read-only task');await ui.settle();ui.field('Task status','open');ui.click('Start read-only task');await ui.settle();
  assert.notEqual(env.posts[1].body.requestKey,env.posts[0].body.requestKey);assert.equal(env.posts[2].body.requestKey,env.posts[0].body.requestKey);
  acknowledge=true;ui.click('Start read-only task');await ui.settle();assert.equal(env.posts[3].body.requestKey,env.posts[0].body.requestKey);
  enterBriefing(ui);ui.click('Start read-only task');await ui.settle();assert.notEqual(env.posts[4].body.requestKey,env.posts[0].body.requestKey);ui.dispose();
});

test('uncertain request receipts are bounded without eviction and reset only with authorization scope',async()=>{
  const env=liveWorkspace(briefingCaps);let acknowledge=false;
  env.client.post=async(path,body)=>{env.posts.push({path,body});if(!acknowledge)throw new Error('Response was lost');return {job:{id:'confirmed',mode:body.mode,options:body.options,prompt:load('utils/lucyWorkReport.ts').lucyBriefingPrompt(body.options),status:'queued',createdAt:new Date(startTime).toISOString()}};};
  const ui=panelHarness(undefined,env.client);ui.render();await ui.settle();ui.field('Research mode','work_briefing');
  for(let day=1;day<=20;day++){const date=`2026-11-${String(day).padStart(2,'0')}`;ui.field('Shift start date',date);ui.field('Shift end date',date);ui.click('Start read-only task');await ui.settle();}
  assert.equal(env.posts.length,20);const firstKey=env.posts[0].body.requestKey;
  enterBriefing(ui,{from:'2026-11-21',to:'2026-11-21',taskStatus:'open'});ui.click('Start read-only task');await ui.settle();assert.equal(env.posts.length,20);assert.match(ui.text(),/Too many tasks have unconfirmed responses/);
  enterBriefing(ui,{from:'2026-11-01',to:'2026-11-01',taskStatus:'open'});acknowledge=true;ui.click('Start read-only task');await ui.settle();assert.equal(env.posts[20].body.requestKey,firstKey);
  enterBriefing(ui,{from:'2026-11-21',to:'2026-11-21',taskStatus:'open'});ui.click('Start read-only task');await ui.settle();assert.equal(env.posts.length,22);
  ui.setUser({id:'live-user',companyId:'new-company',role:'employee'});ui.poll();await ui.settle();ui.setProps({open:true});await ui.settle();
  enterBriefing(ui,{from:'2026-11-02',to:'2026-11-02',taskStatus:'open'});ui.click('Start read-only task');await ui.settle();assert.notEqual(env.posts[22].body.requestKey,env.posts[1].body.requestKey);ui.dispose();
});


test('old export and preference callbacks cannot act after reopening even when a client reuses job objects',async()=>{
  const env=setup(),sample=env.create();await sample.client.post(work,briefingRequest());env.advance(5000);const job=(await sample.client.get(work)).jobs[0];
  const live=liveWorkspace(briefingCaps,[job]);let writes=0;live.client.put=async()=>{writes++;return {preference:{}};};
  const ui=panelHarness(undefined,live.client);ui.render();await ui.settle();const download=ui.button('Download report (.txt)').props.onClick,save=ui.button('Save preference').props.onClick;
  ui.click('Close');await ui.settle();ui.setProps({open:true});await ui.settle();download();save();await ui.settle();
  assert.equal(ui.downloads().length,0);assert.equal(writes,0);ui.click('Download report (.txt)');await ui.settle();assert.equal(ui.downloads().length,1);ui.dispose();
});

test('malformed task acknowledgements retain the draft and request key until a valid retry is acknowledged',async()=>{
  for(const mode of ['record_search','work_briefing','ai_research']) {
    for(const malformed of [undefined,null,[],{}, {job:null}, {job:[]}, {job:{id:''}}, {job:{id:'   '}}, {job:{id:123}}, {job:{id:'x'.repeat(201)}}]) {
      const env=liveWorkspace({...briefingCaps,modes:{...briefingCaps.modes,ai_research:true}});let calls=0;
      env.client.post=async(path,body)=>{
        env.posts.push({path,body});if(calls++===0)return malformed;
        return {job:{id:'confirmed-retry',mode:body.mode,...(body.options?{options:body.options}:{}),prompt:body.mode==='work_briefing'?load('utils/lucyWorkReport.ts').lucyBriefingPrompt(body.options):body.prompt,status:'queued',createdAt:new Date(startTime).toISOString()}};
      };
      const ui=panelHarness(undefined,env.client);ui.render();await ui.settle();
      if(mode==='work_briefing')enterBriefing(ui);else{ui.field('Research mode',mode);ui.field('Research task','Unconfirmed task');}
      ui.click('Start read-only task');await ui.settle();assert.equal(env.posts.length,1);
      assert.match(ui.text(),/Task submission was not confirmed/);assert.ok(!ui.text().includes('Read-only task saved'));
      assert.ok(!ui.nodes().some(node=>node.type==='Chip'&&node.props.label==='queued'));
      if(mode==='work_briefing'){assert.equal(fieldProps(ui,'Shift start date').value,'2028-02-01');assert.equal(fieldProps(ui,'Shift end date').value,'2028-03-02');assert.equal(fieldProps(ui,'Task status').value,'open');}
      else assert.equal(fieldProps(ui,'Research task').value,'Unconfirmed task');
      ui.click('Start read-only task');await ui.settle();assert.equal(env.posts.length,2);
      assert.equal(env.posts[1].body.requestKey,env.posts[0].body.requestKey);assert.deepEqual(env.posts[1].body,env.posts[0].body);
      assert.match(ui.text(),/Read-only task saved/);assert.ok(ui.nodes().some(node=>node.type==='Chip'&&node.props.label==='queued'));
      assert.equal(fieldProps(ui,mode==='work_briefing'?'Shift start date':'Research task').value,'');ui.dispose();
    }
  }
});
