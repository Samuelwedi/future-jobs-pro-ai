// Real source modules and handlers with controlled DOM/IntersectionObserver,
// transport and monotonic time. Synthetic evidence, not browser acceptance.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'../src'),uid=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const owner={id:uid(1),companyId:uid(2),role:'employee',token:'token'},member=uid(3),roomId='direct/one';
const context=(membershipInstanceId=member)=>({actorId:owner.id,companyId:owner.companyId,roomId,membershipInstanceId});
const row=(n=10,extra={})=>({id:uid(n),room_id:roomId,company_id:owner.companyId,sender_id:uid(4),view_version:uid(n+1000),message:'hello',created_at:'2020-01-01T00:00:00Z',...extra});
const page=(rows=[row()],membership=member)=>({success:true,viewContext:context(membership),messages:rows,hasMore:false,nextCursor:null});
const counts=(n=1,capped=false,membership=member)=>({success:true,viewState:{actorId:owner.id,companyId:owner.companyId,historyPolicy:'unmarked_until_viewed',rooms:[{roomId,membershipInstanceId:membership,unviewedCount:n,unviewedCountCapped:capped}]}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=()=>new Promise(setImmediate);
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function target(){const callbacks=new Map();return{addEventListener(k,fn){if(!callbacks.has(k))callbacks.set(k,new Set());callbacks.get(k).add(fn);},removeEventListener(k,fn){callbacks.get(k)?.delete(fn);},dispatchEvent(e){for(const fn of [...callbacks.get(e.type)||[]])fn(e);}};}
function fixture(){
 const f={clock:0,active:true,chooser:false,modal:false,nodes:[],posts:[],reads:[],counts:[],refreshes:0,denials:0,intersections:[],mutations:[],timers:new Map(),values:{token:owner.token,user:JSON.stringify(owner)}};
 const storage={getItem:k=>f.values[k]??null,setItem:(k,v)=>{f.values[k]=v;},removeItem:k=>delete f.values[k]};
 let timer=0;
 const win={...target(),innerWidth:1000,innerHeight:800,location:{origin:'https://example.test'},setTimeout:fn=>{f.timers.set(++timer,fn);return timer;},clearTimeout:id=>f.timers.delete(id),setInterval:()=>++timer,clearInterval:()=>{}};
 const doc={...target(),visibilityState:'visible',focused:true,hasFocus:()=>doc.focused,documentElement:{},querySelectorAll:()=>f.modal?[{getClientRects:()=>[1]}]:[],elementFromPoint:(x,y)=>{
   if(f.modal||f.covered)return null;
   return f.nodes.find(node=>{const b=node.box;if(x<b.left||x>b.right||y<b.top||y>b.bottom)return false;
     // Rounded Paper corners are transparent; midpoint probes stay inside.
     if((x<b.left+8||x>b.right-8)&&(y<b.top+8||y>b.bottom-8))return false;return true;})||null;
 }};
 f.root={clientLeft:0,clientTop:0,clientWidth:800,clientHeight:600,getBoundingClientRect:()=>({left:0,top:100,right:800,bottom:700,width:800,height:600}),contains:el=>f.nodes.includes(el),querySelectorAll:()=>f.nodes};
 const env={window:win,document:doc,navigator:{onLine:true},localStorage:storage,AbortController,performance:{now:()=>f.clock},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,extra){this.type=type;Object.assign(this,extra);}},getComputedStyle:()=>({visibility:'visible',display:'block',opacity:'1'}),IntersectionObserver:class{constructor(callback,options){this.callback=callback;this.options=options;this.elements=new Set();f.intersections.push(this);}observe(el){this.elements.add(el);}unobserve(el){this.elements.delete(el);}disconnect(){this.elements.clear();}},MutationObserver:class{constructor(callback){f.mutations.push(callback);}observe(){}disconnect(){}},fetch:(url,init={})=>{const d=deferred(),r={...d,url,init,body:init.body?JSON.parse(init.body):undefined};(init.method==='POST'?f.posts:f.reads).push(r);return d.promise;}};
 const modules={};const load=name=>{if(modules[name])return modules[name];const exports={};const source=fs.readFileSync(path.join(root,'services',name+'.ts'),'utf8').replaceAll('import.meta.env','({})');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...env,exports,require:name=>load(name.replace('./',''))});return modules[name]=exports;};
 f.views=load('chatViews');f.auth=load('authSession');f.chat=load('chatSession');f.session=f.chat.openChatSession(roomId,owner,()=>f.active);
 f.observer=f.views.createPrivateViewObserver({owner,roomId,session:f.session,isCurrent:()=>f.active,root:()=>f.root,chooserOpen:()=>f.chooser,onCount:count=>f.counts.push(count),onDenied:()=>{f.denials++;f.active=false;},refreshHistory:()=>f.refreshes++});
 f.add=(message=row(),box={left:40,top:120,right:400,bottom:220,width:360,height:100})=>{const node={box,isConnected:true,dataset:{chatViewId:message.id,chatViewVersion:message.view_version},getBoundingClientRect:()=>node.box,contains:value=>value===node};f.nodes.push(node);return node;};
 f.tick=(time=f.clock)=>{f.clock=time;f.observer.tick();};
 f.intersect=(node,ratio=1)=>{const io=f.intersections.at(-1);assert(io?.elements.has(node));io.callback([{target:node,isIntersecting:ratio>0,intersectionRatio:ratio}]);};
 f.history=(rows=[row()],membership=member)=>{f.observer.acceptHistory(page(rows,membership));f.tick();};
 f.see=(node)=>{f.intersect(node);f.tick();};
 f.ack=(index=0,extra={})=>{const p=f.posts[index];p.resolve(response({success:true,viewContext:context(p.body.membershipInstanceId),acknowledged:p.body.messages,...extra}));};
 Object.assign(f,{env,win,doc,load});return f;
}
test('history, render and elapsed time alone cannot acknowledge; full rounded bubble needs one monotonic second',async()=>{
 const f=fixture(),node=f.add();f.history();f.tick(5000);assert.equal(f.posts.length,0);f.see(node);f.tick(5999);assert.equal(f.posts.length,0);f.tick(6000);assert.equal(f.posts.length,1);
 assert.deepEqual(f.posts[0].body,{expectedActorId:owner.id,expectedCompanyId:owner.companyId,membershipInstanceId:member,messages:[{id:row().id,viewVersion:row().view_version}]});
 assert.equal(f.posts[0].init.headers.Authorization,'Bearer token');assert.equal(f.posts[0].init.cache,'no-store');f.ack();await flush();f.tick(20000);assert.equal(f.posts.length,1);f.observer.dispose();
});
test('offscreen, partially visible, oversized and page-clipped bubbles never acknowledge',()=>{
 for(const kind of ['offscreen','partial','oversized','pageclip','covered']){const f=fixture(),node=f.add();f.history();if(kind==='offscreen')node.box={...node.box,top:900,bottom:1000};if(kind==='oversized')node.box={...node.box,top:100,bottom:900,height:800};if(kind==='pageclip')f.win.innerHeight=150;if(kind==='covered')f.covered=true;f.intersect(node,kind==='partial'?0.99:1);f.tick();f.tick(5000);assert.equal(f.posts.length,0,kind);f.observer.dispose();}
});
test('rapid scroll-away, scroll events, resize and content-version change restart the entire dwell',()=>{
 for(const change of ['intersection','scroll','resize','version']){const f=fixture(),node=f.add();f.history();f.see(node);f.tick(900);
 if(change==='intersection'){f.intersect(node,0);f.intersect(node);}if(change==='scroll')f.doc.dispatchEvent({type:'scroll'});if(change==='resize')f.win.dispatchEvent({type:'resize'});if(change==='version'){const edited=row(10,{view_version:uid(999)});node.dataset.chatViewVersion=edited.view_version;f.observer.acceptMessage(edited);}
 f.tick(1000);assert.equal(f.posts.length,0,change);f.tick(1999);assert.equal(f.posts.length,0);f.tick(2000);assert.equal(f.posts.length,1);f.observer.dispose();}
});
test('own messages, unsupported metadata and socket-only history never become eligible',()=>{
 for(const kind of ['own','missing','socket','foreign']){const f=fixture(),message=row(10,kind==='own'?{sender_id:owner.id}:kind==='missing'?{view_version:undefined}:kind==='foreign'?{company_id:uid(555)}:{}),node=f.add(message);if(kind==='socket')f.observer.acceptMessage(message);else f.history([message]);f.tick();f.intersect(node);f.tick();f.tick(3000);assert.equal(f.posts.length,0,kind);f.observer.dispose();}
});
test('new socket arrivals below the viewport do not mark read while browsing older messages',()=>{
 const f=fixture(),old=f.add();f.history();f.see(old);const latest=row(11),node=f.add(latest,{left:40,top:900,right:400,bottom:1000,width:360,height:100});f.observer.acceptMessage(latest);f.tick();f.intersect(node,0);f.tick(1000);assert.equal(f.posts.length,1);assert.equal(f.posts[0].body.messages.length,1);assert.equal(f.posts[0].body.messages[0].id,old.dataset.chatViewId);f.observer.dispose();
});
test('modal, chooser, blur, hidden page and offline interrupt observation and cannot replay unseen versions',()=>{
 for(const kind of ['modal','chooser','blur','hidden','offline']){const f=fixture(),node=f.add();f.history();f.see(node);f.tick(900);
 if(kind==='modal')f.modal=true;if(kind==='chooser')f.chooser=true;if(kind==='blur')f.doc.focused=false;if(kind==='hidden')f.doc.visibilityState='hidden';if(kind==='offline')f.env.navigator.onLine=false;
 f.mutations.forEach(fn=>fn());f.tick(1500);f.modal=f.chooser=false;f.doc.focused=true;f.doc.visibilityState='visible';f.env.navigator.onLine=true;f.tick(3000);f.intersect(node);f.tick(5000);assert.equal(f.posts.length,0,kind);
 f.history();f.see(node);f.tick(5999);assert.equal(f.posts.length,0);f.tick(6000);assert.equal(f.posts.length,1);f.observer.dispose();}
});
test('batching is capped at 100, single-flight and recomputes visibility instead of queueing remaining rows',async()=>{
 const f=fixture(),rows=Array.from({length:130},(_,i)=>row(10+i));const nodes=rows.map((r,i)=>{const left=10+(i%13)*30,top=110+Math.floor(i/13)*30;return f.add(r,{left,top,right:left+20,bottom:top+20,width:20,height:20});});f.history(rows);nodes.forEach(node=>f.intersect(node));f.tick();f.tick(1000);assert.equal(f.posts.length,1);assert.equal(f.posts[0].body.messages.length,100);f.tick(3000);assert.equal(f.posts.length,1);
 nodes.slice(100).forEach(node=>f.intersect(node,0));f.ack();await flush();f.tick(5000);assert.equal(f.posts.length,1);f.observer.dispose();
});
test('malformed or mismatched exact acknowledgements leave unknown counts and no count refresh',async()=>{
 for(const bad of [{success:false},{viewContext:context(uid(7))},{acknowledged:[]},{acknowledged:[{id:row().id,viewVersion:uid(8)}]},{viewContext:{...context(),actorId:uid(8)}}]){const f=fixture(),node=f.add();f.history();f.see(node);f.tick(1000);const reads=f.reads.length;f.ack(0,bad);await flush();assert.equal(f.counts.at(-1),null);assert.equal(f.reads.length,reads);f.tick(5000);assert.equal(f.posts.length,1);f.observer.dispose();}
});
test('deleted or edited message 409 requires new accepted history and reobservation, never old exact replay',async()=>{
 const f=fixture(),node=f.add();f.history();f.see(node);f.tick(1000);const previous=f.refreshes;f.posts[0].resolve(response({code:'CHAT_VIEW_STALE',refreshRequired:true},409));await flush();assert(f.refreshes>previous);f.tick(3000);f.intersect(node);f.tick(5000);assert.equal(f.posts.length,1);
 const edited=row(10,{view_version:uid(99)});node.dataset.chatViewVersion=edited.view_version;f.history([edited]);f.see(node);f.tick(6000);assert.equal(f.posts.length,2);assert.equal(f.posts[1].body.messages[0].viewVersion,edited.view_version);f.observer.dispose();
});
test('current 401/402/403 stops private observation; stale denial after auth ABA, modal or unmount does not',async()=>{
 for(const status of [401,402,403]){const f=fixture(),node=f.add();f.history();f.see(node);f.tick(1000);f.posts[0].resolve(response({},status));await flush();assert.equal(f.denials,1);assert.equal(f.counts.at(-1),null);f.observer.dispose();}
 for(const change of ['aba','token','role','modal','dispose']){const f=fixture(),node=f.add();f.history();f.see(node);f.tick(1000);if(change==='aba'){f.auth.setAuthSession('other',{...owner,id:uid(9)});f.auth.setAuthSession('token',owner);}if(change==='token')f.values.token='other';if(change==='role')f.auth.updateAuthUser({...owner,role:'manager'});if(change==='modal'){f.modal=true;f.mutations.forEach(fn=>fn());}if(change==='dispose')f.observer.dispose();f.posts[0].resolve(response({},401));await flush();assert.equal(f.denials,0,change);f.observer.dispose();}
});
test('pre-ack counts cannot overwrite post-ack counts, and ignored commits invalidate a replacement reader',async()=>{
 const f=fixture(),node=f.add();f.history();f.see(node);assert.equal(f.reads.length,1);f.tick(1000);f.ack();await flush();f.reads[0].resolve(response(counts(9)));await flush();assert.equal(f.counts.at(-1),null);assert.equal(f.reads.length,2);f.reads[1].resolve(response(counts(0)));await flush();assert.equal(f.counts.at(-1).unviewedCount,0);f.observer.dispose();
 const g=fixture(),other=g.add();g.history();g.see(other);g.tick(1000);g.observer.dispose();const newer=[];const reader=g.views.createViewCountReader({owner,isCurrent:()=>true,read:async()=>counts(8),onCounts:value=>newer.push(value),onDenied:()=>assert.fail()});await reader.refresh();assert.equal(newer.at(-1)[0].unviewedCount,8);g.ack();await flush();assert.equal(newer.at(-1),null);reader.dispose();
});
test('count validators preserve exact 99 versus 99+, missing room and unknown responses',()=>{
 const f=fixture();assert.equal(f.views.privateViewLabel(f.views.parseViewCounts(counts(99),owner)[0]),'Messages not marked read: 99');assert.equal(f.views.privateViewLabel(f.views.parseViewCounts(counts(99,true),owner)[0]),'Messages not marked read: 99+');
 for(const data of [{},counts(-1),counts(100),counts(1,true),{...counts(),viewState:{...counts().viewState,actorId:uid(5)}},{...counts(),viewState:{...counts().viewState,rooms:[...counts().viewState.rooms,...counts().viewState.rooms]}}])assert.equal(f.views.parseViewCounts(data,owner),null);
 assert.equal(f.views.privateViewLabel(undefined),'Messages not marked read: unavailable');f.observer.dispose();
});
test('membership mismatch count stays unknown until accepted fresh context; no stale membership POST',async()=>{
 const f=fixture(),node=f.add();f.history();f.reads[0].resolve(response(counts(7,false,uid(77))));await flush();assert.equal(f.counts.at(-1),null);f.tick();f.intersect(node);f.tick(3000);assert.equal(f.posts.length,0);f.observer.dispose();
});
test('metadata transport handles old-server 404 and payment errors locally; history fallback is bounded and read-only',async()=>{
 const f=fixture();f.observer.dispose();let read=f.session.readViewCounts();f.reads.at(-1).resolve(response({},404));await assert.rejects(read,e=>e.code==='CHAT_VIEWS_UNAVAILABLE');
 read=f.session.readMessages({limit:200,views:true});assert.match(f.reads.at(-1).url,/views=1/);f.reads.at(-1).resolve(response({code:'CHAT_QUERY_INVALID'},400));await flush();assert.doesNotMatch(f.reads.at(-1).url,/views=/);f.reads.at(-1).resolve(response({...page(),viewContext:undefined}));await read;
 read=f.session.readMessages({limit:200,views:true});assert.doesNotMatch(f.reads.at(-1).url,/views=/);f.reads.at(-1).resolve(response(page()));await read;assert.equal(f.posts.length,0);
 const g=fixture();g.observer.dispose();read=g.session.readMessages({limit:200,views:true});g.reads.at(-1).resolve(response({},402));await assert.rejects(read,e=>e.code==='CHAT_ACCESS_CHANGED');
});

