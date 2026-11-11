const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports});return exports;}
const {createHistoryState,createHistoryController,mergeHistoryRows,CHAT_CATCHUP_PAGES}=load('chatHistory');
const {captureChatScroll,restoreChatScroll}=load('chatScroll');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(setImmediate);
const row=n=>({id:String(n).padStart(6,'0'),room_id:'room',company_id:'company',created_at:new Date(n*1000).toISOString(),message:String(n)});
const rows=(a,b)=>Array.from({length:Math.max(0,b-a+1)},(_,i)=>row(i+a));
const page=(a,b,more=a>1)=>({success:true,messages:rows(a,b),hasMore:more,nextCursor:more?'cursor-'+a:null});
function fixture(state=createHistoryState()){
 const f={state,rows:[],calls:[],views:[],commits:[],pending:[],current:true,denied:0};
 f.options={isCurrent:()=>f.current,readMessages:query=>{const d=deferred();f.calls.push(query);f.pending.push(d);return d.promise;},validMessage:r=>!!r&&typeof r.id==='string'&&r.room_id==='room'&&r.company_id==='company'&&(r.created_at===null||Number.isFinite(Date.parse(r.created_at))),onMessages:(incoming,kind)=>{f.rows=mergeHistoryRows(f.rows,incoming);f.commits.push(kind);},onChange:v=>f.views.push(v),onAccessChanged:()=>{f.denied++;f.current=false;}};
 f.controller=createHistoryController(state,f.options);
 f.resolve=async(data)=>{assert.ok(f.pending.length,'request pending');f.pending.shift().resolve(data);await flush();};
 f.reject=async(error)=>{assert.ok(f.pending.length);f.pending.shift().reject(error);await flush();};
 return f;
}
async function seed(f,a=1,b=200){f.controller.refresh();await f.resolve(page(a,b));}
const ids=f=>Array.from(f.rows,r=>r.id);
test('initial pagination uses opt-in latest, stores response cursor and loads one older page',async()=>{
 const f=fixture();await seed(f,201,400);assert.equal(f.calls[0].limit,200);assert.equal(f.state.olderCursor,'cursor-201');assert.equal(f.state.hasOlder,true);
 f.controller.older();f.controller.older();assert.equal(f.calls.length,2);assert.equal(f.calls[1].before,'cursor-201');await f.resolve(page(1,200));assert.equal(f.rows.length,400);assert.equal(f.state.hasOlder,false);assert.equal(f.state.olderCursor,null);assert.equal(f.state.gaps.length,0);
});
test('reconnect bridges old 1–200 plus latest 251–450 instead of losing 201–250',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(251,450));assert.equal(f.state.hasOlder,false);assert.equal(f.calls.at(-1).before,'cursor-251');await f.resolve(page(51,250));assert.equal(f.rows.length,450);assert.equal(f.state.gaps.length,0);assert.deepEqual(ids(f),rows(1,450).map(r=>r.id));
});
test('catch-up is bounded and visible continuation resumes the exact cursor',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(1401,1600));for(let n=1201;n>=801;n-=200)await f.resolve(page(n,n+199));
 assert.equal(f.calls.length,2+CHAT_CATCHUP_PAGES);assert.equal(f.state.gaps.length,1);assert.equal(f.state.gaps[0].cursor,'cursor-801');assert.equal(f.views.at(-1).busy,null);
 f.controller.continueRecovery();f.controller.continueRecovery();assert.equal(f.calls.at(-1).before,'cursor-801');for(let n=601;n>=201;n-=200)await f.resolve(page(n,n+199));assert.equal(f.state.gaps.length,1);
 f.controller.continueRecovery();await f.resolve(page(1,200));assert.equal(f.rows.length,1600);assert.equal(f.state.gaps.length,0);
});
test('polls retain budget-limited gaps and a later disjoint latest creates a second gap',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(1401,1600));for(let n=1201;n>=801;n-=200)await f.resolve(page(n,n+199));
 const first=f.state.gaps[0],count=f.calls.length;f.controller.refresh();await f.resolve(page(1401,1600));assert.equal(f.calls.length,count+1);assert.equal(f.state.gaps[0],first);assert.equal(first.cursor,'cursor-801');
 f.controller.refresh();await f.resolve(page(2601,2800));for(let n=2401;n>=2001;n-=200)await f.resolve(page(n,n+199));assert.equal(f.state.gaps.length,2);assert.equal(f.state.gaps[0],first);
 f.controller.continueRecovery();for(let n=601;n>=201;n-=200)await f.resolve(page(n,n+199));assert.equal(f.state.gaps.length,2);
 f.controller.continueRecovery();await f.resolve(page(1,200));await f.resolve(page(1801,2000));await f.resolve(page(1601,1800));assert.equal(f.state.gaps.length,1);
 f.controller.continueRecovery();await f.resolve(page(1401,1600));assert.equal(f.state.gaps.length,0);assert.equal(f.rows.length,2800);
});
test('overlapping poll/focus/rejoin requests coalesce to one trailing latest read',async()=>{
 const f=fixture();f.controller.refresh();for(let i=0;i<8;i++)f.controller.refresh();assert.equal(f.calls.length,1);await f.resolve(page(1,200));assert.equal(f.calls.length,2);await f.resolve(page(2,201));assert.equal(f.calls.length,2);assert.equal(f.rows.length,201);
});
test('older page and latest refresh serialize without moving the wrong cursor',async()=>{
 const f=fixture();await seed(f,201,400);f.controller.older();f.controller.refresh();f.controller.refresh();assert.equal(f.calls.length,2);
 await f.resolve(page(1,200));assert.equal(f.calls.length,3);assert.equal(f.calls[2].before,undefined);await f.resolve(page(451,650));assert.equal(f.state.hasOlder,false);assert.equal(f.state.olderCursor,null);assert.equal(f.calls.at(-1).before,'cursor-451');await f.resolve(page(251,450));assert.equal(f.rows.length,650);assert.equal(f.state.gaps.length,0);
});
test('socket arrivals do not erase pre-refresh anchors or duplicate messages',async()=>{
 const f=fixture();await seed(f);f.options.onMessages([row(450)],'latest');f.controller.refresh();await f.resolve(page(251,450));assert.equal(f.state.gaps.length,1);await f.resolve(page(51,250));assert.equal(f.rows.length,450);assert.equal(new Set(ids(f)).size,450);
});
test('new arrivals during catch-up queue a latest refresh and leave recovery cursor intact',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(251,450));f.controller.refresh();f.controller.refresh();assert.equal(f.calls.length,3);await f.resolve(page(51,250));assert.equal(f.calls.length,4);await f.resolve(page(252,451));assert.equal(f.rows.length,451);assert.equal(f.state.gaps.length,0);
});
test('stale scope/account/foreground/unmount successes and errors cannot mutate model or callbacks',async()=>{
 for(const dispose of [true,false])for(const failure of [true,false]){
  const f=fixture();await seed(f,201,400);f.controller.older();const before={calls:f.calls.length,views:f.views.length,rows:f.rows.length,cursor:f.state.olderCursor};
  if(dispose)f.controller.dispose();else f.current=false;
  failure?await f.reject(Object.assign(Error('denied'),{code:'CHAT_ACCESS_CHANGED'})):await f.resolve(page(1,200));
  assert.equal(f.rows.length,before.rows);assert.equal(f.views.length,before.views);assert.equal(f.state.olderCursor,before.cursor);assert.equal(f.denied,0);f.controller.refresh();assert.equal(f.calls.length,before.calls);
 }
});
test('foreground replacement keeps unresolved gaps while obsolete page results stay fenced',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(1001,1200));const stale=f.pending.shift();const cursor=f.state.gaps[0].cursor;f.controller.dispose();
 f.controller=createHistoryController(f.state,f.options);f.controller.refresh();await f.resolve(page(1001,1200));assert.equal(f.state.gaps[0].cursor,cursor);stale.resolve(page(801,1000));await flush();assert.equal(f.state.gaps[0].cursor,cursor);
 f.controller.continueRecovery();assert.equal(f.calls.at(-1).before,cursor);await f.resolve(page(801,1000));await f.resolve(page(601,800));await f.resolve(page(401,600));assert.equal(f.state.gaps.length,1);
});
test('invalid older cursor requires explicit refresh and preserves loaded history',async()=>{
 const f=fixture();await seed(f,201,400);f.controller.older();await f.reject(Object.assign(Error('deleted'),{code:'CHAT_CURSOR_INVALID',refreshRequired:true}));assert.equal(f.state.olderBlocked,true);assert.equal(f.rows.length,200);
 const count=f.calls.length;await f.controller.older();assert.equal(f.calls.length,count);f.controller.refresh();await f.resolve(page(202,401));assert.equal(f.state.olderBlocked,true);assert.equal(f.state.olderCursor,'cursor-201');
 f.controller.refresh(true);await f.resolve(page(203,402));assert.equal(f.state.olderBlocked,false);assert.equal(f.state.olderCursor,'cursor-203');assert.equal(f.rows.length,202);f.controller.older();await f.resolve(page(3,202));assert.equal(f.rows.length,400);
});
test('invalid gap cursor rebases only on explicit refresh, retaining original target anchors',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(251,450));const gap=f.state.gaps[0];await f.reject(Object.assign(Error('deleted'),{code:'CHAT_CURSOR_INVALID'}));assert.equal(gap.blocked,true);
 f.controller.refresh();await f.resolve(page(252,451));assert.equal(gap.blocked,true);assert.equal(gap.cursor,'cursor-251');
 f.controller.refresh(true);await f.resolve(page(253,452));assert.equal(gap.blocked,false);assert.equal(f.calls.at(-1).before,'cursor-253');await f.resolve(page(53,252));assert.equal(f.rows.length,452);assert.equal(f.state.gaps.length,0);
});
test('malformed metadata and scope cannot claim exhaustion or discard cursors; retry works',async()=>{
 for(const mutate of [p=>delete p.hasMore,p=>delete p.nextCursor,p=>p.hasMore='false',p=>p.nextCursor=null,p=>p.nextCursor='cursor-201',p=>p.messages=[],p=>p.messages[0].room_id='other',p=>p.messages[0].company_id='other',p=>p.success=false]){
  const f=fixture();await seed(f,201,400);f.controller.older();const bad=page(2,200);mutate(bad);await f.resolve(bad);assert.equal(f.state.hasOlder,true);assert.equal(f.state.olderCursor,'cursor-201');assert.equal(f.rows.length,200);assert.ok(f.state.pageError);f.controller.older();await f.resolve(page(1,200));assert.equal(f.rows.length,400);assert.equal(f.state.pageError,'');
 }
});
test('malformed latest replies retain prior anchor and unresolved gaps',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve({...page(251,450),hasMore:undefined});assert.equal(f.state.headIds.has(row(200).id),true);assert.equal(f.rows.length,200);assert.ok(f.state.latestError);f.controller.refresh();await f.resolve(page(251,450));await f.resolve(page(51,250));assert.equal(f.rows.length,450);
});
test('network failures retain gap cursor for explicit retry and current access denial is forwarded',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(251,450));await f.reject(Error('offline'));assert.equal(f.state.gaps[0].cursor,'cursor-251');assert.ok(f.state.pageError);f.controller.continueRecovery();await f.resolve(page(51,250));assert.equal(f.state.gaps.length,0);
 f.controller.refresh();await f.reject(Object.assign(Error('denied'),{code:'CHAT_ACCESS_CHANGED'}));assert.equal(f.denied,1);
});
test('server exhaustion resolves a gap even if its old anchor was deleted',async()=>{
 const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(251,450));await f.resolve(page(201,250,false));assert.equal(f.state.gaps.length,0);assert.equal(f.rows.length,450);
});
test('nullable dates sort last with stable ID ties and merged rows update without duplicates',()=>{
 const result=mergeHistoryRows([row(1),{...row(4),created_at:null}],[{...row(3),created_at:null},{...row(1),message:'edited'},row(2)]);
 assert.deepEqual([...result.map(r=>r.id)],rows(1,4).map(r=>r.id));assert.equal(result[0].message,'edited');
});
function viewport(){const box={scrollTop:400,scrollHeight:1000,clientHeight:200,getBoundingClientRect:()=>({top:50}),querySelectorAll:()=>box.rows};box.rows=[{dataset:{messageId:'anchor'},getBoundingClientRect:()=>({top:60,bottom:100})}];return box;}
test('prepending preserves the visible message and offset; realtime never drags a reader to bottom',()=>{
 for(const history of [true,false]){const box=viewport(),snapshot=captureChatScroll(box,history);box.scrollHeight=1400;box.rows[0].getBoundingClientRect=()=>({top:360,bottom:400});restoreChatScroll(box,snapshot);assert.equal(box.scrollTop,700);assert.equal(snapshot.follow,false);}
});
test('only recent arrivals near bottom follow; older pages never auto-scroll and missing anchor preserves position',()=>{
 const box=viewport();box.scrollTop=800;let snap=captureChatScroll(box,false);assert.equal(snap.follow,true);box.scrollHeight=1200;restoreChatScroll(box,snap);assert.equal(box.scrollTop,1000);
 snap=captureChatScroll(box,true);assert.equal(snap.follow,false);box.rows=[];box.scrollHeight=1400;restoreChatScroll(box,snap);assert.equal(box.scrollTop,1000);
});

