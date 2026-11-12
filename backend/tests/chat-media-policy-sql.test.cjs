'use strict';
// In-process SQL only: no listening socket, external database, or provider.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,process:{env:{}},require:n=>{assert.ok(Object.hasOwn(imports,n),'stub '+n);return imports[n];}});return module.exports;}
test('media policy SQL enforces current actor, tenant, membership, and support roles',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();let held=0;
 const query=async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.rows.length||result.affectedRows||0};};
 const pool={query,connect:async()=>{held++;return {query,release(){held--;}};}};
 const trial=load('middleware/trialMiddleware.ts',{'../services/complimentaryAccess':{hasComplimentaryCompanyAccess:async()=>false},'../config/database':{pool},'../utils/auth':{}});
 const api=load('services/chatMediaAuthorization.ts',{'../config/database':{pool},'./complimentaryAccess':{hasComplimentaryAccess:()=>false},'../middleware/trialMiddleware':trial});
 try{
  await db.exec(`CREATE TABLE companies(id text PRIMARY KEY,is_active boolean DEFAULT true,subscription_status text DEFAULT 'active',subscription_current_period_end timestamptz,subscription_expires_at timestamptz);
   CREATE TABLE users(id text PRIMARY KEY,company_id text,role text,is_active boolean DEFAULT true,must_change_password boolean DEFAULT false);
   CREATE TABLE chat_rooms(id text PRIMARY KEY,company_id text,is_group boolean,created_by text);
   CREATE TABLE chat_room_members(room_id text,user_id text,membership_instance_id uuid DEFAULT gen_random_uuid());
   CREATE TABLE support_tickets(id text PRIMARY KEY,company_id text,user_id text);
   INSERT INTO companies(id) VALUES('company'),('target');
   INSERT INTO users(id,company_id,role) VALUES('actor','company','employee');
   INSERT INTO chat_rooms VALUES('room','company',true,'actor'),('support-ticket-ticket','target',false,NULL);
   INSERT INTO chat_room_members(room_id,user_id) VALUES('room','actor');
   INSERT INTO support_tickets VALUES('ticket','target','actor');`);
  const identity={actorId:'actor',requestCompanyId:'company',claimedCompanyId:'company'};
  const capture=(room='room',scope)=>api.readChatMediaPolicy(identity,room,scope,async(_c,p)=>p.scope);
  const scope=await capture();assert.ok(scope.membershipInstance);assert.equal(held,0);
  await db.exec("UPDATE users SET is_active=false WHERE id='actor'");await assert.rejects(capture(),e=>e.status===403);
  await db.exec("UPDATE users SET is_active=true,company_id='target' WHERE id='actor'");await assert.rejects(capture(),e=>e.status===403);
  await db.exec("UPDATE users SET company_id='company' WHERE id='actor'; DELETE FROM chat_room_members; INSERT INTO chat_room_members(room_id,user_id) VALUES('room','actor')");await assert.rejects(capture('room',scope),e=>e.status===403);
  const support=await capture('support-ticket-ticket');assert.equal(support.targetCompanyId,'target');assert.equal(support.actorCompanyId,'company');assert.equal(support.membershipInstance,null);
  await db.exec("UPDATE companies SET subscription_status='inactive' WHERE id='company'");await assert.rejects(capture('support-ticket-ticket'),e=>e.status===402);
  await db.exec("UPDATE companies SET subscription_status='active' WHERE id='company'; UPDATE support_tickets SET user_id='other'; UPDATE users SET role='boss'");await assert.rejects(capture('support-ticket-ticket'),e=>e.status===403);
  await db.exec("UPDATE users SET role='admin'");await capture('support-ticket-ticket');assert.equal(held,0);
 }finally{await db.close();}
});
