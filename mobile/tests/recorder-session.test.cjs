const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const path = require('node:path');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/RecorderSession.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { RecorderSession } = context.exports;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function setup({prepare, stop, statusError, pauseError, resumeError} = {}) {
  const calls = []; let released = false, started = false, paused = false;
  const check = name => { assert.equal(released, false, `${name} used a released native object`); calls.push(name); };
  const native = {
    async prepareToRecordAsync() { check('prepare'); await prepare; },
    record() { check('record'); if (started && resumeError) throw Error('permission lost'); started = true; paused = false; },
    pause() { check('pause'); if (pauseError) throw Error('pause failed'); paused = true; },
    async stop() { check('stop'); await stop; },
    get uri() { check('uri'); return 'file:///voice.m4a'; },
    getStatus() { check('status'); if (statusError) throw Error('native object unavailable'); return {isRecording:!paused,metering:-30,durationMillis:4200}; },
    release() { check('release'); released=true; },
  };
  const session = new RecorderSession(() => { calls.push('create'); return native; });
  session.activate(); return {session, calls};
}
test('normal recording reads URI before release and never polls after release', async () => {
  const {session, calls} = setup();
  assert.equal(await session.start(),true); assert.equal(session.status().metering,-30);
  assert.equal(await session.stop(),'file:///voice.m4a');
  assert.equal(session.status(),null); session.dispose(); session.cancel();
  assert.deepEqual(calls,['create','prepare','record','status','stop','uri','release']);
});
test('unmount during prepare waits before release and never starts recording', async () => {
  const pending = deferred(); const {session,calls} = setup({prepare:pending.promise});
  const started = session.start(); session.dispose(); assert.equal(session.status(),null);
  assert.deepEqual(calls,['create','prepare']); pending.resolve(); assert.equal(await started,false);
  assert.deepEqual(calls,['create','prepare','release']);
});
test('blur during stop prevents URI access/upload and delays release until native stop settles', async () => {
  const pending=deferred(); const {session,calls}=setup({stop:pending.promise});
  await session.start(); const stopped=session.stop(); session.cancel();
  assert.equal(calls.includes('release'),false); pending.resolve(); assert.equal(await stopped,null);
  assert.deepEqual(calls,['create','prepare','record','stop','release']);
});
test('double taps do not overlap native start or stop', async () => {
  const pending=deferred(); const {session,calls}=setup({prepare:pending.promise});
  const first=session.start(); assert.equal(await session.start(),false); assert.equal(await session.stop(),null);
  pending.resolve(); await first;
  const stopping=session.stop(); assert.equal(await session.stop(),null); await stopping;
  assert.equal(calls.filter(x=>x==='create').length,1); assert.equal(calls.filter(x=>x==='stop').length,1);
});
test('a rejected prepare releases once and propagates the error to the UI handler', async () => {
  const pending=deferred(); const {session,calls}=setup({prepare:pending.promise});
  const start=session.start(); pending.reject(Error('permission lost'));
  await assert.rejects(start,/permission lost/); session.dispose();
  assert.deepEqual(calls,['create','prepare','release']);
});
test('polling a native failure retires the object instead of repeatedly accessing it', async () => {
  const {session,calls}=setup({statusError:true}); await session.start();
  assert.throws(()=>session.status(),/native object unavailable/);
  assert.equal(session.status(),null); assert.equal(session.isRecording,false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(x=>x==='release').length,1);
});
test('focus cannot start a second recorder while cancelled preparation is still pending', async () => {
  const pending=deferred(); const {session,calls}=setup({prepare:pending.promise});
  const start=session.start(); session.cancel(); session.activate();
  assert.equal(await session.start(),false); pending.resolve(); await start;
  assert.equal(calls.filter(x=>x==='create').length,1);
});
test('unmounted session cannot allocate audio when a delayed callback fires', async () => {
  const {session,calls}=setup(); session.dispose();
  assert.equal(await session.start(),false); assert.equal(await session.stop(),null); assert.equal(session.status(),null);
  assert.deepEqual(calls,[]);
});

test('cancel active audio waits for native stop before releasing and blocks restart', async () => {
 const pending=deferred(); const {session,calls}=setup({stop:pending.promise});
 await session.start(); session.cancel(); session.cancel();
 assert.equal(calls.includes('release'),false);
 assert.equal(await session.start(),false);
 pending.resolve(); await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['create','prepare','record','stop','release']);
});


test('pause and resume reuse one native file, retain duration, and allow stop while paused', async () => {
 const {session,calls}=setup(); await session.start();
 assert.equal(session.pause(),true); assert.equal(session.isRecording,false); assert.equal(session.isPaused,true); assert.equal(session.hasRecording,true);
 assert.equal(session.status().durationMillis,4200); assert.equal(session.status().isRecording,false);
 assert.equal(session.pause(),false); assert.equal(await session.start(),false);
 assert.equal(session.resume(),true); assert.equal(session.resume(),false); assert.equal(session.isRecording,true);
 assert.equal(session.pause(),true); assert.equal(await session.stop(),'file:///voice.m4a');
 assert.equal(session.hasRecording,false); assert.equal(session.resume(),false);
 assert.equal(calls.filter(x=>x==='prepare').length,1); assert.equal(calls.filter(x=>x==='record').length,2); assert.equal(calls.filter(x=>x==='stop').length,1); assert.equal(calls.filter(x=>x==='release').length,1);
});
test('pause/resume cannot touch preparing, stopping, cancelled or disposed objects', async () => {
 const prep=deferred(),stopped=deferred();const {session,calls}=setup({prepare:prep.promise,stop:stopped.promise});
 const start=session.start();assert.equal(session.pause(),false);assert.equal(session.resume(),false);prep.resolve();await start;
 session.pause();const stop=session.stop();assert.equal(session.pause(),false);assert.equal(session.resume(),false);session.dispose();assert.equal(session.status(),null);stopped.resolve();assert.equal(await stop,null);
 assert.equal(session.pause(),false);assert.equal(session.resume(),false);assert.equal(calls.includes('uri'),false);
});
test('navigation or unmount while paused stops native recording before releasing and never reads URI', async () => {
 for(const action of ['cancel','dispose']){
  const wait=deferred();const {session,calls}=setup({stop:wait.promise});await session.start();session.pause();session[action]();
  assert.equal(session.hasRecording,false);assert.equal(session.resume(),false);assert.equal(session.status(),null);assert.equal(calls.includes('release'),false);assert.equal(await session.start(),false);
  wait.resolve();await new Promise(r=>setImmediate(r));assert.equal(calls.includes('uri'),false);assert.equal(calls.at(-1),'release');assert.equal(calls.filter(x=>x==='stop').length,1);
 }
});
test('pause failure and permission loss on resume discard uncertain native state safely', async () => {
 for(const options of [{pauseError:true},{resumeError:true}]){
  const {session,calls}=setup(options);await session.start();
  if(options.pauseError)assert.throws(()=>session.pause(),/pause failed/);
  else{session.pause();assert.throws(()=>session.resume(),/permission lost/);}
  assert.equal(session.hasRecording,false);assert.equal(session.resume(),false);assert.equal(await session.stop(),null);await new Promise(r=>setImmediate(r));assert.equal(calls.includes('uri'),false);assert.equal(calls.filter(x=>x==='release').length,1);
 }
});
