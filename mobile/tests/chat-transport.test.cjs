const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const owner={id:'owner',companyId:'company',role:'employee'};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(){let requestInterceptor,responseFailure,read=async key=>key==='userData'?JSON.stringify(owner):'token',online=async()=>true,response=async()=>({data:{success:true,message:{id:'msg'}}}),beforeSend=async()=>{},remove=async()=>{};const sent=[],queued=[];
 const client={interceptors:{request:{use:fn=>requestInterceptor=fn},response:{use:(_ok,fail)=>responseFailure=fail}}};
 for(const verb of ['get','post'])client[verb]=async(url,...args)=>{const [data,config]=verb==='post'?args:[undefined,args[0]];await beforeSend();const request={...config,headers:{...config?.headers}};await requestInterceptor(request);sent.push({url,data,config:request});try{return await response();}catch(e){e.config=request;return responseFailure(e);}};
 const context={exports:{},__DEV__:false,process:{env:{}},console:{warn:()=>{},error:()=>{}},FormData:class {append(){}},require:name=>{
 if(name==='axios')return {default:{create:()=>client}};
 if(name==='expo-secure-store')return {getItemAsync:(...args)=>read(...args),deleteItemAsync:()=>remove(),setItemAsync:async()=>{}};
 if(name==='react-native')return {Platform:{OS:'ios'}};
 if(name==='./offlineService')return {checkOnlineStatus:()=>online(),getOnlineStatus:()=>false,queueAction:async action=>queued.push(action),requiresOnlineConfirmation:url=>/^\/chat(?:\/|$)/.test(url)};
 if(name==='../utils/uploadMetadata')return {uploadMetadata:()=>({name:'file.pdf',type:'application/pdf'})};
 if(name==='expo-file-system/legacy')return {};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(process.env.CHAT_SOURCE_ROOT || path.join(__dirname,'..'),'src/services/api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const api=context.exports.api;api.token='token';return {api,sent,queued,get responseFailure(){return responseFailure;},set response(fn){response=fn;},set beforeSend(fn){beforeSend=fn;},set read(fn){read=fn;},set online(fn){online=fn;},set remove(fn){remove=fn;}};
}
test('chat transport binds every read/text/upload to room, owner, token and auth revision; it never queues',async()=>{const f=setup(),session=await f.api.openChatSession('room/x',owner,()=>true);await session.readMessages();await session.readRoom();await session.sendMessage('hello');await session.upload('attachments',{uri:'file:///a.pdf',name:'a.pdf'});await session.upload('photo',{uri:'file:///a.jpg',name:'a.jpg'});assert.deepEqual(f.sent.map(x=>x.url),['/chat/messages/room%2Fx','/chat/room/room%2Fx/details','/chat/message','/chat/room/room%2Fx/attachments','/chat/room/room%2Fx/photo']);for(const request of f.sent){assert.equal(request.config.expectedAuthToken,'token');assert.equal(request.config.expectedAuthRevision,0);assert.equal(request.config.fenceUnauthorizedToCurrent,true);assert.equal(request.config.headers.Authorization,'Bearer token');}assert.equal(f.queued.length,0);});
test('offline text and uploads never dispatch or queue; drafts stay caller-owned',async()=>{const f=setup(),session=await f.api.openChatSession('room',owner,()=>true);f.online=async()=>false;for(const run of [()=>session.sendMessage('draft'),()=>session.upload('attachments',{uri:'a',name:'a'})])await assert.rejects(run(),{code:'CHAT_NOT_SENT'});assert.equal(f.sent.length,0);assert.equal(f.queued.length,0);});
test('opening session fails on changed token/revision, view, or stored owner/company/role',async()=>{for(const field of ['id','companyId','role','token','revision','view']){const f=setup();let current=true;f.read=async()=>{if(field==='token')f.api.token='replacement';else if(field==='revision')f.api.authRevision++;else if(field==='view')current=false;return JSON.stringify({...owner,...(['id','companyId','role'].includes(field)?{[field]:'different'}:{})});};await assert.rejects(f.api.openChatSession('room',owner,()=>current));assert.equal(f.sent.length,0);}});
test('token retrieval cannot adopt a replacement session for a stale view',async()=>{const f=setup(),wait=deferred();f.api.token=null;f.read=()=>wait.promise;const pending=f.api.openChatSession('room',owner,()=>true);f.api.token='replacement';f.api.authRevision++;wait.resolve('token');await assert.rejects(pending);assert.equal(f.sent.length,0);});
test('all chat operations fence scope and session at dispatch and late response',async()=>{for(const mode of ['text','file','read'])for(const stage of ['dispatch','response'])for(const change of ['token','revision','view']){const f=setup();let current=true;const session=await f.api.openChatSession('room',owner,()=>current);const mutate=()=>{if(change==='token')f.api.token='replacement';else if(change==='revision')f.api.authRevision++;else current=false;};if(stage==='dispatch')f.beforeSend=mutate;else f.response=async()=>{mutate();return {data:{success:true}};};await assert.rejects(mode==='text'?session.sendMessage('hello'):mode==='file'?session.upload('attachments',{uri:'a',name:'a'}):session.readMessages());assert.equal(f.sent.length,stage==='dispatch'?0:1);}});
test('owner/company/role changes during network preflight are rejected by dispatch storage check',async()=>{for(const field of ['id','companyId','role']){const f=setup(),session=await f.api.openChatSession('room',owner,()=>true);f.online=async()=>{f.read=async()=>JSON.stringify({...owner,[field]:'changed'});return true;};await assert.rejects(session.sendMessage('hello'),{code:'CHAT_NOT_SENT'});assert.equal(f.sent.length,0);}});
test('owner changes in pre-dispatch storage await cannot use a replacement token',async()=>{const f=setup(),session=await f.api.openChatSession('room',owner,()=>true);f.read=async()=>{f.api.token='replacement';f.api.authRevision++;return JSON.stringify(owner);};await assert.rejects(session.sendMessage('hello'));assert.equal(f.sent.length,0);});
test('timeout, 5xx, and multipart400 remain uncertain; only proven pre-save rejection is retryable',async()=>{for(const kind of ['text','file','photo'])for(const status of [undefined,400,403,413,415,500,502]){const f=setup(),session=await f.api.openChatSession('room',owner,()=>true);f.response=async()=>{throw Object.assign(Error('transport'),status?{response:{status}}:{});};const expected=[403,413,415].includes(status)||(kind==='text'&&status===400)?'CHAT_NOT_SENT':'CHAT_UNCERTAIN';await assert.rejects(kind==='text'?session.sendMessage('hello'):session.upload(kind==='file'?'attachments':'photo',{uri:'a',name:'a'}),{code:expected});assert.equal(f.sent.length,1);assert.equal(f.queued.length,0);}});
test('stale401/402 cannot clear a replacement account or trigger subscription navigation',async()=>{const f=setup();let current=true,unauthorized=0,subscription=0;f.api.setUnauthorizedHandler(()=>unauthorized++);f.api.setSubscriptionRequiredHandler(()=>subscription++);const session=await f.api.openChatSession('room',owner,()=>current);await session.readMessages();const config=f.sent[0].config;for(const status of [401,402]){current=false;await assert.rejects(f.responseFailure({response:{status},config}));assert.equal(f.api.token,'token');current=true;f.api.authRevision++;await assert.rejects(f.responseFailure({response:{status},config}));}assert.equal(unauthorized,0);assert.equal(subscription,0);});
test('401 clear-token await cannot sign out an account that logs in during storage deletion',async()=>{const f=setup(),session=await f.api.openChatSession('room',owner,()=>true);await session.readMessages();const wait=deferred();let unauthorized=0;f.api.setUnauthorizedHandler(()=>unauthorized++);f.remove=()=>wait.promise;const response=f.responseFailure({response:{status:401},config:f.sent[0].config}).catch(()=>{});await f.api.setToken('replacement');wait.resolve();await response;assert.equal(unauthorized,0);assert.equal(f.api.token,'replacement');});
test('replay rejects legacy chat records before any request',async()=>{const f=setup();await assert.rejects(f.api.replayQueued({url:'/chat/message',method:'POST',data:{message:'old'}}),/review/);await assert.rejects(f.api.replayQueued({url:'/chat/room/room/attachments',method:'POST',fileUri:'a'}),/review/);assert.equal(f.sent.length,0);});

test('inbox read uses owner path and the shared session/revision/pre-dispatch/401 fences without queueing',async()=>{
 const f=setup();f.response=async()=>({data:{success:true,rooms:[]}});
 const response=await f.api.getChatRooms(owner,()=>true);assert.equal(response.data.success,true);assert.equal(response.isSessionCurrent(),true);
 assert.equal(f.sent[0].url,'/chat/rooms/owner');assert.equal(f.sent[0].config.expectedAuthToken,'token');assert.equal(f.sent[0].config.expectedAuthRevision,0);
 assert.equal(f.sent[0].config.fenceUnauthorizedToCurrent,true);assert.equal(typeof f.sent[0].config.expectedBeforeDispatch,'function');assert.equal(f.queued.length,0);
 f.api.authRevision++;assert.equal(response.isSessionCurrent(),false);
});
test('inbox rejects wrong stored owner/company/role at opening and at actual HTTP dispatch',async()=>{
 for(const stage of ['opening','dispatch'])for(const field of ['id','companyId','role']){
  const f=setup();const mutate=()=>{f.read=async()=>JSON.stringify({...owner,[field]:'changed'});};if(stage==='opening')mutate();else f.beforeSend=async()=>mutate();
  await assert.rejects(f.api.getChatRooms(owner,()=>true));assert.equal(f.sent.length,0);
 }
});
test('inbox ignores newer account/view/revision at transport dispatch or late response and never adopts replacement tokens',async()=>{
 for(const stage of ['dispatch','response'])for(const change of ['token','revision','view']){
  const f=setup();let current=true;const mutate=()=>{if(change==='token')f.api.token='other';else if(change==='revision')f.api.authRevision++;else current=false;};
  if(stage==='dispatch')f.beforeSend=async()=>mutate();else f.response=async()=>{mutate();return {data:{success:true,rooms:[]}};};
  await assert.rejects(f.api.getChatRooms(owner,()=>current));assert.equal(f.sent.length,stage==='dispatch'?0:1);
 }
 const f=setup(),wait=deferred();f.api.token=null;f.read=()=>wait.promise;const pending=f.api.getChatRooms(owner,()=>true);await f.api.setToken('replacement');wait.resolve('old');await assert.rejects(pending);assert.equal(f.sent.length,0);
});
test('inbox late401/402 from superseded requests or changed accounts cannot navigate or sign out',async()=>{
 for(const change of ['view','revision','token'])for(const status of [401,402]){
  const f=setup();let current=true,unauthorized=0,subscription=0;f.api.setUnauthorizedHandler(()=>unauthorized++);f.api.setSubscriptionRequiredHandler(()=>subscription++);
  f.response=async()=>{if(change==='view')current=false;else if(change==='revision')f.api.authRevision++;else f.api.token='replacement';throw {response:{status}};};
  await assert.rejects(f.api.getChatRooms(owner,()=>current));assert.equal(unauthorized,0);assert.equal(subscription,0);assert.notEqual(f.api.token,null);
 }
});
test('inbox URI encodes exact owner identity and copies it before async preflight',async()=>{
 const f=setup(),who={...owner,id:'owner/with space'},wait=deferred();f.read=()=>wait.promise;
 const pending=f.api.getChatRooms(who,()=>true);who.id='replacement';wait.resolve(JSON.stringify({...owner,id:'owner/with space'}));await pending;
 assert.equal(f.sent[0].url,'/chat/rooms/owner%2Fwith%20space');
});


test('creation picker and mutations use the captured session, active-company endpoint, and unchanged POST contracts', async () => {
  const f = setup(), session = await f.api.openChatCreationSession(owner, () => true);
  await session.readUsers(); await session.createDirect('other'); await session.createGroup('Crew', ['other']);
  assert.deepEqual(f.sent.map(x => x.url), ['/users/company', '/chat/create-direct', '/chat/create-group']);
  assert.deepEqual(JSON.parse(JSON.stringify(f.sent[1].data)), { userId2: 'other' });
  assert.deepEqual(JSON.parse(JSON.stringify(f.sent[2].data)), { name: 'Crew', memberIds: ['other'] });
  for (const request of f.sent) { assert.equal(request.config.expectedAuthToken, 'token'); assert.equal(request.config.expectedAuthRevision, 0); assert.equal(request.config.fenceUnauthorizedToCurrent, true); assert.equal(request.config.headers.Authorization, 'Bearer token'); }
  assert.equal(f.queued.length, 0);
});
test('creation rejects missing/mismatched stored owner, company and role before even loading people', async () => {
  for (const field of ['id', 'companyId', 'role']) for (const value of ['', 'replacement']) {
    const f = setup(); f.read = async () => JSON.stringify({ ...owner, [field]: value });
    await assert.rejects(f.api.openChatCreationSession(owner, () => true), { code: 'CHAT_NOT_SENT' }); assert.equal(f.sent.length, 0);
  }
});
test('creation stays online-only and never dispatches or queues offline direct/group actions', async () => {
  const f = setup(), session = await f.api.openChatCreationSession(owner, () => true); f.online = async () => false;
  await assert.rejects(session.createDirect('other'), { code: 'CHAT_NOT_SENT' });
  await assert.rejects(session.createGroup('Crew', ['other']), { code: 'CHAT_NOT_SENT' });
  assert.equal(f.sent.length, 0); assert.equal(f.queued.length, 0);
});
test('creation and picker reads fence owner/session/scope at dispatch and after a late response', async () => {
  for (const kind of ['picker', 'direct', 'group']) for (const stage of ['dispatch', 'response']) for (const change of ['token', 'revision', 'view']) {
    const f = setup(); let current = true; const session = await f.api.openChatCreationSession(owner, () => current);
    const mutate = () => { if (change === 'token') f.api.token = 'replacement'; else if (change === 'revision') f.api.authRevision++; else current = false; };
    if (stage === 'dispatch') f.beforeSend = mutate; else f.response = async () => { mutate(); return { data: { success: true, roomId: 'other-owner' } }; };
    await assert.rejects(kind === 'picker' ? session.readUsers() : kind === 'direct' ? session.createDirect('other') : session.createGroup('Crew', ['other']));
    assert.equal(f.sent.length, stage === 'dispatch' ? 0 : 1); assert.equal(f.queued.length, 0);
  }
});
test('creation rechecks stored owner/company/role after network preflight and before dispatch', async () => {
  for (const kind of ['direct', 'group']) for (const field of ['id', 'companyId', 'role']) {
    const f = setup(), session = await f.api.openChatCreationSession(owner, () => true);
    f.online = async () => { f.read = async () => JSON.stringify({ ...owner, [field]: 'replacement' }); return true; };
    await assert.rejects(kind === 'direct' ? session.createDirect('other') : session.createGroup('Crew', ['other']), { code: 'CHAT_NOT_SENT' });
    assert.equal(f.sent.length, 0); assert.equal(f.queued.length, 0);
  }
});
test('creation does not retry unknown timeouts or 5xx and distinguishes proven rejections', async () => {
  for (const kind of ['direct', 'group']) for (const status of [undefined, 400, 403, 404, 500, 502]) {
    const f = setup(), session = await f.api.openChatCreationSession(owner, () => true);
    f.response = async () => { throw Object.assign(Error('transport'), status ? { response: { status } } : {}); };
    await assert.rejects(kind === 'direct' ? session.createDirect('other') : session.createGroup('Crew', ['other']), { code: [400, 403].includes(status) ? 'CHAT_NOT_SENT' : 'CHAT_UNCERTAIN' });
    assert.equal(f.sent.length, 1); assert.equal(f.queued.length, 0);
  }
});
test('creation owns a copy of submitted group IDs across the asynchronous preflight', async () => {
  const f = setup(), session = await f.api.openChatCreationSession(owner, () => true), wait = deferred(), members = ['other'];
  f.online = () => wait.promise; const pending = session.createGroup('Crew', members); members.push('replacement'); wait.resolve(true); await pending;
  assert.deepEqual(Array.from(f.sent[0].data.memberIds), ['other']);
});
test('creation picker 401/402 after blur or session replacement cannot sign out or redirect the new view', async () => {
  const f = setup(); let current = true, unauthorized = 0, subscription = 0;
  f.api.setUnauthorizedHandler(() => unauthorized++); f.api.setSubscriptionRequiredHandler(() => subscription++);
  const session = await f.api.openChatCreationSession(owner, () => current); await session.readUsers(); const config = f.sent[0].config;
  for (const status of [401, 402]) { current = false; await assert.rejects(f.responseFailure({ response: { status }, config })); current = true; f.api.authRevision++; await assert.rejects(f.responseFailure({ response: { status }, config })); }
  assert.equal(f.api.token, 'token'); assert.equal(unauthorized, 0); assert.equal(subscription, 0);
});

test('paged history encodes only room and opaque cursor while preserving legacy no-query reads', async () => {
  const f = setup(), session = await f.api.openChatSession('room/x', owner, () => true);
  await session.readMessages(); await session.readMessages({ limit: 200 });
  await session.readMessages({ before: 'v1/opaque+?=#' }); await session.readMessages({ limit: 1, before: 'other' });
  assert.deepEqual(f.sent.map(request => request.url), [
    '/chat/messages/room%2Fx', '/chat/messages/room%2Fx?limit=200',
    '/chat/messages/room%2Fx?limit=200&before=v1%2Fopaque%2B%3F%3D%23', '/chat/messages/room%2Fx?limit=1&before=other',
  ]);
  for (const request of f.sent) {
    assert.equal(request.config.expectedAuthToken, 'token'); assert.equal(request.config.expectedAuthRevision, 0);
    assert.equal(request.config.fenceUnauthorizedToCurrent, true); assert.equal(typeof request.config.expectedBeforeDispatch, 'function');
  }
  assert.equal(f.queued.length, 0);
});

test('paged history retains room/account/session dispatch and response fences without automatic retries', async () => {
  for (const stage of ['dispatch', 'response']) for (const change of ['token', 'revision', 'view', 'storedOwner']) {
    const f = setup(); let current = true; const session = await f.api.openChatSession('room', owner, () => current);
    const mutate = () => {
      if (change === 'token') f.api.token = 'replacement';
      else if (change === 'revision') f.api.authRevision++;
      else if (change === 'view') current = false;
      else f.read = async () => JSON.stringify({ ...owner, id: 'replacement' });
    };
    // Storage identity is checked at dispatch; auth revision/current guard protects late responses.
    if (stage === 'response' && change === 'storedOwner') continue;
    if (stage === 'dispatch') f.beforeSend = mutate;
    else f.response = async () => { mutate(); return { data: { messages: [], hasMore: false, nextCursor: null } }; };
    await assert.rejects(session.readMessages({ limit: 200, before: 'opaque' }));
    assert.equal(f.sent.length, stage === 'dispatch' ? 0 : 1); assert.equal(f.queued.length, 0);
  }
});

test('invalid pagination cursor response reaches the reader unchanged and never retries', async () => {
  const f = setup(), session = await f.api.openChatSession('room', owner, () => true);
  f.response = async () => { throw { response: { status: 400, data: { code: 'CHAT_CURSOR_INVALID', refreshRequired: true } } }; };
  await assert.rejects(session.readMessages({ before: 'expired' }), error => error.response.data.code === 'CHAT_CURSOR_INVALID'
    && error.response.data.refreshRequired === true);
  assert.equal(f.sent.length, 1); assert.equal(f.queued.length, 0);
});


test('group transport accepts 99 and 100 raw IDs but rejects 101 before network preflight or POST', async () => {
  for (const count of [99, 100, 101]) {
    const f = setup(), session = await f.api.openChatCreationSession(owner, () => true);
    const members = Array.from({ length: count }, (_, i) => `coworker-${i}`);
    let checks = 0; f.online = async () => { checks++; return true; };
    if (count <= 100) {
      await session.createGroup('Crew', members);
      assert.equal(checks, 1); assert.equal(f.sent.length, 1);
      assert.deepEqual(Array.from(f.sent[0].data.memberIds), members);
    } else {
      await assert.rejects(session.createGroup('Crew', members), { code: 'CHAT_NOT_SENT' });
      assert.equal(checks, 0); assert.equal(f.sent.length, 0);
    }
    assert.equal(f.queued.length, 0);
  }
});

test('group transport caps the raw submitted array before deduplication and preserves the admitted snapshot', async () => {
  const f = setup(), session = await f.api.openChatCreationSession(owner, () => true);
  const members = Array(100).fill('other'), wait = deferred();
  f.online = () => wait.promise;
  const pending = session.createGroup('Crew', members); members.push('other'); wait.resolve(true); await pending;
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].data.memberIds.length, 100);
  await assert.rejects(session.createGroup('Crew', members), { code: 'CHAT_NOT_SENT' });
  assert.equal(f.sent.length, 1); assert.equal(f.queued.length, 0);
});

test('group transport rejects invalid raw arrays without a POST or queued action', async () => {
  for (const members of [undefined, null, 'other', { length: 1, 0: 'other' }, new Set(['other']), [],
    [null], [undefined], [42], [{}], [''], ['   '], ['other\0'], new Array(1), ['other', , 'third']]) {
    const f = setup(), session = await f.api.openChatCreationSession(owner, () => true);
    let checks = 0; f.online = async () => { checks++; return true; };
    await assert.rejects(session.createGroup('Crew', members), { code: 'CHAT_NOT_SENT' });
    assert.equal(checks, 0); assert.equal(f.sent.length, 0); assert.equal(f.queued.length, 0);
  }
});

test('private view acknowledgement is an immutable exact scope/version POST using quiet guarded transport, never a queue', async () => {
  const f = setup(), session = await f.api.openChatSession('room/x', owner, () => true);
  const context = { actorId: owner.id, companyId: owner.companyId, roomId: 'room/x', membershipInstanceId: 'membership' };
  const messages = [{ id: 'message', viewVersion: 'version' }];
  f.online = async () => { context.membershipInstanceId = 'mutated'; messages[0].viewVersion = 'mutated'; return true; };
  await session.acknowledgeViews(context, messages, () => true);
  assert.equal(f.sent[0].url, '/chat/room/room%2Fx/views');
  assert.deepEqual(JSON.parse(JSON.stringify(f.sent[0].data)), { expectedActorId: 'owner', expectedCompanyId: 'company', membershipInstanceId: 'membership', messages: [{ id: 'message', viewVersion: 'version' }] });
  assert.equal(f.sent[0].config.quietChatText, true); assert.equal(f.sent[0].config.fenceUnauthorizedToCurrent, true); assert.equal(f.queued.length, 0);
});
test('private views recheck foreground visibility and stored scope at actual dispatch; offline/changed-session work never queues', async () => {
  for (const stage of ['network', 'dispatch']) for (const change of ['visibility', 'id', 'companyId', 'role', 'token', 'revision', 'ABA']) {
    const f = setup(); let visible = true;
    const session = await f.api.openChatSession('room', owner, () => true);
    const mutate = async () => {
      if (change === 'visibility') visible = false;
      else if (['id', 'companyId', 'role'].includes(change)) f.read = async () => JSON.stringify({ ...owner, [change]: 'other' });
      else if (change === 'token') f.api.token = 'other';
      else if (change === 'revision') f.api.authRevision++;
      else { await f.api.clearToken(); await f.api.setToken('token'); }
    };
    if (stage === 'network') f.online = async () => { await mutate(); return true; }; else f.beforeSend = mutate;
    await assert.rejects(session.acknowledgeViews({ actorId: owner.id, companyId: owner.companyId, roomId: 'room', membershipInstanceId: 'membership' }, [{ id: 'm', viewVersion: 'v' }], () => visible));
    assert.equal(f.sent.length, 0, `${stage}/${change}`); assert.equal(f.queued.length, 0);
  }
  const f = setup(), session = await f.api.openChatSession('room', owner, () => true); f.online = async () => false;
  await assert.rejects(session.acknowledgeViews({ actorId: owner.id, companyId: owner.companyId, roomId: 'room', membershipInstanceId: 'membership' }, [{ id: 'm', viewVersion: 'v' }], () => true));
  assert.equal(f.sent.length, 0); assert.equal(f.queued.length, 0);
});
test('private view denial preserves status for the caller and never navigates to payment/login, including stale401', async () => {
  for (const status of [401, 402, 403, 409, 503]) {
    const f = setup(); let subscription = 0, unauthorized = 0; f.api.setSubscriptionRequiredHandler(() => subscription++); f.api.setUnauthorizedHandler(() => unauthorized++);
    const session = await f.api.openChatSession('room', owner, () => true);
    f.response = async () => { throw { response: { status, data: { code: status === 409 ? 'CHAT_VIEW_STALE' : 'DENIED' } } }; };
    await assert.rejects(session.acknowledgeViews({ actorId: owner.id, companyId: owner.companyId, roomId: 'room', membershipInstanceId: 'membership' }, [{ id: 'm', viewVersion: 'v' }], () => true), error => error.response.status === status);
    assert.equal(unauthorized, 0); assert.equal(subscription, 0); assert.equal(f.api.token, 'token');
    await f.api.setToken('replacement'); await assert.rejects(f.responseFailure({ response: { status: 401 }, config: f.sent[0].config }));
    assert.equal(f.api.token, 'replacement'); assert.equal(unauthorized, 0);
  }
});
test('history view metadata is opt-in, support never sends private views, and counts use immutable actor/company query', async () => {
  const f = setup(), session = await f.api.openChatSession('room/x', owner, () => true);
  await session.readMessages({ before: 'opaque', views: true }); assert.equal(f.sent[0].url, '/chat/messages/room%2Fx?limit=200&before=opaque&views=1');
  await f.api.getChatViewCounts(owner, () => true); assert.equal(f.sent[1].url, '/chat/views?expectedActorId=owner&expectedCompanyId=company');
  assert.equal(f.sent[1].config.quietChatText, true);
  const support = await f.api.openChatSession('support-ticket-test', owner, () => true);
  assert.throws(() => support.acknowledgeViews({ actorId: owner.id, companyId: owner.companyId, roomId: 'support-ticket-test', membershipInstanceId: 'membership' }, [{ id: 'm', viewVersion: 'v' }], () => true));
});

test('history per-request generation fences reach actual transport dispatch, late response and401/402 interception', async () => {
  for (const stage of ['dispatch', 'response']) for (const status of [undefined, 401, 402]) {
    const f = setup(); let current = true, unauthorized = 0, subscription = 0;
    f.api.setUnauthorizedHandler(() => unauthorized++); f.api.setSubscriptionRequiredHandler(() => subscription++);
    const session = await f.api.openChatSession('room', owner, () => true);
    if (stage === 'dispatch') f.beforeSend = async () => { current = false; };
    f.response = async () => { current = false; if (status) throw { response: { status } }; return { data: { success: true } }; };
    await assert.rejects(session.readMessages({ limit: 200, before: 'old', views: true }, () => current));
    assert.equal(f.sent.length, stage === 'dispatch' ? 0 : 1);
    assert.equal(f.api.token, 'token'); assert.equal(unauthorized, 0); assert.equal(subscription, 0);
  }
});
