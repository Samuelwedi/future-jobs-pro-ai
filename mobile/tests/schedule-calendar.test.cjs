const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'../src');
function load(file,requireFn){const c={exports:{},require:requireFn,Date,Error};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);return c.exports;}
const {scheduleCalendar,CALENDAR_TIME_NOTICE,CALENDAR_INVALID,CALENDAR_OVERNIGHT}=load('utils/scheduleCalendar.ts');
const shift=(changes={})=>({id:'shift-1',date:'2026-11-09',start_time:'09:00:00',end_time:'17:30:15',name:'Roof inspection',project_name:'École Nord',project_address:'12 Main St',notes:'Bring ladder',...changes});
const options=(changes={})=>({companyId:'company',start:'2026-11-01',end:'2026-11-30',timeNotice:CALENDAR_TIME_NOTICE,now:new Date('2026-11-11T12:34:56.000Z'),...changes});
const unfolded=s=>s.replace(/\r\n /g,'');
const props=s=>unfolded(s).split('\r\n');
test('CRLF iCalendar preserves exact floating dates, seconds, Unicode and metadata without external actions',()=>{
 const s=scheduleCalendar([shift()],options()),p=props(s);
 assert.equal(p[0],'BEGIN:VCALENDAR');assert.equal(p.at(-2),'END:VCALENDAR');assert.equal(p.at(-1),'');
 for(const line of ['VERSION:2.0','DTSTAMP:20261111T123456Z','DTSTART:20261109T090000','DTEND:20261109T173015','SUMMARY:Roof inspection','LOCATION:12 Main St'])assert.ok(p.includes(line),line);
 assert.equal(p.filter(l=>l==='BEGIN:VEVENT').length,1);assert.ok(p.find(l=>l.startsWith('DESCRIPTION:')).includes('École Nord\\n\\nBring ladder'));
 assert.doesNotMatch(s,/TZID|VTIMEZONE|RRULE|DURATION|METHOD:|ATTENDEE|ORGANIZER|ATTACH|URL:/);assert.doesNotMatch(s.replace(/\r\n/g,''),/[\r\n]/);
});
test('injection-like fields and IDs cannot add properties; Unicode folding respects 75 UTF-8 octets',()=>{
 const malicious='A\\B;C,D\r\nEND:VEVENT\nBEGIN:VEVENT\rATTENDEE:attacker\u0000\u2028'+'é😀漢'.repeat(100);
 const s=scheduleCalendar([shift({id:malicious,name:malicious,project_address:malicious,notes:malicious})],options({companyId:malicious})),p=props(s);
 assert.equal(p.filter(l=>l==='BEGIN:VEVENT').length,1);assert.equal(p.filter(l=>l==='END:VEVENT').length,1);assert.equal(p.filter(l=>l.startsWith('ATTENDEE:')).length,0);
 assert.ok(p.find(l=>l.startsWith('SUMMARY:')).includes('A\\\\B\\;C\\,D\\nEND:VEVENT\\nBEGIN:VEVENT\\nATTENDEE:attacker \\n'));
 assert.doesNotMatch(s,/\u0000|�/);for(const line of s.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75,line);
 assert.ok(unfolded(s).includes('é😀漢'.repeat(100)));assert.ok(p.find(l=>l.startsWith('UID:')).includes('%5Cr%5Cn'));
});
test('UIDs are stable per company/shift and collision-free for separator-like IDs',()=>{
 const uid=(s,c='company')=>props(scheduleCalendar([shift({id:s})],options({companyId:c}))).find(l=>l.startsWith('UID:'));
 assert.equal(uid('id'),uid('id'));assert.notEqual(uid('id','other'),uid('id'));assert.notEqual(uid('c','a.b'),uid('b.c','a'));assert.notEqual(uid('c','a-b'),uid('b-c','a'));
});
test('empty, invalid, out-of-range, missing, duplicate and zero-valued calendar data fail closed',()=>{
 for(const rows of [[],[null],[shift({id:''})],[shift(),shift()],[shift({name:''})],[shift({date:'2026-02-30'})],[shift({date:'2026-11-00'})],[shift({date:'0000-11-09'})],[shift({date:'2026-11-09T00:00:00Z'})],[shift({date:'2026-12-01'})],[shift({start_time:'24:00'})],[shift({start_time:'09:60'})],[shift({start_time:'09:00:60'})],[shift({start_time:'09:00:00.001'})],[shift({end_time:0})],[shift({notes:{text:'not a string'}})]])assert.throws(()=>scheduleCalendar(rows,options()),{message:CALENDAR_INVALID});
 for(const change of [{companyId:''},{start:'2026-02-30'},{end:'2026-10-01'},{now:new Date('invalid')}])assert.throws(()=>scheduleCalendar([shift()],options(change)),{message:CALENDAR_INVALID});
});
test('one overnight/equal-time shift blocks the whole file; midnight starts remain valid',()=>{
 for(const times of [{start_time:'22:00',end_time:'06:00'},{start_time:'09:00',end_time:'09:00:00'},{start_time:'00:00',end_time:'00:00'}])assert.throws(()=>scheduleCalendar([shift(),shift({id:'night',...times})],options()),{message:CALENDAR_OVERNIGHT});
 assert.ok(scheduleCalendar([shift({start_time:'00:00',end_time:'01:00'})],options()).includes('DTSTART:20261109T000000'));
});
test('DST dates and travel never trigger guessed UTC/company-timezone conversion',()=>{
 const old=process.env.TZ;try{for(const date of ['2026-03-08','2026-11-01']){let expected;for(const zone of ['UTC','America/New_York','Pacific/Auckland','Asia/Kolkata']){
  process.env.TZ=zone;const value=scheduleCalendar([shift({date,start_time:'01:30',end_time:'03:30'})],options({start:date,end:date}));if(expected)assert.equal(value,expected);expected=value;assert.ok(props(value).includes(`DTSTART:${date.replaceAll('-','')}T013000`));assert.ok(unfolded(value).includes(CALENDAR_TIME_NOTICE.replace(/,/g,'\\,')));
 }}}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('leap dates validate; loaded frozen rows are neither mutated nor expanded into recurrence',()=>{
 const rows=Object.freeze([Object.freeze(shift({date:'2028-02-29',recurring_shift_id:'rule'}))]);const output=scheduleCalendar(rows,options({start:'2028-02-01',end:'2028-03-01'}));assert.ok(output.includes('DTSTART:20280229'));assert.equal(props(output).filter(l=>l==='BEGIN:VEVENT').length,1);assert.throws(()=>scheduleCalendar([shift({date:'2027-02-29'})],options({start:'2027-02-01',end:'2027-03-01'})));
});
function shareFixture(){const c={current:true,events:[],platform:{OS:'ios'}};c.fs={cacheDirectory:'file:///cache/',EncodingType:{UTF8:'utf8'},makeDirectoryAsync:async(...args)=>c.events.push(['mkdir',...args]),readDirectoryAsync:async()=>[],writeAsStringAsync:async(...args)=>c.events.push(['write',...args]),deleteAsync:async(...args)=>c.events.push(['delete',...args])};c.sharing={isAvailableAsync:async()=>true,shareAsync:async(...args)=>c.events.push(['share',...args])};c.run=load('services/calendarShare.ts',name=>({'expo-file-system/legacy':c.fs,'expo-sharing':c.sharing,'react-native':{Platform:c.platform}}[name])).shareCalendarFile;return c;}
test('native sharing writes UTF-8 .ics and calendar MIME/UTI, retaining the handed-off URI for recipients',async()=>{
 const c=shareFixture();await c.run('calendar bytes',()=>c.current);assert.deepEqual(c.events.map(e=>e[0]),['mkdir','write','share']);const w=c.events[1],s=c.events[2];assert.match(w[1],/^file:\/\/\/cache\/calendar-exports\/schedule_.*\.ics$/);assert.equal(w[2],'calendar bytes');assert.equal(w[3].encoding,'utf8');assert.equal(s[1],w[1]);assert.equal(s[2].mimeType,'text/calendar');assert.equal(s[2].UTI,'com.apple.ical.ics');
});
test('web, missing cache and unavailable sharing never create or upload files',async()=>{
 for(const mode of ['web','cache','unavailable']){const c=shareFixture();if(mode==='web')c.platform.OS='web';if(mode==='cache')c.fs.cacheDirectory=null;if(mode==='unavailable')c.sharing.isAvailableAsync=async()=>false;await assert.rejects(c.run('file',()=>c.current));assert.equal(c.events.length,0);}
});
test('stale state before/after availability, preparation or write suppresses the chooser and removes unshared bytes',async()=>{
 for(const point of ['before','availability','directory','write']){const c=shareFixture();if(point==='before')c.current=false;if(point==='availability')c.sharing.isAvailableAsync=async()=>{c.current=false;return true;};if(point==='directory')c.fs.makeDirectoryAsync=async()=>{c.current=false;};if(point==='write')c.fs.writeAsStringAsync=async()=>{c.current=false;c.events.push(['write']);};await c.run('file',()=>c.current);assert.equal(c.events.filter(e=>e[0]==='share').length,0);assert.equal(c.events.filter(e=>e[0]==='delete').length,point==='write'?1:0);}
});
test('partial writes clean immediately; uncertain share failures retain files and never retry sharing',async()=>{
 const c=shareFixture();c.fs.writeAsStringAsync=async()=>{throw Error('partial write');};await assert.rejects(c.run('file',()=>c.current),/partial write/);assert.equal(c.events.filter(e=>e[0]==='delete').length,1);
 const s=shareFixture();s.sharing.shareAsync=async()=>{s.events.push(['share']);throw Error('uncertain share');};await assert.rejects(s.run('file',()=>s.current),/uncertain share/);assert.equal(s.events.filter(e=>e[0]==='delete').length,0);assert.equal(s.events.filter(e=>e[0]==='share').length,1);
});
test('later exports prune only generated files older than 24 hours; recent, foreign and traversal names survive',async()=>{
 const c=shareFixture(),old=`schedule_${Date.now()-86400001}_abc.ics`,recent=`schedule_${Date.now()}_def.ics`;
 c.fs.readDirectoryAsync=async()=>[old,recent,'notes.txt','schedule_0_abc.ics','../'+old,'schedule_9999999999999_abc.ics'];await c.run('file',()=>c.current);assert.deepEqual(c.events.filter(e=>e[0]==='delete').map(e=>e[1]),['file:///cache/calendar-exports/'+old]);
 const s=shareFixture();s.fs.readDirectoryAsync=async()=>{throw Error('unavailable');};await s.run('file',()=>s.current);assert.equal(s.events.filter(e=>e[0]==='share').length,1);
});
const screen=fs.readFileSync(path.join(root,'screens/ScheduleScreen.tsx'),'utf8'),ast=ts.createSourceFile('ScheduleScreen.tsx',screen,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name,c){let expression;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);}visit(ast);assert.ok(expression,name);return vm.runInNewContext(ts.transpileModule('result = '+expression.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);}
function screenFixture(){const c={...require('date-fns'),Date,Error,Symbol,console:{log(){},error(){}},scheduleCalendar,CALENDAR_TIME_NOTICE,scheduleScope:'scope',currentScheduleScope:{current:'scope'},focusActive:{current:true},mounted:{current:true},authCurrent:true,requestNumber:{current:1},exportLock:{current:null},loadedSchedule:{current:null},user:{id:'owner',companyId:'company'},selectedEmployeeId:'employee',selectedEmployeeName:'Jean Martin',selectedDate:new Date(2026,10,9),currentMonth:new Date(2026,10,9),viewMode:'day',events:[],requests:[],t:(text,params={})=>text.replace(/\{(\w+)\}/g,(match,key)=>params[key]??match)};
 c.loadedSchedule.current={shifts:[shift()],start:'2026-11-09',end:'2026-11-09',scope:'scope',request:1,isSessionCurrent:()=>c.authCurrent};c.api={captureSessionGuard:()=>()=>c.authCurrent,get:url=>new Promise((resolve,reject)=>c.requests.push({url,resolve,reject}))};c.Alert={alert:(...args)=>c.events.push(['alert',...args])};for(const setter of ['setShifts','setExportReady','setExporting','setRefreshing','setLoading'])c[setter]=value=>c.events.push([setter,value]);c.shareCalendarFile=async(contents,current)=>{if(current())c.events.push(['share',contents]);};return c;}
const confirmation=c=>c.events.find(e=>e[0]==='alert'&&e[1]==='Export calendar file');const tick=()=>new Promise(setImmediate);
test('only explicit confirmation shares the full loaded range, disclosing employee/count/dates/timezone',async()=>{
 const c=screenFixture();c.loadedSchedule.current.shifts.push(shift({id:'shift-2'}));const choose=handler('chooseCalendarExport',c);choose();choose();assert.equal(c.events.filter(e=>e[0]==='alert').length,1);assert.equal(c.events.filter(e=>e[0]==='share').length,0);const a=confirmation(c);assert.match(a[2],/2 loaded shifts for Jean Martin from 2026-11-09 to 2026-11-09/);assert.match(a[2],/hidden by search/);assert.ok(a[2].includes(CALENDAR_TIME_NOTICE));a[3][1].onPress();a[4].onDismiss();await tick();assert.equal(c.events.filter(e=>e[0]==='share').length,1);assert.equal(c.exportLock.current,null);
});
test('cancel/dismiss and repeated confirmation never duplicate a chooser',async()=>{
 for(const mode of ['cancel','dismiss']){const c=screenFixture(),choose=handler('chooseCalendarExport',c);choose();const a=confirmation(c);mode==='cancel'?a[3][0].onPress():a[4].onDismiss();a[3][1].onPress();await tick();assert.equal(c.events.filter(e=>e[0]==='share').length,0);assert.equal(c.exportLock.current,null);choose();assert.equal(c.events.filter(e=>e[0]==='alert').length,2);}
 const c=screenFixture();let done;c.shareCalendarFile=async()=>{c.events.push(['share']);await new Promise(r=>done=r);};const choose=handler('chooseCalendarExport',c);choose();const a=confirmation(c);a[3][1].onPress();a[3][1].onPress();choose();assert.equal(c.events.filter(e=>e[0]==='share').length,1);done();await tick();assert.equal(c.exportLock.current,null);
});
test('confirmation is inert after auth/owner/company/role/employee/date/range/blur/unmount/new-load changes',async()=>{
 for(const change of ['auth','owner','company','role','employee','date','range','blur','unmount','new-load']){const c=screenFixture();handler('chooseCalendarExport',c)();const a=confirmation(c);if(change==='auth')c.authCurrent=false;else if(change==='blur')c.focusActive.current=false;else if(change==='unmount')c.mounted.current=false;else if(change==='new-load'){c.requestNumber.current++;c.loadedSchedule.current=null;}else c.currentScheduleScope.current=change;a[3][1].onPress();await tick();assert.equal(c.events.filter(e=>e[0]==='share').length,0,change);assert.equal(c.events.filter(e=>e[0]==='alert').length,1,change);}
});
test('ambiguous time blocks export before confirmation; late share errors stay silent after auth changes',async()=>{
 const c=screenFixture();c.loadedSchedule.current.shifts[0].end_time='08:00';handler('chooseCalendarExport',c)();assert.equal(confirmation(c),undefined);assert.equal(c.events[0][1],'Could not export calendar');assert.equal(c.exportLock.current,null);
 const s=screenFixture();s.shareCalendarFile=async()=>{s.authCurrent=false;throw Error('late failure');};handler('chooseCalendarExport',s)();confirmation(s)[3][1].onPress();await tick();assert.equal(s.events.filter(e=>e[0]==='alert').length,1);assert.equal(s.exportLock.current,null);
});
test('new/failed refresh immediately invalidates old export, while successful retry restores it',async()=>{
 const c=screenFixture(),fetch=handler('fetchShifts',c);const pending=fetch();assert.equal(c.loadedSchedule.current,null);assert.deepEqual(c.events[0],['setExportReady',false]);handler('chooseCalendarExport',c)();assert.equal(confirmation(c),undefined);c.requests[0].reject(Error('offline'));await pending;assert.equal(c.loadedSchedule.current,null);const retry=fetch();c.requests[1].resolve({shifts:[shift()]});await retry;assert.equal(c.loadedSchedule.current.shifts.length,1);handler('chooseCalendarExport',c)();assert.ok(confirmation(c));
});
test('auth/render-time scope/blur changes before loading completes cannot arm export',async()=>{
 for(const change of ['auth','scope','blur']){const c=screenFixture(),pending=handler('fetchShifts',c)();if(change==='auth')c.authCurrent=false;else if(change==='scope')c.currentScheduleScope.current='new';else c.focusActive.current=false;c.requests[0].resolve({shifts:[shift()]});await pending;assert.equal(c.loadedSchedule.current,null);assert.equal(c.events.filter(e=>e[0]==='setShifts').length,0);}
});
test('month export records padding dates; button uses loaded data and disables during refresh/sharing',async()=>{
 const c=screenFixture();c.viewMode='month';const pending=handler('fetchShifts',c)();assert.match(c.requests[0].url,/start=2026-10-26&end=2026-12-06$/);c.requests[0].resolve({shifts:[shift()]});await pending;handler('chooseCalendarExport',c)();assert.match(confirmation(c)[2],/2026-10-26 to 2026-12-06/);assert.match(screen,/disabled=\{!exportReady \|\| exporting \|\| refreshing\}/);assert.match(screen,/scheduleCalendar\(snapshot.shifts/);assert.doesNotMatch(screen,/scheduleCalendar\((visibleShifts|matchingShifts)/);
 assert.doesNotMatch(fs.readFileSync(path.join(root,'services/calendarShare.ts'),'utf8'),/downloadAsync|uploadAsync|fetch\(|requestPermissions|expo-calendar|OAuth/);
});
test('dynamic export notice/labels/errors have Spanish and French translations',()=>{
 const {screenCopy}=load('services/screenTranslations.ts');for(const key of [CALENDAR_TIME_NOTICE,CALENDAR_INVALID,CALENDAR_OVERNIGHT,'Export loaded range (.ics)','Preparing calendar file...','Calendar file sharing is available in the iOS and Android apps.']){assert.equal(screenCopy[key].length,2);assert.ok(screenCopy[key].every(text=>text!==key&&text.length>0));}
});