function sourceHandler(name,env){const source=fs.readFileSync(path.join(root,'pages/Chat.tsx'),'utf8'),ast=ts.createSourceFile('Chat.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)found=n.initializer;if(ts.isPropertyAssignment(n)&&n.name.getText(ast)===name)found=n.initializer;ts.forEachChild(n,visit);}visit(ast);assert(found,name);return vm.runInNewContext(ts.transpileModule('result = '+found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,env);}
test('real accepted-history callback ignores invalid foreign/stale pages and replaces membership with fresh head and detail fence',async()=>{
 const f=fixture();f.observer.dispose();const h=f.load('chatHistory'),state=h.createHistoryState(),pending=[],merged=[],privateCalls=[];
 const env={isSupport:false,user:owner,roomId,parseViewHistory:f.views.parseViewHistory,viewsRef:{current:{historyCurrent:()=>true,acceptHistory:data=>privateCalls.push(data),interrupt:()=>privateCalls.push('interrupt')}},privateMembership:{current:member},historyState:{current:state},createHistoryState:h.createHistoryState,foreground:{current:{active:true,epoch:1}},didInitialScroll:{current:true},scrollSnapshot:{current:{}},sessionRef:{current:{}},setMessages:rows=>{merged.length=0;merged.push(...rows);},setRoom:value=>{env.room=value;},setViewCount:value=>{env.count=value;},setLoading:value=>{env.loading=value;},setViewEpoch:()=>{}};
 env.replacePrivateMembership=sourceHandler('replacePrivateMembership',env);const accepted=sourceHandler('onAcceptedPage',env);
 const controller=h.createHistoryController(state,{readMessages:()=>{const d=deferred();pending.push(d);return d.promise;},isCurrent:()=>env.foreground.current.epoch===1,validMessage:row=>row.company_id===owner.companyId&&row.room_id===roomId&&typeof row.created_at==='string',onAcceptedPage:accepted,onMessages:rows=>merged.push(...rows),onChange:()=>{},onAccessChanged:()=>assert.fail('unexpected denial')});
 controller.refresh();pending.shift().resolve({...page(),hasMore:true,nextCursor:'old-member-cursor'});await flush();assert.equal(privateCalls.length,1);assert.equal(merged.length,1);
 controller.refresh();pending.shift().resolve(page([row(12,{company_id:uid(555)})],uid(7)));await flush();assert.equal(privateCalls.length,1);assert.equal(env.privateMembership.current,member);assert.equal(merged.length,1);
 controller.older();pending.shift().resolve(page([row(13)],uid(7)));await flush();assert.equal(env.privateMembership.current,uid(7));assert.equal(env.foreground.current.epoch,2);assert.equal(env.sessionRef.current,null);assert.equal(env.room,null);assert.equal(env.count,null);assert.equal(merged.length,0);assert.equal(state.initialized,false);assert.equal(state.olderCursor,null);assert.equal(state.gaps.length,0);assert.equal(env.didInitialScroll.current,false);
 // The old effect's detail response check now fails before setRoom.
 assert.equal(env.foreground.current.epoch===1,false);controller.dispose();
});
test('real history controller validates generation and rows before private metadata, including late 403',async()=>{
 const f=fixture();f.observer.dispose();const h=f.load('chatHistory');for(const rejected of [false,true]){const d=deferred();let current=true,accepted=0,denied=0;const controller=h.createHistoryController(h.createHistoryState(),{readMessages:()=>d.promise,isCurrent:()=>current,validMessage:()=>true,onAcceptedPage:()=>{accepted++;return true;},onMessages:()=>assert.fail(),onChange:()=>{},onAccessChanged:()=>denied++});const run=controller.refresh();current=false;rejected?d.reject(Object.assign(Error('late'),{code:'CHAT_ACCESS_CHANGED'})):d.resolve(page());await run;assert.equal(accepted,0);assert.equal(denied,0);controller.dispose();}
});
test('real file chooser handlers invalidate before opening and release only selection/cancel; pagehide waits for pageshow',()=>{
 const f=fixture();f.observer.dispose();const env={chooserOpen:{current:false},viewsRef:{current:{interrupt:()=>env.interrupted++}},setViewCount:value=>{env.count=value;},interrupted:0};sourceHandler('beginChooser',env)();assert.equal(env.chooserOpen.current,true);assert.equal(env.interrupted,1);assert.equal(env.count,null);sourceHandler('endChooser',env)();assert.equal(env.chooserOpen.current,false);
 const source=fs.readFileSync(path.join(root,'pages/Chat.tsx'),'utf8');assert.match(source,/if \(!pageActive.current \|\| document.visibilityState/);assert.match(source,/const hidePage = \(\) => \{ pageActive.current = false; suspend\(\); \}/);assert.match(source,/element.oncancel = endChooser/);assert.match(source,/data-chat-view-id=\{!isMine && !isSupport/);assert.match(source,/aria-label=\{privateViewLabel\(viewCount\)\}/);
});
test('network/modal observation epochs reject history captured before interruption; partial socket updates cannot inherit old versions',()=>{
 const f=fixture(),node=f.add();f.history();const stamp=f.observer.historyEpoch();assert.equal(f.observer.historyCurrent(stamp),true);f.env.navigator.onLine=false;f.win.dispatchEvent({type:'offline'});f.env.navigator.onLine=true;f.tick();assert.equal(f.observer.historyCurrent(stamp),false);
 f.history();f.see(node);f.tick(900);f.observer.acceptMessage({...row(),view_version:undefined});f.tick(2000);assert.equal(f.posts.length,0);f.observer.dispose();
});
test('metadata JSON completion is fenced after foreground epoch, token and auth ABA change',async()=>{
 for(const mode of ['guard','token','aba']){const f=fixture();f.observer.dispose();const body=deferred();let active=true;const request=f.session.acknowledgeViews(member,[{id:row().id,viewVersion:row().view_version}],()=>active);f.posts[0].resolve({...response({}),json:()=>body.promise});await flush();if(mode==='guard')active=false;if(mode==='token')f.values.token='new';if(mode==='aba'){f.auth.setAuthSession('new',{...owner,id:uid(9)});f.auth.setAuthSession('token',owner);}body.resolve({success:true,viewContext:context(),acknowledged:f.posts[0].body.messages});await assert.rejects(request,e=>e.code==='CHAT_STALE');}
});
test('unsupported history permanently strips mixed-deployment metadata and blocks this session acknowledgements/counts',async()=>{
 const f=fixture(),node=f.add();
 // Leave a count GET outstanding while the history route reports unsupported.
 const oldCount=f.reads[0];const directCount=f.session.readViewCounts(),directCountRequest=f.reads.at(-1);const query={limit:200,before:'opaque+/cursor',views:true};
 let read=f.session.readMessages(query);f.reads.at(-1).resolve(response({code:'CHAT_QUERY_INVALID'},400));await flush();
 assert.doesNotMatch(f.reads.at(-1).url,/views=/);assert.match(f.reads.at(-1).url,/limit=200&before=opaque%2B%2Fcursor$/);
 directCountRequest.resolve(response(counts(0)));await assert.rejects(directCount,e=>e.code==='CHAT_STALE');
 // An inconsistent deployment sends private fields even on the legacy route.
 f.reads.at(-1).resolve(response(page()));let data=await read;
 assert.equal(data.viewContext,undefined);assert.equal(data.messages[0].view_version,undefined);assert.equal(data.messages[0].message,'hello');
 f.observer.acceptHistory(data);f.tick();f.see(node);f.tick(2000);assert.equal(f.posts.length,0);
 oldCount.resolve(response(counts(0)));await flush();assert.equal(f.counts.at(-1),null);
 const requests=f.reads.length;
 await assert.rejects(f.session.acknowledgeViews(member,[{id:row().id,viewVersion:row().view_version}]),e=>e.code==='CHAT_VIEWS_UNAVAILABLE');
 await assert.rejects(f.session.readViewCounts(),e=>e.code==='CHAT_VIEWS_UNAVAILABLE');assert.equal(f.posts.length,0);assert.equal(f.reads.length,requests);
 // Later reads remain useful history, but cannot re-enable recording.
 read=f.session.readMessages({limit:200,views:true});f.reads.at(-1).resolve(response(page()));data=await read;
 assert.equal(data.viewContext,undefined);assert.equal(data.messages[0].view_version,undefined);f.observer.acceptHistory(data);f.tick();f.see(node);f.tick(4000);assert.equal(f.posts.length,0);assert.equal(f.counts.at(-1),null);f.observer.dispose();
});
test('capability loss immediately clears a displayed count and context even when legacy fallback fails',async()=>{
 const f=fixture();f.history();f.reads[0].resolve(response(counts(5)));await flush();f.reads.at(-1).resolve(response(counts(5)));await flush();assert.equal(f.counts.at(-1).unviewedCount,5);
 const stamp=f.observer.historyEpoch(),read=f.session.readMessages({limit:200,views:true});f.reads.at(-1).resolve(response({code:'CHAT_QUERY_INVALID'},400));await flush();
 assert.equal(f.counts.at(-1),null,'must clear before fallback finishes');assert.equal(f.observer.historyCurrent(stamp),false,'old metadata is invalid immediately');assert.doesNotMatch(f.reads.at(-1).url,/views=/);
 f.reads.at(-1).resolve(response({},500));await assert.rejects(read);f.tick(5000);assert.equal(f.counts.at(-1),null);assert.equal(f.posts.length,0);assert.equal(f.denials,0);f.observer.dispose();
});
