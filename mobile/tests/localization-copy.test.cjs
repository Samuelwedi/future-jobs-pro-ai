const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function load(file,requireFn){const context={exports:{},require:requireFn};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services',file+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);return context.exports;}
const copy=load('screenTranslations');const {t,deviceLanguage}=load('i18n',()=>copy);
test('home and profile copy changes fully for the strings visible in tester screenshots',()=>{
 for(const key of ['Everything ready.\nStart with confidence.','Temperature Unit','Choose today’s project or scheduled shift. Future Jobs will connect time, GPS, media, and job context automatically.','Your next best move','Subscription Plans','Edit Name'])for(const lang of ['es','fr'])assert.notEqual(t(key,lang),key,`${lang}: ${key}`);
 assert.equal(deviceLanguage('es-MX'),'es');assert.equal(deviceLanguage('fr-CA'),'fr');assert.equal(deviceLanguage('de-DE'),'en');
});
test('support, timesheet and scheduling static copy has both translations and safe interpolation',()=>{
 const screens=['Support','Timesheet','Schedule','CreateShift','Login','Register','ForgotPassword','ChangeTemporaryPassword','ChatList','Chat','NewChat','SelectEmployees','Tasks','Projects','Contact','Folders','History','ProjectAlbum','ProjectMedia','MonthMedia','MonthMediaType','GPSPlayback','CrewTracking','PTO','Team','Kiosk','CompanySettings','CrewClock','VoiceNote','Subscription','CameraView','AIAssistant','About','PayrollRules','WorldwidePayrollRules','Terms','Privacy','Security','Demo','WorkerTools','WebView'];
 for(const screen of screens){
  const source=fs.readFileSync(path.join(__dirname,`../src/screens/${['CameraView','WorldwidePayrollRules'].includes(screen)?screen:screen+'Screen'}.tsx`),'utf8');
  const ast=ts.createSourceFile(screen+'.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){
   if(ts.isCallExpression(node)&&node.expression.getText(ast)==='t'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){
    const key=node.arguments[0].text;
    assert.ok(copy.screenCopy[key],`${screen}: ${key} is missing from the shared copy`);
    for(const lang of ['es','fr'])assert.ok(t(key,lang).length);
   }
   ts.forEachChild(node,visit);
  }visit(ast);
 }
 assert.equal(t('Selected employees: {count}','es',{count:'3'}),'Empleados seleccionados: 3');
 assert.equal(t('Attached: {name}','fr',{name:'client-file.pdf'}),'Pièce jointe : client-file.pdf');
 assert.equal(t('Customer-authored content','es'),'Customer-authored content');
});
test('translation interpolation variables are preserved in both languages',()=>{
 const tokens=text=>Array.from(text.matchAll(/\{(\w+)\}/g),match=>match[1]).sort().join(',');
 for(const [key,translations] of Object.entries(copy.screenCopy))for(const translated of translations)assert.equal(tokens(translated),tokens(key),key);
});
test('legal, security and demo static data use translated display values',()=>{
 for(const screen of ['Privacy','Security','Demo']){
  const file=path.join(__dirname,`../src/screens/${screen}Screen.tsx`),source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){if(ts.isPropertyAssignment(node)&&['title','text','desc','eyebrow','headline','copy','metricLabel','meta','outcome','label'].includes(node.name.getText(ast))&&ts.isStringLiteral(node.initializer)){assert.ok(copy.screenCopy[node.initializer.text],screen+': '+node.initializer.text);}ts.forEachChild(node,visit);}visit(ast);
 }
});
test('shared media viewer and timezone picker copy exists in both languages',()=>{
 for(const file of ['MediaAttachment','TimezonePicker','OfflineSyncPanel']){
  const source=fs.readFileSync(path.join(__dirname,`../src/components/${file}.tsx`),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='t'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))assert.ok(copy.screenCopy[node.arguments[0].text],file+': '+node.arguments[0].text);ts.forEachChild(node,visit);}visit(ast);
 }
});
test('screen text and accessibility labels contain no unreviewed English JSX literals',()=>{
 const allowed=new Set(['Lucy','🚀 Future Jobs Pro AI','Future Jobs Pro AI','FUTURE JOBS PRO AI','Future Jobs Pro AI – Samuel B.','your@email.com','📧 support@futurejobsproai.com','km','km/h']);
 for(const filename of fs.readdirSync(path.join(__dirname,'../src/screens')).filter(name=>name.endsWith('.tsx'))){
  const source=fs.readFileSync(path.join(__dirname,'../src/screens',filename),'utf8'),ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){let text;if(ts.isJsxText(node))text=node.text.trim().replace(/\s+/g,' ');if(ts.isJsxAttribute(node)&&['placeholder','accessibilityLabel','title'].includes(node.name.getText(ast))&&node.initializer&&ts.isStringLiteral(node.initializer))text=node.initializer.text;
   if(text&&/[a-zA-Z]{2}/.test(text))assert.ok(allowed.has(text),filename+': '+text);ts.forEachChild(node,visit);
  }visit(ast);
 }
});
