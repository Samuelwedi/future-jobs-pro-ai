const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/TimesheetScreen.tsx'),'utf8');
const ast=ts.createSourceFile('TimesheetScreen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(context){let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='handleExport')expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);return vm.runInNewContext(ts.transpileModule('result = '+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}
function fixture(){const calls={shared:[],deleted:[],errors:[]};return {calls,exportLock:{current:false},setExporting(){},exportScope:'scope',currentExportScope:{current:'scope'},selectedUserId:'employee',user:{id:'employee'},weekStart:'2026-11-02',weekEnd:'2026-11-08',API_URL:'https://example.test/api',t:s=>s,api:{getToken:async()=> 'token'},FileSystem:{cacheDirectory:'file:///cache/',downloadAsync:async()=>({status:200,headers:{'Content-Type':'application/pdf'}}),deleteAsync:async path=>calls.deleted.push(path)},Sharing:{isAvailableAsync:async()=>true,shareAsync:async(path,options)=>calls.shared.push({path,options})},Alert:{alert:(...args)=>calls.errors.push(args)},Math,Date};}
test('PDF is downloaded as binary, shared explicitly and cleaned up',async()=>{const c=fixture();await handler(c)('pdf');assert.equal(c.calls.shared.length,1);assert.equal(c.calls.shared[0].options.mimeType,'application/pdf');assert.equal(c.calls.deleted.length,1);assert.equal(c.exportLock.current,false);});
test('unexpected type and HTTP failure never reach sharing and are cleaned up',async()=>{for(const result of [{status:403,headers:{}},{status:200,headers:{'content-type':'text/html'}}]){const c=fixture();c.FileSystem.downloadAsync=async()=>result;await handler(c)('pdf');assert.equal(c.calls.shared.length,0);assert.equal(c.calls.deleted.length,1);assert.equal(c.calls.errors.length,1);}});
test('account/scope changes during download suppress the old share sheet',async()=>{const c=fixture();c.FileSystem.downloadAsync=async()=>{c.currentExportScope.current='another-account';return {status:200,headers:{'content-type':'application/pdf'}};};await handler(c)('pdf');assert.equal(c.calls.shared.length,0);assert.equal(c.calls.deleted.length,1);});
test('synchronous export lock prevents duplicate sheets',async()=>{const c=fixture();let release;const pending=new Promise(r=>release=r);c.FileSystem.downloadAsync=async()=>{await pending;return {status:200,headers:{'content-type':'application/pdf'}};};const run=handler(c);const first=run('pdf');await run('pdf');release();await first;assert.equal(c.calls.shared.length,1);});
test('scope is checked again after the final asynchronous token read',async()=>{const c=fixture();let reads=0;c.api.getToken=async()=>{if(++reads===2)c.currentExportScope.current=null;return 'token';};await handler(c)('pdf');assert.equal(c.calls.shared.length,0);assert.equal(c.calls.deleted.length,1);});
test('CSV requests the selected range and exposes a named CSV file through the native share API',async()=>{
 const c=fixture(),downloads=[];
 c.FileSystem.downloadAsync=async(...args)=>{downloads.push(args);return {status:200,headers:{'content-type':'text/csv; charset=utf-8'}};};
 await handler(c)('csv');
 assert.equal(downloads.length,1);assert.match(downloads[0][0],/userId=employee&start=2026-11-02&end=2026-11-08&format=csv$/);
 assert.match(downloads[0][1],/^file:\/\/\/cache\/timesheet_.*\.csv$/);assert.equal(downloads[0][2].headers.Authorization,'Bearer token');
 assert.equal(c.calls.shared.length,1);assert.equal(c.calls.shared[0].path,downloads[0][1]);
 assert.equal(c.calls.shared[0].options.mimeType,'text/csv');assert.equal(c.calls.shared[0].options.UTI,'public.comma-separated-values-text');
 assert.deepEqual(c.calls.deleted,[downloads[0][1]]);
});