test('automatic refresh cannot silently clear blocked gap even when latest exhausts or overlaps its anchors',async()=>{
 for(const recent of [page(1,200),page(2,201)]){const f=fixture();await seed(f);f.controller.refresh();await f.resolve(page(251,450));await f.reject(Object.assign(Error('deleted'),{code:'CHAT_CURSOR_INVALID'}));const gap=f.state.gaps[0];f.controller.refresh();await f.resolve(recent);assert.equal(f.state.gaps[0],gap);assert.equal(gap.blocked,true);assert.equal(f.views.at(-1).refreshRequired,true);f.controller.refresh(true);await f.resolve(recent);if(f.pending.length)await f.resolve(page(1,1));assert.equal(f.state.gaps.length,0);assert.equal(f.rows.length,400+(recent.hasMore?1:0));}
});

test('an initially empty room exposes older pages when more than 200 messages later arrive',async()=>{
 for(const socketFirst of [false,true]){
  const f=fixture();await seed(f,1,0);assert.equal(f.state.hasOlder,false);assert.equal(f.state.headIds.size,0);
  if(socketFirst)f.options.onMessages([row(450)],'latest');
  f.controller.refresh();await f.resolve(page(251,450));assert.equal(f.state.hasOlder,true);assert.equal(f.state.olderCursor,'cursor-251');assert.equal(f.state.gaps.length,0);assert.equal(f.views.at(-1).hasOlder,true);
  f.controller.older();f.controller.older();assert.equal(f.calls.at(-1).before,'cursor-251');await f.resolve(page(51,250));assert.equal(f.state.olderCursor,'cursor-51');
  f.controller.refresh();await f.resolve(page(252,451));assert.equal(f.state.olderCursor,'cursor-51');
  f.controller.older();await f.resolve(page(1,50));assert.equal(f.rows.length,451);assert.equal(f.state.hasOlder,false);assert.equal(f.state.olderCursor,null);
 }
});
test('empty head transitions never silently reset a blocked older cursor',async()=>{
 const f=fixture();await seed(f,201,400);f.controller.older();await f.reject(Object.assign(Error('deleted'),{code:'CHAT_CURSOR_INVALID'}));
 f.controller.refresh();await f.resolve(page(1,0));assert.equal(f.state.headIds.size,0);f.controller.refresh();await f.resolve(page(501,700));
 assert.equal(f.state.olderBlocked,true);assert.equal(f.state.olderCursor,'cursor-201');assert.equal(f.views.at(-1).refreshRequired,true);
});

