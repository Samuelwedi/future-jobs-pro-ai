const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.JWT_SECRET='isolated-chat-media-test';process.env.DATABASE_URL='postgres://unused:unused@127.0.0.1:1/test';

test('private chat attachments, room photos, and effective profile rates',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 const {pool}=require('../dist/config/database');const oldQuery=pool.query,oldConnect=pool.connect;
 const query=async(sql,args)=>{const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
 const ids=Array.from({length:7},(_,i)=>`00000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`);
 const [company,other,boss,worker,foreign,outside,inactive]=ids;
 const storage=require('../dist/services/chatStorage'),oldUpload=storage.uploadPrivateChatFile,oldRead=storage.readPrivateChatFile;const files=new Map();
 storage.uploadPrivateChatFile=async(bytes,name)=>{files.set(name,bytes);return name;};storage.readPrivateChatFile=async(name)=>require('stream').Readable.from(files.get(name));
 let server;
 try {
  await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,timezone text);
   CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,email text,full_name text,profile_pic text,sin text,date_of_birth date);
   CREATE TABLE chat_rooms(id text PRIMARY KEY,company_id uuid,is_group boolean,name text,created_by uuid,updated_at timestamptz DEFAULT now());
   CREATE TABLE chat_room_members(room_id text,user_id uuid);
   CREATE TABLE chat_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,sender_id uuid,room_id text,message text NOT NULL,created_at timestamptz DEFAULT now());
   CREATE TABLE compensation_history(user_id uuid,hourly_rate numeric,effective_date date,created_at timestamptz DEFAULT now(),created_by uuid);`);
  await db.exec(require('fs').readFileSync(require('path').join(__dirname,'../migrations/20261012_chat_media.sql'),'utf8'));
  for(const c of [company,other])await query('INSERT INTO companies VALUES($1,$2)',[c,'America/Edmonton']);
  for(const [id,c,role] of [[boss,company,'boss'],[worker,company,'employee'],[foreign,other,'employee'],[outside,company,'employee'],[inactive,company,'employee']])await query('INSERT INTO users(id,company_id,role,first_name,last_name,profile_pic) VALUES($1,$2,$3,$4,$5,$6)',[id,c,role,'Test','User','https://example.invalid/avatar.jpg']);
  await query('UPDATE users SET is_active=false WHERE id=$1',[inactive]);
  await query("INSERT INTO chat_rooms(id,company_id,is_group,name,created_by) VALUES('group-test',$1,true,'Crew',$2)",[company,boss]);
  for(const u of [boss,worker,inactive])await query("INSERT INTO chat_room_members VALUES('group-test',$1)",[u]);
  await query("INSERT INTO compensation_history(user_id,hourly_rate,effective_date,created_at) VALUES($1,22.5,'2020-01-01','2020-01-01'),($1,25,'2020-01-01','2020-01-02'),($1,30,'2099-01-01','2021-01-01')",[worker]);
  pool.query=query;pool.connect=async()=>({query,release(){}});
  const express=require('express'),jwt=require('jsonwebtoken');const app=express();app.use(express.json());app.use('/api/chat',require('../dist/routes/chatRoutes').default);app.use('/api/users',require('../dist/routes/userRoutes').default);app.use('/api/payroll',require('../dist/routes/payrollRouter').default);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,id,method='GET',body)=>fetch(base+path,{method,headers:{...(id?{Authorization:'Bearer '+jwt.sign({id},process.env.JWT_SECRET)}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const upload=(id,name='proof.pdf',bytes='%PDF-1.4\nTest')=>{const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),name);return request('/api/chat/room/group-test/attachments',id,'POST',form);};
  assert.equal((await upload(null)).status,401);
  for(const id of [foreign,outside,inactive])assert.equal((await upload(id)).status,403);
  assert.equal((await upload(worker,'malware.exe')).status,400);
  assert.equal((await upload(worker,'fake.pdf','<script>bad</script>')).status,400);
  assert.equal((await upload(worker,'big.pdf',new Uint8Array(26*1024*1024))).status,400);
  const result=await upload(worker);assert.equal(result.status,201);const sent=(await result.json()).message;
  assert.equal(sent.attachment_name,'proof.pdf');assert.equal(sent.attachment_type,'application/pdf');assert.equal(sent.sender_avatar,'https://example.invalid/avatar.jpg');
  const path='/api/chat/attachments/'+sent.attachment_id+'/content';
  for(const id of [foreign,outside,inactive])assert.equal((await request(path,id)).status,403);
  const download=await request(path,boss);assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'private, no-store');assert.equal(await download.text(),'%PDF-1.4\nTest');
  const history=(await (await request('/api/chat/messages/group-test',boss)).json()).messages;assert.equal(history[0].attachment_id,sent.attachment_id);assert.equal(history[0].attachment_name,'proof.pdf');
  const detail=(await (await request('/api/chat/room/group-test/details',boss)).json()).room;assert.equal(detail.can_edit_photo,true);
  assert.equal((await (await request('/api/chat/room/group-test/details',worker)).json()).room.can_edit_photo,false);
  const photo=new FormData();photo.append('photo',new Blob(['fake']),'photo.jpg');assert.equal((await request('/api/chat/room/group-test/photo',worker,'POST',photo)).status,403);
  const profile=(await (await request('/api/users/me',worker)).json()).user;assert.equal(profile.current_rate,25);assert.equal(profile.scheduled_rates[0].hourly_rate,30);assert.equal(profile.id,worker);
  const noRate=(await (await request('/api/users/me',outside)).json()).user;assert.equal(noRate.current_rate,null);
  assert.equal((await request('/api/payroll/employees/rate',worker,'POST',{employeeId:worker,hourlyRate:50})).status,403);
  assert.equal((await request('/api/payroll/employees/rate',boss,'POST',{employeeId:foreign,hourlyRate:50})).status,403);
  for(const body of [{employeeId:worker,hourlyRate:'bad'},{employeeId:worker,hourlyRate:26,effectiveDate:'2026-02-30'}])assert.equal((await request('/api/payroll/employees/rate',boss,'POST',body)).status,400);
  assert.equal((await request('/api/payroll/employees/compensation',boss,'POST',{employeeIds:[worker,worker],raiseType:'fixed',raiseValue:2,effectiveDate:'2020-01-03'})).status,200);
  assert.equal((await (await request('/api/users/me',worker)).json()).user.current_rate,27);
  const message=await request('/api/chat/message',worker,'POST',{roomId:'group-test',message:'Text still works'});assert.equal(message.status,200);
  await query("DELETE FROM chat_room_members WHERE user_id=$1",[worker]);assert.equal((await request(path,worker)).status,403);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));pool.query=oldQuery;pool.connect=oldConnect;storage.uploadPrivateChatFile=oldUpload;storage.readPrivateChatFile=oldRead;await db.close();}
});

test('filenames and MIME checks reject active files',()=>{
 const {chatFileType,safeFilename}=require('../dist/services/chatFiles');
 assert.equal(safeFilename('../../secret.pdf'),'secret.pdf');assert.equal(safeFilename('C:\\temp\\report.pdf'),'report.pdf');
 assert.throws(()=>chatFileType('bad.svg',Buffer.from('<svg/>')));assert.throws(()=>chatFileType('bad.html',Buffer.from('html')));
 assert.equal(chatFileType('notes.docx',Buffer.from('PK\x03\x04test')),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

test('cloud uploads are authenticated raw assets and preserve original bytes',async()=>{
 const {v2:cloudinary}=require('cloudinary');const old=cloudinary.uploader.upload_stream;
 let options,received;
 cloudinary.uploader.upload_stream=(opts,done)=>{options=opts;const {Writable}=require('stream');return new Writable({write(chunk,encoding,next){received=Buffer.concat([received||Buffer.alloc(0),chunk]);next();},final(next){done(null,{});next();}});};
 try {const bytes=Buffer.from('%PDF-1.4 original');const id=await require('../dist/services/chatStorage').uploadPrivateChatFile(bytes,'report.pdf');assert.equal(options.type,'authenticated');assert.equal(options.resource_type,'raw');assert.equal(options.overwrite,false);assert.ok(id.endsWith('.pdf'));assert.deepEqual(received,bytes);}finally{cloudinary.uploader.upload_stream=old;}
});
