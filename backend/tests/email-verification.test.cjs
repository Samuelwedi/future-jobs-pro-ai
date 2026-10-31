const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
process.env.JWT_SECRET='test-verification-only';
const jwt=require('jsonwebtoken');
const express=require('express');
const {pool}=require('../dist/config/database');
const mail=require('../dist/services/emailService');
const db=new PGlite();let server,base,link,fail=false;
const id='00000000-0000-4000-a000-000000000001';
before(async()=>{
 await db.exec(`CREATE TABLE users(id uuid primary key,email text,is_active boolean default true);INSERT INTO users(id,email) VALUES('${id}','owner@example.test')`);
 await db.exec(fs.readFileSync('migrations/20261031_email_verification.sql','utf8'));
 await db.exec(fs.readFileSync('migrations/20261031_email_verification.sql','utf8'));
 pool.query=async(sql,args)=>{const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
 mail.sendVerificationEmail=async(to,url)=>{if(fail)throw Error('provider failed');assert.equal(to,'owner@example.test');link=url;};
 const app=express();app.use(express.json());app.use('/api/auth',require('../dist/routes/emailVerificationRoutes').default);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();await pool.end();});
const call=async(path,body,auth=true)=>{const r=await fetch(base+'/api/auth/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+jwt.sign({id},process.env.JWT_SECRET)}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
test('verification requires sign-in, stores only a digest, and consumes a token once',async()=>{
 assert.equal((await call('email-verification',null,false)).status,401);
 assert.equal((await call('email-verification')).data.verified,false);
 const sent=await call('email-verification',{});assert.equal(sent.status,200);assert.ok(!JSON.stringify(sent).includes('token'));
 const token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');assert.equal(token.length,64);
 const row=(await db.query('SELECT * FROM users')).rows[0];assert.notEqual(row.email_verification_token_hash,token);assert.equal(row.email_verification_token_hash.length,64);
 assert.equal((await call('verify-email',{token},false)).status,200);
 assert.equal((await call('email-verification')).data.verified,true);
 assert.equal((await call('verify-email',{token},false)).status,400);
});
test('delivery failure is visible and revokes its token',async()=>{
 await db.exec('UPDATE users SET email_verified_at=NULL');fail=true;
 assert.equal((await call('email-verification',{})).status,503);
 assert.equal((await db.query('SELECT email_verification_token_hash FROM users')).rows[0].email_verification_token_hash,null);fail=false;
});
test('expired links and changed email addresses cannot be verified',async()=>{
 await call('email-verification',{});let token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');
 await db.exec("UPDATE users SET email_verification_expires_at=NOW()-INTERVAL '1 minute'");
 assert.equal((await call('verify-email',{token},false)).status,400);
 await call('email-verification',{});token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');
 await db.exec("UPDATE users SET email='changed@example.test'");
 assert.equal((await call('verify-email',{token},false)).status,400);
 assert.equal((await call('email-verification')).data.verified,false);
});
