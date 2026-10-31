const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');const c={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/config/subscriptionProducts.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);const {ANDROID_STORE_PRODUCT_IDS,STORE_PRODUCT_IDS,planKeyForProduct}=c.exports;
test('sale catalog respects Google Play forty-character product ID limit and preserves Apple IDs',()=>{
 assert.equal(Object.keys(ANDROID_STORE_PRODUCT_IDS).length,7);
 for(const [plan,id] of Object.entries(ANDROID_STORE_PRODUCT_IDS)){assert.ok(id.length<=40);assert.match(id,/^[a-z0-9][a-z0-9_.]*$/);assert.equal(planKeyForProduct(id),plan);assert.equal(planKeyForProduct(STORE_PRODUCT_IDS[plan]),plan);assert.match(STORE_PRODUCT_IDS[plan],/^com\.samuel33\.futurejobspro\./);}
});
