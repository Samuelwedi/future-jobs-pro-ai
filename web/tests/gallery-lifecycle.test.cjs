const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,deferred}=require('./helpers/gallery-lifecycle.cjs');
test('project switch masks list and modal before effects; retained callbacks cannot act',async()=>{const f=fixture();await f.loaded();const open=f.find('Open media').props.onClick;open();f.render();const close=f.nodes().find(n=>n.type==='Dialog').props.onClose;const download=f.find('Download photo').props.onClick;assert.equal(f.images().length,2);f.route('B');f.render();assert.equal(f.images().length,0);open();close();download();assert.equal(f.downloads.length,0);f.settle();await f.resolve(1,'private-B');assert(f.images()[0].includes('private-B'));close();f.render();assert.equal(f.images().length,1)});
for(const field of ['id','company','role','token'])test(field+' identity switch/ABA masks before effects',async()=>{const f=fixture();await f.loaded();const open=f.find('Open media').props.onClick;open();f.render();const old=f.actor[field];f.actor[field]='different';f.store();f.render();assert.equal(f.images().length,0);f.actor[field]=old;f.store();f.render();open();assert.equal(f.images().length,0);f.settle();});
test('same-owner token generation ABA invalidates without intermediate render',async()=>{const f=fixture();await f.loaded();const open=f.find('Open media').props.onClick;f.auth.setAuthSession('new',{id:f.actor.id,companyId:f.actor.company,role:f.actor.role});f.auth.setAuthSession(f.actor.token,{id:f.actor.id,companyId:f.actor.company,role:f.actor.role});open();f.render();assert.equal(f.images().length,0)});
test('late old response and deferred body cannot overwrite current project',async()=>{const f=fixture();f.render();f.settle();const body=deferred();f.requests[0].resolve({ok:true,json:()=>body.promise});await f.tick();f.route('B');f.render();f.settle();await f.resolve(1,'B');body.resolve({media:[f.row('A')]});await f.tick();f.render();assert(f.images()[0].includes('/B.'));assert(f.requests[0].options.signal.aborted)});
test('route ABA cannot revive old callbacks/results without effects',async()=>{const f=fixture();await f.loaded();const open=f.find('Open media').props.onClick;f.route('B');f.render();f.route('A');f.render();open();assert.equal(f.images().length,0);f.settle();});
for(const event of ['blur','pagehide'])test(event+' clears display and callbacks, returning requires fresh load',async()=>{const f=fixture();await f.loaded();const open=f.find('Open media').props.onClick;f.window.dispatchEvent({type:event});open();f.render();assert.equal(f.images().length,0);f.window.dispatchEvent({type:'focus'});f.render();assert.equal(f.images().length,0);f.settle();await f.resolve(1,'new');assert.equal(f.images().length,1)});
test('download single-flight survives scope change and rejects old completion',async()=>{const f=fixture();await f.loaded();const download=f.find('Download photo').props.onClick;download();download();assert.equal(f.downloads.length,1);assert(f.downloads[0].current());f.route('B');f.render();assert(!f.downloads[0].current());f.settle();await f.resolve(1,'B');assert(f.find('Download photo').props.disabled);f.downloads[0].reject(Error('stale'));await f.tick();f.render();assert.equal(f.find('Download photo').props.disabled,false);assert(!JSON.stringify(f.nodes()).includes('Unable to download'))});
test('old modal close/download cannot affect reopened selection',async()=>{const f=fixture();await f.loaded();f.find('Open media').props.onClick();f.render();const close=f.nodes().find(n=>n.type==='Dialog').props.onClose;const download=f.nodes().find(n=>n.type==='Button'&&n.props.startIcon?.type==='Download').props.onClick;close();f.render();f.find('Open media').props.onClick();f.render();close();download();f.render();assert.equal(f.images().length,2);assert.equal(f.downloads.length,0)});
test('audio pending play is paused/cleared on auth change and late promise cannot revive it',async()=>{const f=fixture();f.actor.mediaType='voice_note';await f.loaded('voice');const play=f.nodes().find(n=>n.type==='IconButton'&&n.children.some(c=>c?.type==='PlayArrow')).props.onClick;play();assert.equal(f.audios.length,1);f.actor.token='new';f.announce();assert(f.audios[0].pauses);f.audios[0].playGate.resolve();await f.tick();f.render();assert(!JSON.stringify(f.nodes()).includes('private-voice'));play();assert.equal(f.audios.length,1)});
test('unmount rejects pending fetch and retained handlers; StrictMode replay reloads safely',async()=>{const f=fixture();f.render();f.settle();f.replaySetup();f.render();f.settle();await f.resolve(f.requests.length-1,'fresh');assert.equal(f.images().length,1);const open=f.find('Open media').props.onClick;f.unmount();open();f.render();assert.equal(f.images().length,0)});
test('retained stop callback cannot stop newer audio instance in the same list',async()=>{const f=fixture();f.actor.mediaType='voice_note';await f.loaded('voice');const firstPlay=f.nodes().find(n=>n.type==='IconButton'&&n.children.some(c=>c?.type==='PlayArrow')).props.onClick;firstPlay();f.audios[0].playGate.resolve();await f.tick();f.render();const oldStop=f.nodes().find(n=>n.type==='IconButton'&&n.children.some(c=>c?.type==='Pause')).props.onClick;firstPlay();f.audios[1].playGate.resolve();await f.tick();f.render();const pauses=f.audios[1].pauses;oldStop();assert.equal(f.audios[1].pauses,pauses)});
test('hidden document and invalid identity reveal no prior media',async()=>{const f=fixture();await f.loaded();f.document.visibilityState='hidden';f.document.dispatchEvent({type:'visibilitychange'});f.render();assert.equal(f.images().length,0);f.document.visibilityState='visible';f.window.dispatchEvent({type:'focus'});f.storage.delete('user');f.render();assert.equal(f.images().length,0)});
test('retained retry and route mismatch before render do not dispatch',async()=>{const f=fixture();f.render();f.settle();f.requests[0].resolve({ok:false,json:async()=>({})});await f.tick();f.render();const retry=f.nodes().find(n=>n.type==='Button'&&n.children.includes('Retry')).props.onClick;f.route('B');retry();assert.equal(f.requests.length,1);f.render();retry();assert.equal(f.requests.length,1)});

