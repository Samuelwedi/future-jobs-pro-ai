const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
function load(file,requireFn){const context={exports:{},require:requireFn};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services',file+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);return context.exports;}
const copy=load('screenTranslations');const {t,deviceLanguage}=load('i18n',()=>copy);
test('home and profile copy changes fully for the strings visible in tester screenshots',()=>{
 for(const key of ['Everything ready.\nStart with confidence.','Temperature Unit','Choose today’s project or scheduled shift. Future Jobs will connect time, GPS, media, and job context automatically.','Your next best move','Subscription Plans','Edit Name'])for(const lang of ['es','fr'])assert.notEqual(t(key,lang),key,`${lang}: ${key}`);
 assert.equal(deviceLanguage('es-MX'),'es');assert.equal(deviceLanguage('fr-CA'),'fr');assert.equal(deviceLanguage('de-DE'),'en');
});
test('native administration, operations, support and voice controls have both translations',()=>{
 const keys=['Save employee changes?','Tax identity not configured','Weekly scheduled-hour limit','Document title','First report (YYYY-MM-DD HH:mm)','Preview eligible cover','Save payroll settings','Report downloaded','Request a support agent','PRIVATE SUPPORT TICKET','CONVERSATION LIVE','Listening… speak now','Type a command...','Provider details'];for(const key of keys)for(const lang of ['es','fr'])assert.notEqual(t(key,lang),key,`${lang}: ${key}`);
 for(const [key,values] of Object.entries(copy.screenCopy)){const placeholders=value=>[...value.matchAll(/\{([A-Za-z]\w*)\}/g)].map(match=>match[1]).sort();for(const value of values){assert.ok(value.trim(),key);assert.deepEqual(placeholders(value),placeholders(key),key);}}
 assert.equal(t('Assign {name}','fr',{name:'Émilie'}),'Affecter Émilie');assert.equal(t('Revoke {email}','es',{email:'qa@example.test'}),'Revocar qa@example.test');
});
test('authored screen literal audit has no uncovered text or missing translation keys',()=>{
 const {execFileSync}=require('node:child_process');const result=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'../../scripts/audit-mobile-localization.cjs')],{encoding:'utf8'}));assert.ok(result.screensScanned>=55);assert.equal(result.unwrappedLiteralText,0);assert.equal(result.missingLiteralKeys,0);
});
