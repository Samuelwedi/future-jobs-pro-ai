const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function moduleAt(name,deps){const c={exports:{},require:key=>{if(!(key in deps))throw Error(key);return deps[key];},console};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);return c.exports;}
function fixture(){
 const storage=new Map(),files=new Map([['file:///picker/source',{size:12}]]),server=new Map(),calls=[];
 const session={token:'token',revision:0,ownerId:'owner',companyId:'company'};
 let online=true,revision=0,writeHook=async()=>{},deleteFail=false,requestOverride,checkHook=async()=>{};
 const disk={documentDirectory:'file:///documents/',makeDirectoryAsync:async()=>{},getInfoAsync:async uri=>{calls.push(['stat',uri]);return files.has(uri)?{exists:true,isDirectory:false,size:files.get(uri).size}:{exists:false};},copyAsync:async({from,to})=>{calls.push(['copy',from,to]);if(!files.has(from))throw Error('missing source');files.set(to,{...files.get(from)});},deleteAsync:async uri=>{calls.push(['delete',uri]);if(deleteFail)throw Error('cleanup failed');files.delete(uri);}};
 const local={getItem:async key=>storage.get(key)||null,setItem:async(key,value)=>{await writeHook(key,value);storage.set(key,value);}};
 const api={assertAttachmentSession:s=>{if(s.revision!==revision)throw Error('Account changed');},requestAttachmentReceipt:async(s,key,file)=>{
  calls.push([file?'post':'status',key,file]);
  if(file){const records=JSON.parse([...storage.values()][0]);assert.equal(records[0].phase,'submitted');server.set(key,{status:201,data:{success:true,requestKey:key,attachment:{id:'attachment',company_id:s.companyId,uploaded_by:s.ownerId,time_entry_id:file.timeEntryId,file_name:file.name}}});}
  if(requestOverride)return requestOverride(s,key,file);
  return server.get(key)||{status:404,data:{state:'missing',retryAllowed:false}};
 }};
 const f={storage,files,server,calls,session,file:{uri:'file:///picker/source',name:'École.pdf',mimeType:'application/pdf'},set online(v){online=v},set revision(v){revision=v},set writeHook(v){writeHook=v},set deleteFail(v){deleteFail=v},set request(v){requestOverride=v},set checkHook(v){checkHook=v},reload(){f.store=moduleAt('attachmentReceiptStore',{'@react-native-async-storage/async-storage':{default:local},'expo-file-system/legacy':disk});f.service=moduleAt('attachmentReceiptUpload',{'expo-file-system/legacy':disk,'./api':{api},'./offlineService':{checkOnlineStatus:async()=>{await checkHook();return online;}},'./attachmentReceiptStore':f.store});},pending:()=>f.store.getPendingAttachment('owner','company','entry'),count:type=>calls.filter(x=>x[0]===type).length};f.reload();return f;
}
test('owned copy and submitted receipt are durable before POST; completed acknowledgment cleans only owned copy',async()=>{
 const f=fixture();const result=await f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true);
 assert.equal(result.state,'completed');assert.equal(f.count('post'),1);assert.equal(await f.pending(),undefined);
 assert.ok(f.files.has(f.file.uri));assert.equal(f.files.size,1);const post=f.calls.find(x=>x[0]==='post');assert.equal(post[2].name,'École.pdf');assert.equal(post[2].mimeType,'application/pdf');
 assert.notEqual(post[2].uri,f.file.uri);assert.match(post[2].uri,/attachment-receipts/);
});
test('prepared offline upload survives restart and is sent only by explicit recovery',async()=>{
 const f=fixture();f.online=false;const saved=await f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true);
 assert.equal(saved.state,'prepared');assert.equal(f.count('post'),0);f.reload();f.online=true;
 assert.equal((await f.service.recoverAttachmentUpload(f.session,'entry',()=>true)).state,'completed');assert.equal(f.count('post'),1);
});
test('lost response recovers status after restart even when the local file is missing; never reposts',async()=>{
 const f=fixture();f.request=async()=>{throw Error('timeout after server success');};
 assert.equal((await f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true)).state,'pending');
 const pending=await f.pending();assert.equal(pending.phase,'submitted');f.files.delete(pending.fileUri);f.reload();f.request=undefined;
 const oldStats=f.count('stat');assert.equal((await f.service.recoverAttachmentUpload(f.session,'entry',()=>true)).state,'completed');
 assert.equal(f.count('post'),1);assert.equal(f.count('status'),1);assert.equal(f.count('stat'),oldStats);
});
test('missing, unavailable, failed and mismatched status results retain the receipt without reposting',async()=>{
 for(const result of [{status:404,data:{state:'missing'}},{status:410,data:{state:'unavailable'}},{status:202,data:{state:'processing'}},{status:200,data:{success:true,requestKey:'wrong'}}]){
  const f=fixture();f.request=async()=>result;await f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true);f.reload();f.request=async()=>result;
  assert.equal((await f.service.recoverAttachmentUpload(f.session,'entry',()=>true)).state,'pending');assert.equal(f.count('post'),1);assert.ok(await f.pending());
 }
});
test('a failed submitted-state write prevents POST; preparation failure removes only the new copy',async()=>{
 const f=fixture();f.writeHook=async(_key,value)=>{if(value.includes('submitted'))throw Error('disk full');};
 await assert.rejects(f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true),/disk full/);assert.equal(f.count('post'),0);assert.equal((await f.pending()).phase,'prepared');
 const g=fixture();g.writeHook=async()=>{throw Error('storage down');};await assert.rejects(g.service.startAttachmentUpload(g.session,'entry',g.file,()=>true),/storage down/);
 assert.equal(g.count('post'),0);assert.equal(g.files.size,1);assert.ok(g.files.has(g.file.uri));
});
test('cleanup failure retains a submitted receipt and retries only cleanup after status confirmation',async()=>{
 const f=fixture();f.deleteFail=true;await assert.rejects(f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true),/cleanup failed/);
 assert.equal((await f.pending()).phase,'submitted');f.deleteFail=false;f.reload();
 assert.equal((await f.service.recoverAttachmentUpload(f.session,'entry',()=>true)).state,'completed');assert.equal(f.count('post'),1);assert.equal(f.count('status'),1);
});
test('account or screen changes during network check prevent dispatch and retain the prepared copy',async()=>{
 for(const kind of ['account','screen']){const f=fixture();let current=true;f.checkHook=async()=>{if(kind==='account')f.revision=1;else current=false;};
  await assert.rejects(f.service.startAttachmentUpload(f.session,'entry',f.file,()=>current),/changed/);assert.equal(f.count('post'),0);assert.equal((await f.pending()).phase,'prepared');
 }
});
test('duplicate calls share one flight; an unresolved receipt blocks choosing a different file',async()=>{
 const f=fixture();f.request=async()=>({status:202,data:{state:'processing'}});
 const first=f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true),second=f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true);
 assert.strictEqual(first,second);await first;assert.equal(f.count('post'),1);
 await assert.rejects(f.service.startAttachmentUpload(f.session,'entry',{...f.file,name:'different.pdf'},()=>true),/Check the saved/);assert.equal(f.count('post'),1);
});
test('corrupt records or other-owner paths cannot be overwritten or cleaned up',async()=>{
 const f=fixture();f.online=false;await f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true);
 const [key,raw]=[...f.storage.entries()][0],records=JSON.parse(raw);records[0].fileUri=f.file.uri;f.storage.set(key,JSON.stringify(records));
 await assert.rejects(f.service.recoverAttachmentUpload(f.session,'entry',()=>true),/could not be read/);assert.equal(f.count('delete'),0);assert.ok(f.files.has(f.file.uri));
 assert.equal(await f.store.getPendingAttachment('other-owner','company','entry'),undefined);
});
test('unsupported extensions and oversized files fail before persistence or submission',async()=>{
 for(const large of [true,false]){const f=fixture();if(large)f.files.set(f.file.uri,{size:101*1024*1024});else f.file.name='program.exe';
  await assert.rejects(f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true),/supported file/);assert.equal(f.count('post'),0);assert.equal(await f.pending(),undefined);assert.equal(f.files.size,1);
 }
});
test('mismatched actor/company/entry/filename completion cannot remove a pending receipt',async()=>{
 for(const field of ['company_id','uploaded_by','time_entry_id','file_name']){
  const f=fixture();f.request=async(_s,key)=>{const result=f.server.get(key);return {...result,data:{...result.data,attachment:{...result.data.attachment,[field]:'different'}}};};
  assert.equal((await f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true)).state,'pending');assert.ok(await f.pending());assert.equal(f.count('delete'),0);
 }
});
test('invalid original filenames are rejected before copying or persisting a receipt',async()=>{
 for(const name of ['../escape.pdf','bad\nname.pdf','bad\\name.pdf','x'.repeat(256)+'.pdf']){
  const f=fixture();f.file.name=name;await assert.rejects(f.service.startAttachmentUpload(f.session,'entry',f.file,()=>true),/supported file/);
  assert.equal(f.count('copy'),0);assert.equal(f.count('post'),0);assert.equal(await f.pending(),undefined);
 }
});