const aid='6cb2f513-8d6b-4ff7-8a03-000000000001', bid='6cb2f513-8d6b-4ff7-8a03-000000000002';
const textButton=(f,text)=>f.nodes().find(n=>n.type==='Button'&&n.children.includes(text));
async function fileDialog(f) {
 f.actor.role='manager'; f.store(); f.render(); f.settle();
 f.requests[0].resolve({ok:true,json:async()=>({media:[{...f.row(aid),source_project_id:'A'}]})});
 await f.tick(); f.render(); f.find('Open media').props.onClick(); f.render();
}
async function choose(f,index=1) {
 textButton(f,'Copy to another project').props.onClick();
 const request=f.requests[index]; assert.match(request.url,/photos\/project\/A\/reference-targets$/);
 assert.equal(request.options.headers['X-Project-Actor'],f.actor.id);
 request.resolve({ok:true,json:async()=>({success:true,projects:[{id:bid,name:'East Service Gate'}]})});
 await f.tick(); f.render();
 f.nodes().find(n=>n.type==='select').props.onChange({target:{value:bid}});
 f.render();
}
test('photo filing sends only explicit destination and original project and confirms exact response',async()=>{
 const f=fixture(); await fileDialog(f);
 assert.equal(f.requests.length,1); await choose(f); assert.equal(f.requests.length,2);
 const send=textButton(f,'Copy photo reference').props.onClick; send(); send();
 assert.equal(f.requests.length,3); const r=f.requests[2];
 assert.match(r.url,new RegExp('/'+bid+'/photo/'+aid+'/reference$')); assert.equal(r.options.method,'PUT');
 assert.deepEqual(JSON.parse(r.options.body),{sourceProjectId:'A'});
 r.resolve({ok:true,json:async()=>({success:true,reference:{id:aid,source_project_id:'A',album_project_id:bid,copied_at:'2026-11-28T00:00:00Z'}})});
 await f.tick(); f.render();
 assert.ok(JSON.stringify(f.nodes()).includes('Photo copied. The original is still in this project.'));
 send(); assert.equal(f.requests.length,3);
});
test('stale destination selection and closed preview cannot dispatch copy or display results',async()=>{
 const f=fixture(); await fileDialog(f); await choose(f);
 const send=textButton(f,'Copy photo reference').props.onClick;
 f.nodes().find(n=>n.type==='select').props.onChange({target:{value:''}}); send(); assert.equal(f.requests.length,2);
 f.render(); f.nodes().find(n=>n.type==='select').props.onChange({target:{value:bid}}); f.render();
 textButton(f,'Copy photo reference').props.onClick(); const r=f.requests[2];
 const close=f.nodes().find(n=>n.type==='Dialog').props.onClose; close(); f.render();
 assert.equal(r.options.signal.aborted,true);
 r.resolve({ok:true,json:async()=>({success:true,reference:{id:aid,source_project_id:'A',album_project_id:bid,copied_at:'fixture'}})});
 await f.tick(); f.render(); assert.ok(!JSON.stringify(f.nodes()).includes('Photo copied.'));
});
test('employee cannot see photo filing and manager exports only the selected photo under current workspace scope',async()=>{
 const employee=fixture(); await employee.loaded(); employee.find('Open media').props.onClick(); employee.render();
 assert.equal(textButton(employee,'Copy to another project'),undefined);
 assert.equal(textButton(employee,'Export photo with original details'),undefined);
 const manager=fixture(); await fileDialog(manager);
 const submit=textButton(manager,'Export photo with original details').props.onClick; submit();
 const request=manager.requests[1]; assert.equal(request.options.method,'POST');
 assert.match(request.url,/photos\/project\/A\/export$/);
 assert.deepEqual(JSON.parse(request.options.body),{photoIds:[aid]});
 assert.equal(request.options.headers['X-Project-Company'],'company-A');
 manager.actor.token='new'; manager.announce(); submit(); assert.equal(manager.requests.length,2);
 assert.equal(request.options.signal.aborted,true);
 request.resolve({ok:true,headers:{get:()=> 'application/zip'},blob:async()=>assert.fail('stale response body read')});
 await manager.tick();
});
