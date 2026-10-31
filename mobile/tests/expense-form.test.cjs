const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {stripTypeScriptTypes}=require('node:module');
const code=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../src/utils/expenseForm.ts'),'utf8'),{mode:'transform'}).replace(/export /g,'');const {expenseInputError,localExpenseDate}=new Function(code+';return {expenseInputError,localExpenseDate};')();
const valid={vendor:'Parts store',amount:'21.50',currency:'CAD',spentOn:'2026-10-31',notes:'Replacement supplies'};
test('expense validation rejects invalid money, dates and unsupported currencies',()=>{
 assert.equal(expenseInputError(valid),null);assert.equal(expenseInputError({...valid,currency:'USD'}),null);
 for(const amount of ['0','-1','Infinity','NaN','1e3','3.999','1000000.01',''])assert.ok(expenseInputError({...valid,amount}),amount);
 for(const spentOn of ['2026-02-30','2026-13-01','10/31/2026','2025-02-29','0000-01-01'])assert.ok(expenseInputError({...valid,spentOn}),spentOn);
 assert.equal(expenseInputError({...valid,spentOn:'2024-02-29'}),null);
 assert.ok(expenseInputError({...valid,vendor:' '}));assert.ok(expenseInputError({...valid,currency:'EUR'}));assert.ok(expenseInputError({...valid,notes:'x'.repeat(4001)}));
});
test('expense draft date uses the device calendar rather than UTC',()=>{
 const fake={getFullYear:()=>2026,getMonth:()=>9,getDate:()=>31,toISOString:()=>{throw Error('UTC conversion must not be used');}};
 assert.equal(localExpenseDate(fake),'2026-10-31');
});
