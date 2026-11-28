const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),express=require('express');
const {once}=require('node:events');
const ex={};
new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/shiftAttachmentPreviewHttp.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText)(ex);
const create=ex.createShiftAttachmentPreviewHandler;
const ids=[1,2,3].map(n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'));
const jpeg=Buffer.from([255,216,255,123]);
async function fixture(t,read,timeout=1000,capacity=2){
  const app=express();
  app.all('/:shiftId/:attachmentId',create(req=>req.headers.authorization==='fixture'?ids[0]:undefined,read,timeout,capacity));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base='http://127.0.0.1:'+server.address().port;
  return (options={},p=ids.slice(1).join('/'))=>fetch(base+'/'+p,{...options,headers:{authorization:'fixture','X-Project-Actor':ids[0],'X-Project-Company':ids[0],...options.headers}});
}
test('authenticated GET receives only private derivative, never a 304 or range',async t=>{
  let calls=0;
  const get=await fixture(t,async(a,c,s,d,signal)=>{assert.equal(c,ids[0]);assert.deepEqual([a,s,d],ids);assert.equal(signal.aborted,false);calls++;return jpeg;});
  for(const headers of [{},{'If-None-Match':'*','If-Modified-Since':'Wed, 21 Oct 2037 07:28:00 GMT',range:'bytes=0-0'}]){
    const r=await get({headers});assert.equal(r.status,200);
    assert.equal(r.headers.get('content-type'),'image/jpeg');
    assert.equal(r.headers.get('etag'),null);assert.equal(r.headers.get('location'),null);
    assert.equal(r.headers.get('content-range'),null);
    assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');
    assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()),jpeg);
  }
  assert.equal(calls,2);
});
test('rejects bad method, missing authentication and malformed identifiers before reader',async t=>{
  let calls=0;const get=await fixture(t,async()=>{calls++;return null;});
  for(const [r,status] of [[await get({method:'HEAD'}),405],[await get({headers:{authorization:'untrusted'}}),401],
      [await get({},'bad/id'),404]]){
    assert.equal(r.status,status);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(await r.text(),'');
  }
  assert.equal(calls,0);
});
test('denial, malformed derivative and internal errors do not expose details',async t=>{
  let n=0;const get=await fixture(t,async()=>{switch(++n){case 1:return null;case 2:return Buffer.from('private');case 3:return Buffer.alloc(1024*1024+1);default:throw Error('do not disclose');}});
  for(const status of [404,503,503,503]){const r=await get();assert.equal(r.status,status);assert.equal(await r.text(),'');}
});
test('deadline aborts and replies, retaining capacity until the operation actually settles',async t=>{
  let signal,finish,calls=0;
  const get=await fixture(t,async(_a,_c,_s,_d,s)=>{if(++calls>1)return jpeg;signal=s;return new Promise(r=>finish=r);},50,1);
  const r=await get();assert.equal(r.status,503);assert.equal(signal.aborted,true);
  assert.equal((await get()).status,503);assert.equal(calls,1);
  finish(jpeg);await new Promise(setImmediate);
  assert.equal((await get()).status,200);
});
test('client disconnect signals cancellation without releasing occupied capacity',async t=>{
  let finish,started,serverAbort,calls=0;
  const ready=new Promise(r=>started=r),aborted=new Promise(r=>serverAbort=r);
  const get=await fixture(t,async(_a,_c,_s,_d,s)=>{if(++calls>1)return jpeg;
    s.addEventListener('abort',serverAbort,{once:true});started();return new Promise(r=>finish=r);},1000,1);
  const stop=new AbortController(),complete=get({signal:stop.signal}).catch(e=>e);
  await ready;stop.abort();const abortTimer=AbortSignal.timeout(1500);
  await Promise.race([aborted,new Promise((_,reject)=>abortTimer.addEventListener('abort',()=>reject(Error('disconnect was not observed'))))]);
  assert.equal((await complete).name,'AbortError');
  assert.equal((await get()).status,503);assert.equal(calls,1);
  finish(jpeg);await new Promise(setImmediate);
  assert.equal((await get()).status,200);
});
