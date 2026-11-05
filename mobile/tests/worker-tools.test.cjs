const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function load(name){const c={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/'+name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);return c.exports;}
const {createWorkerTools,parseToolInputs,parseFeet,inchFraction}=load('workerTools');
const {screenCopy}=load('screenTranslations');
const t=(k,vars={})=>k.replace(/\{(\w+)\}/g,(_,key)=>vars[key]??'');
const tools=createWorkerTools(t);
test('field calculators reject blank, nonfinite, negative, zero divisor and fractional count inputs',()=>{
 const concrete=tools.find(x=>x.id==='concrete'),stairs=tools.find(x=>x.id==='stairs'),spacing=tools.find(x=>x.id==='spacing');
 for(const bad of ['', ' ', 'NaN', 'Infinity', '-1', '2abc'])assert.throws(()=>parseToolInputs(concrete,[bad,'10','4','0']));
 assert.throws(()=>parseToolInputs(stairs,['100','0','10']));assert.throws(()=>parseToolInputs(spacing,['100','2','2.5']));
 assert.equal(parseToolInputs(concrete,['10,5','10','4','0'])[0],10.5);
 assert.equal(parseToolInputs(tools.find(x=>x.id==='slope'),['-2','10'])[0],-2);
 const values=parseToolInputs(concrete,['9','9','12','0']);assert.deepEqual(Array.from(concrete.solve(i=>values[i])),['3 yd³','135 × 80 lb bags']);
});
test('feet and fractional inches reject trailing junk and zero denominators and preserve negative sign',()=>{
 assert.equal(parseFeet("5' 7 1/4"),67.25);assert.equal(parseFeet("-5' 7 1/4"),-67.25);
 for(const bad of ["5' 7 1/0",'5 garbage',"5' 12",'Infinity',"5' 7 5/4"])assert.throws(()=>parseFeet(bad));
 assert.equal(inchFraction(1.999,16),'2');assert.equal(inchFraction(-1.25,16),'-1 1/4');
});
test('every tool name, category, field and translated output has Spanish and French copy',()=>{
 for(const tool of tools)for(const key of [tool.name,tool.category,...tool.fields])assert.ok(screenCopy[key],tool.id+': '+key);
 for(const locale of ['es','fr']){
  const translate=(key,vars={})=>{assert.ok(screenCopy[key],key);return screenCopy[key][locale==='es'?0:1].replace(/\{(\w+)\}/g,(_,k)=>vars[k]);};
  for(const tool of createWorkerTools(translate,locale))assert.ok(tool.solve(()=>10).length);
 }
});
function screenExpression(find){
 const file=path.join(__dirname,'../src/screens/WorkerToolsScreen.tsx'),source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
 function visit(n){if(find(n,ast))node=n;ts.forEachChild(n,visit);}visit(ast);assert.ok(node);return ts.transpileModule('result = '+node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
}
const effectCode=screenExpression((n,a)=>ts.isArrowFunction(n)&&ts.isCallExpression(n.parent)&&n.parent.expression.getText(a)==='useEffect');
test('saved calculator history rejects corrupt storage and never enables an overwrite',async()=>{
 const context={tapeKey:'workerTools:tape:one',tapeReady:{current:false},tapeRef:{current:[]},setTape(){},t,Alert:{alert(){}},AsyncStorage:{getItem:async()=>'{invalid'}};
 const effect=vm.runInNewContext(effectCode,context);effect();await new Promise(r=>setImmediate(r));assert.equal(context.tapeReady.current,false);
});
test('history from a previous account cannot populate the current screen after cleanup',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);let entries=[];
 const context={tapeKey:'workerTools:tape:one',tapeReady:{current:false},tapeRef:{current:[]},setTape:value=>entries=value,t,Alert:{alert(){}},AsyncStorage:{getItem:()=>pending}};
 const cleanup=vm.runInNewContext(effectCode,context)();cleanup();resolve('["private old result"]');await new Promise(r=>setImmediate(r));assert.equal(entries.length,0);assert.equal(context.tapeReady.current,false);
});
