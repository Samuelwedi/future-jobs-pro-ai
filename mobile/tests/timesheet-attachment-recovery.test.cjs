const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/TimesheetScreen.tsx'),'utf8');
const ast=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name,c){let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);return vm.runInNewContext(ts.transpileModule('result='+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);}
function fixture(){const calls=[];return {calls,writeScope:'scope:entry',currentWriteScope:{current:'scope:entry'},Linking:{openURL:async url=>calls.push(['open',url])},Alert:{alert:(...args)=>calls.push(['alert',...args])},t:s=>s,URL};}
test('attachment opening accepts HTTPS links only on explicit current-scope action',async()=>{
 const c=fixture(),open=handler('openAttachment',c);assert.equal(c.calls.length,0);await open('https://example.test/file.pdf');assert.equal(c.calls[0][0],'open');
 for(const url of ['http://example.test/file','javascript:alert(1)','file:///private','https://user:pass@example.test/file','bad url']){c.calls.length=0;await open(url);assert.equal(c.calls[0][0],'alert');}
 c.calls.length=0;c.currentWriteScope.current='another-account';await open('https://example.test/file');assert.equal(c.calls.length,0);
});
test('late link-opening failures do not alert a different account or selected entry',async()=>{
 const c=fixture();c.Linking.openURL=async()=>{c.currentWriteScope.current=null;throw Error('late failure');};await handler('openAttachment',c)('https://example.test/file');assert.equal(c.calls.length,0);
});
test('timesheet responses and errors are fenced when company/role/export scope changes',async()=>{
 for(const fail of [false,true]){const calls=[];const c={useCallback:fn=>fn,requestSequence:{current:0},exportScope:'old-scope',currentExportScope:{current:'old-scope'},selectedUserId:'worker',user:{id:'worker'},weekStart:'2026-11-11',weekEnd:'2026-11-11',api:{get:async()=>{c.currentExportScope.current='new-company-or-role';if(fail)throw Error('stale');return {entries:[{id:'private',attachments:[{}]}]};}},setEntries:x=>calls.push(['entries',x]),setTimezone:x=>calls.push(['timezone',x]),setErrorMsg:x=>calls.push(['error',x]),setLoading:x=>calls.push(['loading',x]),setRefreshing:x=>calls.push(['refreshing',x]),t:s=>s,console};await handler('fetchEntries',c)();assert.equal(calls.length,0);}
});
test('recovered attachment metadata is rendered by filename with an explicit open action',()=>{
 assert.match(source,/selectedEntry\.attachments \|\| \[\]/);assert.match(source,/openAttachment\(attachment\.file_url\)/);assert.match(source,/attachment\.file_name \|\| t\('Attachment'\)/);
});
test('refresh replaces open detail metadata so recovered attachments appear without reopening',async()=>{
 let selected={id:'entry',attachments:[]};const restored={id:'entry',attachments:[{id:'file',file_name:'Saved.pdf'}]};
 const c={useCallback:fn=>fn,requestSequence:{current:0},exportScope:'scope',currentExportScope:{current:'scope'},selectedUserId:'worker',user:{id:'worker'},weekStart:'2026-11-11',weekEnd:'2026-11-11',api:{get:async()=>({entries:[restored]})},setEntries:()=>{},setSelectedEntry:update=>{selected=update(selected)},setTimezone:()=>{},setErrorMsg:()=>{},setLoading:()=>{},setRefreshing:()=>{},t:s=>s,console};
 const fetchEntries=handler('fetchEntries',c);await fetchEntries();assert.strictEqual(selected,restored);
 selected=null;await fetchEntries();assert.equal(selected,null);
 selected={id:'no-longer-returned'};await fetchEntries();assert.equal(selected,null);
});
