// The same real effect regressions can run against the untouched base with
// WEB_CHAT_SOURCE_ROOT=/path/to/base/web. Shared helpers come from this candidate.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=process.env.WEB_CHAT_SOURCE_ROOT||path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/pages/Chat.tsx'),'utf8');
const ast=ts.createSourceFile('Chat.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const exportsHistory={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/chatHistory.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsHistory});
const evaluate=(code,c)=>vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
function fixture(){
 const calls=[],pending=[],callbacks={},listeners={},docListeners={},intervals=[];
 const c={roomId:'room',user:{id:'owner',companyId:'company',role:'employee',token:'token'},foreground:{current:{active:true,epoch:1}},sessionRef:{current:null},historyRef:{current:null},historyState:{current:exportsHistory.createHistoryState()},createHistoryController:exportsHistory.createHistoryController,scope:true,messages:[],scrolls:0,WS_URL:'https://example.test'};
 c.isCurrent=()=>c.scope;c.setReady=v=>c.ready=v;c.setConnected=v=>c.connected=v;c.setLoading=v=>c.loading=v;c.setError=v=>c.error=v;c.setRoom=v=>c.room=v;c.setHistory=v=>c.history=v;c.accessChanged=()=>{c.scope=false;c.messages=[];};
 c.mergeMessages=incoming=>{c.messages=exportsHistory.mergeHistoryRows(c.messages,incoming);};c.messagesEndRef={current:{scrollIntoView:()=>c.scrolls++}};
 c.window={setInterval:fn=>{intervals.push(fn);return 1;},clearInterval:()=>{},setTimeout:fn=>fn(),addEventListener:(k,fn)=>listeners[k]=fn,removeEventListener:(k)=>delete listeners[k]};
 c.document={visibilityState:'visible',addEventListener:(k,fn)=>docListeners[k]=fn,removeEventListener:k=>delete docListeners[k]};
 c.openChatSession=(_room,_owner,current)=>({token:'token',isCurrent:current,readMessages:query=>{calls.push(query);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},readRoom:async()=>({success:true,room:{id:'room'}})});
 let ack;c.io=()=>({on:(k,fn)=>callbacks[k]=fn,emit:(k,_room,fn)=>{if(k==='join-room')ack=fn;},disconnect:()=>{}});
 const validator=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='validMessage');evaluate(validator.getText(ast),c);
 let found;function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('const fetchMessages'))found=n.arguments[0];ts.forEachChild(n,visit);}visit(ast);assert.ok(found);
 const cleanup=evaluate('result = '+found.getText(ast),c)();
 return {c,calls,pending,callbacks,listeners,docListeners,intervals,cleanup,join:()=>{callbacks.connect();ack({success:true});},reply:async body=>{assert.ok(pending.length);pending.shift().resolve(body);await new Promise(setImmediate);}};
}
const row=n=>({id:String(n).padStart(6,'0'),room_id:'room',company_id:'company',sender_id:'owner',message:String(n),created_at:new Date(n*1000).toISOString()});
const page=(a,b)=>({success:true,messages:Array.from({length:b-a+1},(_,i)=>row(a+i)),hasMore:a>1,nextCursor:a>1?'cursor-'+a:null});
test('real web effect opts into message history pagination',async()=>{
 const f=fixture();assert.equal(f.calls[0]?.limit,200);await f.reply(page(201,400));assert.equal(f.c.history?.hasOlder,true);f.cleanup();
});
test('real web reconnect effect recovers all rows across a latest-window gap',async()=>{
 const f=fixture();await f.reply(page(1,200));f.join();await f.reply(page(251,450));if(f.pending.length)await f.reply(page(51,250));assert.equal(f.c.messages.length,450);assert.equal(f.c.messages.some(row=>row.id==='000225'),true);f.cleanup();
});
test('real web poll focus visibility and rejoin triggers share one in-flight fetch',async()=>{
 const f=fixture();f.join();f.listeners.focus();f.docListeners.visibilitychange();f.intervals[0]();assert.equal(f.calls.length,1);await f.reply(page(1,200));assert.equal(f.calls.length,2);await f.reply(page(1,200));assert.equal(f.calls.length,2);f.cleanup();
});
test('real web socket event does not force a reader to the latest message',async()=>{
 const f=fixture();await f.reply(page(1,200));f.callbacks['new-message'](row(201));assert.equal(f.c.scrolls,0);assert.equal(f.c.messages.length,201);f.cleanup();
});
test('real web older action is single-flight and effect cleanup fences late results',async()=>{
 const f=fixture();await f.reply(page(201,400));f.c.historyRef.current.older();f.c.historyRef.current.older();assert.equal(f.calls.length,2);f.cleanup();await f.reply(page(1,200));assert.equal(f.c.messages.length,200);assert.equal(f.c.historyRef.current,null);
});
test('real web validator accepts unknown legacy dates only for reads, never weakens send acknowledgements',()=>{
 const f=fixture(),unknown={...row(1),created_at:null};assert.equal(evaluate('validMessage(value, roomId, user.companyId, true)',{...f.c,value:unknown}),true);assert.equal(evaluate('validMessage(value, roomId, user.companyId)',{...f.c,value:unknown}),false);f.cleanup();
});
test('real view exposes refresh recovery older controls and stable scroll anchors',()=>{
 assert.match(source,/historyRef.current\?\.refresh\(true\)/);assert.match(source,/historyRef.current\?\.continueRecovery\(\)/);assert.match(source,/historyRef.current\?\.older\(\)/);assert.match(source,/data-message-id=\{msg.id\}/);assert.match(source,/Time unavailable/);assert.match(source,/captureChatScroll\(messageListRef.current, kind === 'history'\)/);assert.match(source,/restoreChatScroll\(container, scrollSnapshot.current\)/);
});
test('real web empty room then reconnect exposes older history instead of claiming beginning',async()=>{
 for(const socketFirst of [false,true]){
  const f=fixture();await f.reply(page(1,0));assert.equal(f.c.history.hasOlder,false);
  if(socketFirst)f.callbacks['new-message'](row(450));
  f.join();await f.reply(page(251,450));assert.equal(f.c.history.hasOlder,true);assert.equal(f.c.historyState.current.olderCursor,'cursor-251');
  f.c.historyRef.current.older();assert.equal(f.calls.at(-1).before,'cursor-251');await f.reply(page(51,250));
  f.c.historyRef.current.older();await f.reply(page(1,50));assert.equal(f.c.messages.length,450);assert.equal(f.c.history.hasOlder,false);f.cleanup();
 }
});
test('real web effect ignores sticky null overlap and recovers missing dated messages',async()=>{
 const f=fixture(),legacy={...row(1000),id:'legacy',created_at:null};const old=page(1,199);old.messages.push(legacy);await f.reply(old);
 f.join();const recent=page(251,449);recent.messages.push(legacy);await f.reply(recent);assert.equal(f.calls.at(-1).before,'cursor-251');assert.equal(f.c.history.gaps,1);
 await f.reply(page(51,250));assert.equal(f.c.messages.length,450);assert.equal(f.c.history.gaps,0);assert.equal(f.c.messages.at(-1).created_at,null);f.cleanup();
});
test('real web malformed or infinite timestamps reject the page without changing history boundaries',async()=>{
 for(const time of ['infinity','-infinity','not a timestamp',Infinity,-Infinity]){
  const f=fixture();await f.reply(page(1,200));f.join();const bad=page(251,450);bad.messages[0].created_at=time;await f.reply(bad);
  assert.equal(f.c.messages.length,200);assert.ok(f.c.history.latestError);assert.equal(f.c.historyState.current.headIds.has('000200'),true);assert.equal(f.c.history.hasOlder,false);assert.equal(f.c.history.gaps,0);f.cleanup();
 }
});
