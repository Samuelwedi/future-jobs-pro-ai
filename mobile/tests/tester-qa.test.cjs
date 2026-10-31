const test=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function load(name){const c={exports:{},Date};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,c);return c.exports;}
const {calendarDate,parseCalendarDate}=load('calendarDate');
test('calendar selection retains the local day in both extreme timezone offsets',()=>{
 const old=process.env.TZ;
 try {for(const tz of ['Pacific/Kiritimati','America/Adak','UTC']){process.env.TZ=tz;assert.equal(calendarDate(new Date(2026,9,31,0,0)), '2026-10-31');assert.equal(calendarDate(parseCalendarDate('2026-10-31')), '2026-10-31');assert.throws(()=>parseCalendarDate('2026-02-30'));}}
 finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
const {uploadMetadata}=load('uploadMetadata');
test('videos, voice notes, PNG logos and documents retain their actual upload media types',()=>{
 for(const [uri,field,mime] of [['capture.mp4','file','video/mp4'],['capture.mov','file','video/quicktime'],['note.m4a','audio','audio/mp4'],['note.mp4','audio','audio/mp4'],['logo.png','logo','image/png'],['plan.pdf','file','application/pdf']])assert.equal(uploadMetadata(uri,field).type,mime);
 assert.equal(uploadMetadata('file:///cache/123','file',{name:'notes.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}).type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
