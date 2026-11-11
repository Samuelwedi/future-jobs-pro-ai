const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/ProjectFilesScreen.tsx'),'utf8');
const ast=ts.createSourceFile('ProjectFilesScreen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const util={exports:{},URL};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/projectFiles.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,util);
const {projectFileUrl,readProjectFiles}=util.exports;
function handler(name,context){let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);assert.ok(expression,name);return vm.runInNewContext(ts.transpileModule('result = '+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}
const entry=(id='file',extra={})=>({id,company_id:'company',project_id:'project',file_name:'École.pdf',file_url:'https://example.test/file.pdf',...extra});
function fixture(){const c={validRoute:true,focused:true,scope:'scope',currentScope:{current:'scope'},focusActive:{current:true},sequence:{current:0},openLock:{current:null},projectId:'project',user:{id:'owner',companyId:'company',role:'employee'},useCallback:fn=>fn,readProjectFiles,projectFileUrl,t:s=>s,state:null,events:[],requests:[],api:{},Linking:{},Alert:{},Symbol,authCurrent:true};
 c.api.getProjectFiles=(...args)=>new Promise((resolve,reject)=>c.requests.push({args,resolve,reject})).then(data=>({data,isSessionCurrent:()=>c.authCurrent}));
 c.setState=value=>{c.state=value;c.events.push(['state',value]);};c.setOpening=value=>c.events.push(['opening',value]);
 c.Linking.openURL=async url=>c.events.push(['open',url]);c.Alert.alert=(...args)=>c.events.push(['alert',...args]);return c;
}
test('project file normalization returns minimal metadata, preserves filenames, and rejects mismatched company/project or duplicate IDs',()=>{
 const input={success:true,attachments:[entry('file',{private_extra:'not displayed'})]},files=readProjectFiles(input,'project','company');
 assert.deepEqual(Object.keys(files[0]),['id','name','url']);assert.equal(files[0].name,'École.pdf');assert.equal(input.attachments[0].private_extra,'not displayed');
 for(const response of [null,{}, {success:false,attachments:[]},{success:true,attachments:{}},{success:true,attachments:[entry('file',{company_id:'other'})]},{success:true,attachments:[entry('file',{project_id:'other'})]},{success:true,attachments:[entry(),entry()]},{success:true,attachments:[entry('file',{file_name:''})]}])assert.throws(()=>readProjectFiles(response,'project','company'));
});
test('file URLs reject unsafe schemes, embedded credentials, whitespace and local paths without hiding the filename',()=>{
 assert.equal(projectFileUrl('https://example.test/file%20name.pdf'),'https://example.test/file%20name.pdf');
 for(const url of [null,'http://example.test/a','javascript:alert(1)','data:text/plain,a','file:///tmp/a','uploads/a.pdf','https://user:pass@example.test/a','https://user@example.test/a',' https://example.test/a','https:\\example.test/a','https://example.test/\na'])assert.equal(projectFileUrl(url),null,String(url));
 const file=readProjectFiles({success:true,attachments:[entry('legacy',{file_url:'uploads/file.pdf'})]},'project','company')[0];assert.equal(file.url,null);assert.equal(file.name,'École.pdf');
});
test('loading, error, retry and empty results are distinct and old links clear immediately on refresh',async()=>{
 const c=fixture(),fetchFiles=handler('fetchFiles',c);
 const first=fetchFiles();assert.equal(c.state.status,'loading');assert.equal(c.requests[0].args[0],'project');assert.equal(c.requests[0].args[1].companyId,'company');c.requests[0].resolve({success:true,attachments:[entry()]});await first;assert.equal(c.state.files.length,1);
 const refresh=fetchFiles();assert.equal(c.state.status,'loading');assert.equal(c.state.files.length,0);c.requests[1].reject(Error('denied'));await refresh;assert.equal(c.state.status,'error');assert.equal(c.state.files.length,0);
 const retry=fetchFiles();c.requests[2].resolve({success:true,attachments:[]});await retry;assert.equal(c.state.status,'ready');assert.equal(c.state.files.length,0);
});
test('a newer refresh wins; stale successes, failures and scope changes cannot update visible files',async()=>{
 for(const transition of ['newer','account','company','role','project','blur','unmount'])for(const fail of [false,true]){
  const c=fixture(),fetchFiles=handler('fetchFiles',c),old=fetchFiles();
  if(transition==='newer'){const latest=fetchFiles();c.requests[1].resolve({success:true,attachments:[entry('latest')]});await latest;}
  else if(['blur','unmount'].includes(transition)){c.focusActive.current=false;c.sequence.current++;}
  else c.currentScope.current=transition;
  const before=c.events.length;assert.equal(c.requests[0].args[2](),false);
  fail?c.requests[0].reject(Error('late')):c.requests[0].resolve({success:true,attachments:[entry('old')]});await old;assert.equal(c.events.length,before);
  if(transition==='newer')assert.equal(c.state.files[0].id,'latest');
 }
});
test('invalid/focused-away scope makes no request; invalid response becomes an error, not an empty list',async()=>{
 const c=fixture(),fetchFiles=handler('fetchFiles',c);c.currentScope.current=null;await fetchFiles();assert.equal(c.requests.length,0);
 c.currentScope.current='scope';const fetch=fetchFiles();c.requests[0].resolve({success:true,attachments:[entry('file',{project_id:'another'})]});await fetch;assert.equal(c.state.status,'error');
});
test('explicit link opening is locked against repeated taps and rejects stale or foreign rows',async()=>{
 const c=fixture(),file={id:'file',name:'File',url:'https://example.test/file.pdf'};c.state={scope:'scope',request:0,status:'ready',files:[file],isSessionCurrent:()=>c.authCurrent};let finish;
 c.Linking.openURL=url=>{c.events.push(['open',url]);return new Promise(resolve=>finish=resolve);};const open=handler('openFile',c);
 const first=open(file);await open(file);assert.equal(c.events.filter(e=>e[0]==='open').length,1);finish();await first;
 const before=c.events.length;await open({...file});c.sequence.current++;await open(file);assert.equal(c.events.length,before);
 c.sequence.current=0;c.currentScope.current='another';await open(file);assert.equal(c.events.length,before);
});
test('open failures report only in the originating view and cannot unlock a newer operation',async()=>{
 for(const stale of [false,true]){
  const c=fixture(),file={id:'file',name:'File',url:'https://example.test/file.pdf'};c.state={scope:'scope',request:0,status:'ready',files:[file],isSessionCurrent:()=>c.authCurrent};
  c.Linking.openURL=async()=>{if(stale){c.sequence.current++;c.openLock.current='new operation';}throw Error('failed');};await handler('openFile',c)(file);
  assert.equal(c.events.filter(e=>e[0]==='alert').length,stale?0:1);assert.equal(c.openLock.current,stale?'new operation':null);
 }
});
test('successfully loaded links cannot open after the captured session changes before auth-context rerender',async()=>{
 const c=fixture(),loading=handler('fetchFiles',c)();c.requests[0].resolve({success:true,attachments:[entry()]});await loading;
 const open=handler('openFile',c),file=c.state.files[0];c.authCurrent=false;const before=c.events.length;await open(file);assert.equal(c.events.length,before);assert.equal(c.currentScope.current,'scope');assert.equal(c.focusActive.current,true);
});
test('authentication changes at the caller continuation cannot store or render ready file rows',async()=>{
 const c=fixture(),loading=handler('fetchFiles',c)();c.requests[0].resolve({success:true,attachments:[entry()]});c.authCurrent=false;const before=c.events.length;await loading;assert.equal(c.events.length,before);assert.equal(c.state.status,'loading');
 c.validRoute=true;c.focused=true;c.state={scope:'scope',request:c.sequence.current,status:'ready',files:[],isSessionCurrent:()=>c.authCurrent};
 assert.equal(handler('visibleState',c),null);c.authCurrent=true;assert.strictEqual(handler('visibleState',c),c.state);
});
test('a pending native-link failure is suppressed if the loaded authentication session changes',async()=>{
 const c=fixture(),file={id:'file',name:'File',url:'https://example.test/file.pdf'};c.state={scope:'scope',request:0,status:'ready',files:[file],isSessionCurrent:()=>c.authCurrent};
 c.Linking.openURL=async()=>{c.authCurrent=false;throw Error('late failure');};await handler('openFile',c)(file);
 assert.equal(c.events.filter(e=>e[0]==='alert').length,0);assert.equal(c.events.filter(e=>e[0]==='opening'&&e[1]===false).length,0);
});
test('navigation keeps Photos entry, adds read-only Files for all existing roles, and registers the screen',()=>{
 const projects=fs.readFileSync(path.join(__dirname,'../src/screens/ProjectsScreen.tsx'),'utf8'),app=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');
 assert.match(projects,/navigate\('ProjectAlbum'/);assert.match(projects,/navigate\('ProjectFiles', \{ projectId: project.id, projectName: project.name, ownerId: user.id, companyId: user.companyId \}\)/);
 assert.match(projects,/onPress=\{\(\) => openProjectFiles\(item\)\}/);
 assert.match(app,/name="ProjectFiles" component=\{ProjectFilesScreen\}/);
 assert.match(source,/params\?\.ownerId === user.id && params\?\.companyId === user.companyId/);assert.match(source,/state\?\.scope === scope && state.request === sequence.current/);
 assert.match(source,/\[scope, projectId, user\?\.id, user\?\.companyId, user\?\.role, validRoute\]/);
 assert.match(source,/Read-only files/);assert.match(source,/File link unavailable/);assert.doesNotMatch(source,/api\.(post|put|patch|delete)|DocumentPicker|uploadFile|deleteAttachment/);
});
