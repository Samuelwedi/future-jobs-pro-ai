const {test}=require('node:test');
const assert=require('node:assert/strict');
const {exportRows,timesheetCsv,timesheetPdf}=require('../dist/services/timesheetExport');
const computed={policy:{timezone:'America/Edmonton',overtime_multiplier:1.5},rows:[{id:'x',overtime_hourly_rate:20}],hours:new Map([['x',{regular:8,overtime:1}]])};
const entry={id:'x',clock_in:'2026-09-22T03:00:00Z',clock_out:'2026-09-22T13:00:00Z',break_minutes:60,project_name:'École, "Nord"'};
test('CSV and PDF records use company dates, overnight clock-out date, and net hours',()=>{
 const [row]=exportRows([entry],computed);assert.equal(row.date,'2026-09-21');assert.equal(row.clockIn,'21:00:00');assert.equal(row.clockOut,'2026-09-22 07:00:00');assert.equal(row.hours,'9.00');assert.equal(row.regular,'8.00');assert.equal(row.overtime,'1.00');assert.equal(row.wage,'190.00');
 const csv=timesheetCsv([row]);assert.ok(csv.startsWith('\uFEFFDate,'));assert.match(csv,/"École, ""Nord"""/);assert.match(csv,/9.00,8.00,1.00,190.00/);
});
test('locked payroll uses recorded values and open shifts have no final duration',()=>{
 const [locked,open]=exportRows([{...entry,payroll_locked_at:'2026-10-01',regular_hours:'7.5',overtime_hours:'1.5',total_wage:'195'},{...entry,clock_out:null}],computed);
 assert.equal(locked.regular,'7.50');assert.equal(locked.overtime,'1.50');assert.equal(locked.wage,'195.00');assert.equal(open.hours,'0.00');assert.equal(open.clockOut,'');
});
test('CSV escapes formula prefixes even after whitespace and preserves embedded newlines',()=>{
 for(const project of ['=SUM(A1:A5)',' +1','\t@SUM(1,2)','\r-1']){
  const row=exportRows([{...entry,project_name:project}],computed)[0];assert.ok(timesheetCsv([row]).includes('"\''+project+'"'));
 }
 assert.match(timesheetCsv(exportRows([{...entry,project_name:'a\nb'}],computed)),/"a\nb"/);
});
test('PDF contains valid bytes for multiple pages without a provider or external request',async()=>{
 const rows=exportRows(Array.from({length:35},(_,i)=>({...entry,project_name:`École Nord ${i}`})),computed);
 const pdf=await timesheetPdf(rows,{userId:'fixture-user',start:'2026-09-21',end:'2026-09-22',timezone:'America/Edmonton'});
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>5000);assert.match(pdf.toString('latin1'),/\/Type \/Pages/);
});
