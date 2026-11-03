const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const code=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../src/utils/localWorkDate.ts'),'utf8'),{mode:'transform'}).replace(/export /g,'');
function run(timezone,source){return execFileSync(process.execPath,['-e',code+';'+source],{encoding:'utf8',env:{...process.env,TZ:timezone}}).trim();}
test('availability wall-clock input preserves the device timezone in both extreme offsets',()=>{
 assert.equal(run('Pacific/Kiritimati',"console.log(localWorkInstant('2026-11-01 08:30'))"),'2026-10-31T18:30:00.000Z');
 assert.equal(run('Pacific/Pago_Pago',"console.log(localWorkInstant('2026-11-01 08:30'))"),'2026-11-01T19:30:00.000Z');
});
test('availability rejects DST gaps, calendar normalization and reversed or excessive ranges',()=>{
 const script="const assert=require('node:assert/strict');for(const value of ['2026-03-08 02:30','2026-02-30 12:00','2026-11-01 24:00','2026-11-01T08:30','0000-01-01 12:00'])assert.throws(()=>localWorkInstant(value));assert.throws(()=>workAvailabilityRange('2026-11-01 12:00','2026-11-01 11:00'));assert.throws(()=>workAvailabilityRange('2026-01-01 12:00','2027-02-01 12:00'));assert.equal(workAvailabilityRange('2026-11-01 08:30','2026-11-01 10:30').startsAt,'2026-11-01T14:30:00.000Z');console.log('ok')";
 assert.equal(run('America/Edmonton',script),'ok');
});
