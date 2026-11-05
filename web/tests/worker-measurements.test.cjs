const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const scope={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/workerTools.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
const {parseMeasure,parseToolNumber,fraction,formatFeet,convert}=scope.exports;
test('measurement parsing accepts decimals and signed fractions while rejecting malformed measurements',()=>{
 assert.equal(parseMeasure('12.5 m'),12.5);assert.equal(parseMeasure('-1/2 ft'),-.1524);assert.ok(Math.abs(parseMeasure('-0\' 6"')+.1524)<1e-10);
 assert.ok(Math.abs(parseMeasure('5\' 7 1/4"')-1.70815)<1e-10);
 for(const input of ['', 'ft', '1/0', '5\' 7 1/0"', '5\' 12"', '5 garbage'])assert.throws(()=>parseMeasure(input));
});
test('fraction and feet output carry rounded inches into the next whole foot',()=>{
 assert.equal(fraction(1.999,16),'2');assert.equal(fraction(-1.25,16),'-1 1/4');
 assert.equal(formatFeet(11.999*.0254),'1\' 0"');assert.equal(formatFeet(-11.999*.0254),'-1\' 0"');
 assert.throws(()=>fraction(Infinity));assert.throws(()=>formatFeet(1,0));
});
test('empty and nonfinite converter inputs cannot appear as zero',()=>{
 for(const input of ['', ' ', 'NaN', 'Infinity', '2abc'])assert.throws(()=>parseToolNumber(input));
 assert.equal(parseToolNumber('0'),0);assert.equal(convert(parseToolNumber('-40'),'temperature','C','F'),-40);
});
