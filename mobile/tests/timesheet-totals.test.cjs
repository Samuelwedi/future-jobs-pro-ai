const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { exports: {}, Intl, Date };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/utils/timesheetTotals.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const {timesheetDay,sumTimesheetHours}=context.exports;
test('company date keeps a boundary shift visible when the device is in another timezone',()=>{
 assert.equal(timesheetDay({clock_in:'2026-10-12T03:00:00Z',work_date:'2026-10-11'},'Asia/Tokyo'),'2026-10-11');
 assert.equal(timesheetDay({clock_in:'2026-10-12T03:00:00Z'},'America/Edmonton'),'2026-10-11');
});
test('daily and weekly totals use net hours and server overtime instead of an eight-hour rule',()=>{
 const shifts=[{clock_in:'2026-10-05T15:00:00Z',hours:'10',regularHours:'10',overtimeHours:'0'}, {clock_in:'2026-10-06T15:00:00Z',hours:'9.5',regularHours:'7.5',overtimeHours:'2'}];
 const total=sumTimesheetHours(shifts);
 assert.equal(total.total,19.5);assert.equal(total.regular,17.5);assert.equal(total.overtime,2);
 assert.equal(sumTimesheetHours([shifts[0]]).overtime,0);
 assert.equal(total.total,total.regular+total.overtime);
});
test('malformed hours cannot poison totals with NaN',()=>{
 const total=sumTimesheetHours([{clock_in:'2026-10-05',hours:'NaN',regularHours:'-2',overtimeHours:'Infinity'}]);
 assert.equal(total.total,0);assert.equal(total.regular,0);assert.equal(total.overtime,0);
});
