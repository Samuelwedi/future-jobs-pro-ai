const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function load(file,requireFn){const context={exports:{},require:requireFn};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services',file+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);return context.exports;}
const copy=load('screenTranslations');const {t,deviceLanguage}=load('i18n',()=>copy);
test('home and profile copy changes fully for the strings visible in tester screenshots',()=>{
 for(const key of ['Everything ready.\nStart with confidence.','Temperature Unit','Choose today’s project or scheduled shift. Future Jobs will connect time, GPS, media, and job context automatically.','Your next best move','Subscription Plans','Edit Name'])for(const lang of ['es','fr'])assert.notEqual(t(key,lang),key,`${lang}: ${key}`);
 assert.equal(deviceLanguage('es-MX'),'es');assert.equal(deviceLanguage('fr-CA'),'fr');assert.equal(deviceLanguage('de-DE'),'en');
});
