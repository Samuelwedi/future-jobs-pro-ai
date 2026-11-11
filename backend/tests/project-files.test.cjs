const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),path=require('node:path');
const express=require('express'),jwt=require('jsonwebtoken');
const {PGlite}=require('@electric-sql/pglite');
process.env.TS_NODE_PROJECT=path.join(__dirname,'../tsconfig.json');process.env.JWT_SECRET='isolated-project-files-tests';
require('ts-node/register/transpile-only');
const {pool}=require('../src/config/database');let db,server,base,attachmentReads;
pool.query=async(sql,args)=>{if(/FROM attachments/.test(sql))attachmentReads++;const result=await db.query(sql,args);return {...result,rowCount:result.rows.length||result.affectedRows||0};};
const storageId=require.resolve('../src/services/cloudStorageService');require.cache[storageId]={id:storageId,filename:storageId,loaded:true,exports:{uploadAttachment:async()=>{throw Error('Provider calls are forbidden in project Files tests');}}};
before(async()=>{
 db=new PGlite();await db.exec(`CREATE TABLE users(id TEXT,company_id TEXT,role TEXT,is_active BOOLEAN,first_name TEXT,last_name TEXT);
 CREATE TABLE projects(id TEXT,company_id TEXT,archived_at TIMESTAMPTZ);
 CREATE TABLE attachments(id TEXT,company_id TEXT,project_id TEXT,uploaded_by TEXT,file_name TEXT,file_url TEXT,created_at TIMESTAMPTZ);
 CREATE TABLE project_attachments(id TEXT,project_id TEXT,file_name TEXT,file_path TEXT);`);
 const app=express();app.use('/attachments',require('../src/routes/attachmentRoutes').default);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
beforeEach(async()=>{
 attachmentReads=0;await db.exec(`TRUNCATE users,projects,attachments,project_attachments;
 INSERT INTO users VALUES ('worker','a','employee',TRUE,'Test','Worker'),('boss','a','boss',TRUE,'Test','Boss'),('manager','a','manager',TRUE,'Test','Manager'),('admin','a','admin',TRUE,'Test','Admin'),('foreign','b','boss',TRUE,'Foreign','Boss'),('inactive','a','boss',FALSE,'Inactive','Boss'),('legacy','a','employee',NULL,'Legacy','Worker');
 INSERT INTO projects VALUES ('ours','a',NULL),('other','a',NULL),('foreign','b',NULL),('archived','a','2026-11-11');
 INSERT INTO attachments VALUES
 ('old','a','ours','worker','Older.pdf','https://example.test/old','2026-11-11T12:00:00Z'),
 ('new','a','ours','manager','École.pdf','https://example.test/new','2026-11-11T13:00:00Z'),
 ('wrong-company','b','ours','foreign','Private.pdf','https://example.test/private','2026-11-11T14:00:00Z'),
 ('other-project','a','other','worker','Other.pdf','https://example.test/other','2026-11-11T14:00:00Z'),
 ('foreign-file','b','foreign','foreign','Foreign.pdf','https://example.test/foreign','2026-11-11T14:00:00Z'),
 ('archived-file','a','archived','worker','Archived.pdf','https://example.test/archived','2026-11-11T14:00:00Z');
 INSERT INTO project_attachments VALUES ('legacy-file','ours','Legacy local.pdf','uploads/projects/legacy.pdf');`);
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();await pool.end();});
async function read(actor='worker',project='ours',rawToken){const token=rawToken??(actor?jwt.sign({id:actor,companyId:'a',role:'boss'},process.env.JWT_SECRET):null);const response=await fetch(`${base}/attachments?projectId=${encodeURIComponent(project)}`,{headers:token?{Authorization:'Bearer '+token}:{}});return {status:response.status,data:await response.json()};}
test('existing employee/manager/boss/admin company access returns only modern attachments for the chosen project',async()=>{
 for(const actor of ['worker','manager','boss','admin','legacy']){
  const result=await read(actor);assert.equal(result.status,200);assert.deepEqual(result.data.attachments.map(a=>a.id),['new','old']);assert.equal(result.data.attachments[0].file_name,'École.pdf');assert.ok(result.data.attachments.every(a=>a.company_id==='a'&&a.project_id==='ours'));
 }
 assert.equal((await read('worker','archived')).data.attachments[0].id,'archived-file');
});
test('anonymous, inactive, invalid-token and cross-company reads never run the attachment listing',async()=>{
 for(const args of [[null],['inactive'],['worker','ours','invalid-token'],['foreign'],['worker','foreign'],['worker','missing']]){
  attachmentReads=0;const result=await read(...args);assert.notEqual(result.status,200);assert.equal(result.data.attachments,undefined);assert.equal(attachmentReads,0);
 }
});
test('current database company overrides stale token claims; deactivation blocks later refreshes',async()=>{
 await db.exec("UPDATE users SET company_id='b' WHERE id='worker'");assert.notEqual((await read()).status,200);assert.equal(attachmentReads,0);
 assert.deepEqual((await read('worker','foreign')).data.attachments.map(a=>a.id),['foreign-file']);
 await db.exec("UPDATE users SET is_active=FALSE WHERE id='worker'");attachmentReads=0;assert.notEqual((await read('worker','foreign')).status,200);assert.equal(attachmentReads,0);
});
test('legacy project_attachments local paths are not represented as recovered files; empty modern lists remain empty',async()=>{
 await db.exec("DELETE FROM attachments WHERE company_id='a' AND project_id='ours'");const result=await read();assert.equal(result.status,200);assert.deepEqual(result.data.attachments,[]);
 assert.equal((await db.query('SELECT file_path FROM project_attachments')).rows[0].file_path,'uploads/projects/legacy.pdf');
});