function nullableModel(nullCount, datedCount){
 const state=createHistoryState(),f={state,rows:[],calls:[],views:[],nullRows:Array.from({length:nullCount},(_,i)=>({...row(10000+i),id:'legacy-'+String(i+1).padStart(6,'0'),created_at:null})),datedCount};
 f.database=()=>[...rows(1,f.datedCount),...f.nullRows];
 f.controller=createHistoryController(state,{isCurrent:()=>true,validMessage:r=>!!r&&typeof r.id==='string',onMessages:incoming=>f.rows=mergeHistoryRows(f.rows,incoming),onChange:v=>f.views.push(v),onAccessChanged:()=>{throw Error('unexpected denial');},readMessages:async query=>{
  f.calls.push(query);const database=f.database(),end=query.before?database.findIndex(row=>'opaque:'+row.id===query.before):database.length;
  if(end<0)throw Object.assign(Error('deleted cursor'),{code:'CHAT_CURSOR_INVALID',refreshRequired:true});
  const start=Math.max(0,end-query.limit),messages=database.slice(start,end);return {success:true,messages,hasMore:start>0,nextCursor:start>0?'opaque:'+messages[0].id:null};
 }});
 f.drainGaps=async()=>{for(let budget=0;state.gaps.length&&budget<20;budget++)await f.controller.continueRecovery();assert.equal(state.gaps.length,0);};
 f.assertAll=()=>{const have=new Set(f.rows.map(row=>row.id));assert.equal(f.database().filter(row=>!have.has(row.id)).length,0);};
 return f;
}
test('sticky null rows cannot conceal a dated gap or falsely prove beginning',async()=>{
 const f=nullableModel(1,199);await f.controller.refresh();assert.equal(f.state.hasOlder,false);f.datedCount=449;await f.controller.refresh();f.assertAll();assert.equal(f.rows.length,450);assert.equal(f.state.gaps.length,0);assert.ok(f.calls.some(query=>query.before==='opaque:000251'));
});
test('exactly 200 null rows cannot conceal the first dated insert or later dated arrivals',async()=>{
 const f=nullableModel(200,0);await f.controller.refresh();assert.equal(f.state.hasOlder,false);f.datedCount=1;await f.controller.refresh();f.assertAll();assert.equal(f.state.nullBoundaryCursor,'opaque:legacy-000001');
 f.datedCount=452;await f.controller.refresh();await f.drainGaps();f.assertAll();assert.equal(f.state.gaps.length,0);assert.equal(f.state.nullBoundaryCursor,'opaque:legacy-000001');
});
test('more than 600 null rows retain bounded probe continuation across ordinary polls',async()=>{
 const f=nullableModel(1000,450);await f.controller.refresh();assert.equal(f.calls.length,1+CHAT_CATCHUP_PAGES);assert.equal(f.state.gaps.length,1);const probe=f.state.gaps[0],cursor=probe.cursor;assert.equal(probe.probe,true);assert.equal(f.views.at(-1).busy,null);
 await f.controller.refresh();assert.equal(f.calls.length,2+CHAT_CATCHUP_PAGES);assert.equal(f.state.gaps[0],probe);assert.equal(probe.cursor,cursor);
 await f.drainGaps();f.assertAll();assert.equal(f.state.nullBoundaryCursor,'opaque:legacy-000001');
 const before=f.calls.length;f.datedCount=901;await f.controller.refresh();await f.drainGaps();f.assertAll();assert.equal(f.calls[before+1].before,'opaque:legacy-000001');assert.equal(f.state.gaps.length,0);
});
test('null-only probes coexist with an unfinished older dated gap without losing either cursor',async()=>{
 const f=nullableModel(1,199);await f.controller.refresh();f.datedCount=1600;await f.controller.refresh();assert.equal(f.state.gaps.length,1);const olderGap=f.state.gaps[0],cursor=olderGap.cursor;
 f.nullRows.push(...Array.from({length:1000},(_,i)=>({...row(20000+i),id:'later-null-'+String(i).padStart(6,'0'),created_at:null})));f.nullRows.sort((a,b)=>a.id.localeCompare(b.id));
 await f.controller.refresh();assert.equal(f.state.gaps.length,2);assert.equal(f.state.gaps[0],olderGap);assert.equal(olderGap.cursor,cursor);assert.equal(f.state.gaps[1].probe,true);
 await f.drainGaps();f.assertAll();f.datedCount=1951;await f.controller.refresh();await f.drainGaps();f.assertAll();
});
test('deleted cached null cursor needs explicit refresh and cannot poison a later probe',async()=>{
 const f=nullableModel(601,1);await f.controller.refresh();await f.drainGaps();const deleted=f.state.nullBoundaryCursor;assert.match(deleted,/^opaque:legacy-/);f.nullRows=f.nullRows.filter(row=>'opaque:'+row.id!==deleted);f.datedCount=452;
 await f.controller.refresh();assert.equal(f.state.gaps.length,1);assert.equal(f.state.gaps[0].blocked,true);assert.equal(f.views.at(-1).refreshRequired,true);const cursor=f.state.gaps[0].cursor;
 await f.controller.refresh();assert.equal(f.state.gaps[0].blocked,true);assert.equal(f.state.gaps[0].cursor,cursor);
 await f.controller.refresh(true);await f.drainGaps();f.assertAll();assert.notEqual(f.state.nullBoundaryCursor,deleted);assert.equal(f.views.at(-1).refreshRequired,false);
 f.datedCount=803;await f.controller.refresh();await f.drainGaps();f.assertAll();assert.equal(f.state.gaps.length,0);
});
test('dated arrivals above an unfinished probe get a fresh null-boundary probe, even after older preload',async()=>{
 const f=nullableModel(400,450);await f.controller.refresh();assert.equal(f.state.gaps.length,1);const gap=f.state.gaps[0],cursor=gap.cursor;assert.equal(gap.probe,false);
 for(let budget=0;f.state.hasOlder&&budget<20;budget++)await f.controller.older();assert.equal(f.state.hasOlder,false);f.assertAll();
 f.datedCount=901;await f.controller.refresh();assert.equal(f.state.gaps[0],gap);assert.equal(gap.cursor,cursor);await f.drainGaps();f.assertAll();
});
test('malformed and infinite older-page dates preserve anchors and cursor without claiming exhaustion',async()=>{
 for(const time of ['infinity','-infinity','not a timestamp',Infinity,-Infinity]){
  const f=fixture();await seed(f,201,400);const anchors=[...f.state.datedHeadIds];f.controller.older();const bad=page(1,200);bad.messages[0].created_at=time;await f.resolve(bad);
  assert.equal(f.state.hasOlder,true);assert.equal(f.state.olderCursor,'cursor-201');assert.deepEqual([...f.state.datedHeadIds],anchors);assert.equal(f.rows.length,200);assert.ok(f.state.pageError);
 }
});
