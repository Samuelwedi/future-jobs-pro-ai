const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
const source=path.resolve(__dirname,'../src/utils/shiftRange.ts');
const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const m=new Module(source,module);m.filename=source;m.paths=module.paths;m._compile(compiled,source);
const {shiftRange}=m.exports;
test('normal and overnight shifts retain positive local-day ranges',()=>{
 const day=shiftRange('2026-11-03','09:00:00','17:00:00');
 assert.equal(day.end-day.start,8*3600000);
 const overnight=shiftRange('2026-11-03','23:00:00','07:00:00');
 assert.equal(overnight.end-overnight.start,8*3600000);
 assert.equal(overnight.end.getDate(),4);
 const midnight=shiftRange('2026-12-31','23:00','00:00');
 assert.equal(midnight.end.getFullYear(),2027);
 assert.equal(midnight.end.getMonth(),0);
});
test('database ISO dates use their date part and equal times span one day',()=>{
 const range=shiftRange('2026-11-03T00:00:00.000Z','08:00','08:00');
 assert.equal(range.start.getDate(),3);assert.equal(range.end.getDate(),4);
 assert.equal(range.start.getHours(),8);
});
