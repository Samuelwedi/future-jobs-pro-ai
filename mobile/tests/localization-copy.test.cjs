const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function load(file,requireFn){const context={exports:{},require:requireFn};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services',file+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);return context.exports;}
const copy=load('screenTranslations');const {t,deviceLanguage}=load('i18n',()=>copy);
test('home and profile copy changes fully for the strings visible in tester screenshots',()=>{
 for(const key of ['Everything ready.\nStart with confidence.','Temperature Unit','Choose today’s project or scheduled shift. Future Jobs will connect time, GPS, media, and job context automatically.','Your next best move','Subscription Plans','Edit Name'])for(const lang of ['es','fr'])assert.notEqual(t(key,lang),key,`${lang}: ${key}`);
 assert.equal(deviceLanguage('es-MX'),'es');assert.equal(deviceLanguage('fr-CA'),'fr');assert.equal(deviceLanguage('de-DE'),'en');
});
test('support, timesheet and scheduling static copy has both translations and safe interpolation',()=>{
 const screens=['Support','Timesheet','Schedule','CreateShift'];
 for(const screen of screens){
  const source=fs.readFileSync(path.join(__dirname,`../src/screens/${screen}Screen.tsx`),'utf8');
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
