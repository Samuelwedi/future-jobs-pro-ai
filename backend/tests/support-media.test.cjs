const {test}=require('node:test');const assert=require('node:assert/strict');
process.env.JWT_SECRET='support-media-local-test';process.env.SUPPORT_AGENT_JWT_SECRET='support-media-agent-local-test';
test('customer and assigned-agent media is private, persistent, playable bytes and available after trial expiry',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),express=require('express'),jwt=require('jsonwebtoken'),fs=require('fs'),path=require('path');
 const db=new PGlite();const {pool}=require('../dist/config/database');const old={query:pool.query,connect:pool.connect};
 const query=async(sql,args)=>{const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
 const storage=require('../dist/services/chatStorage');const originals={...storage};const files=new Map();let reads=0;
 storage.uploadPrivateChatFile=async(bytes)=>{const id='stored-'+files.size;files.set(id,bytes);return id;};storage.readPrivateChatFile=async id=>{reads++;return require('stream').Readable.from(files.get(id));};storage.removePrivateChatFile=async id=>files.delete(id);
 const ids=Array.from({length:5},(_,i)=>`00000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`);const [company,user,other,agent,foreignAgent]=ids;
 let server;
 try{
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,first_name text,last_name text,is_active boolean DEFAULT true);CREATE TABLE support_tickets(id serial PRIMARY KEY,user_id uuid,status text,assigned_agent_id uuid);CREATE TABLE platform_support_agents(id uuid PRIMARY KEY,email text,first_name text,last_name text,role text,is_active boolean DEFAULT true);CREATE TABLE platform_support_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id text,customer_user_id uuid,support_agent_id uuid,sender_type text,sender_name text,message text,created_at timestamptz DEFAULT now());`);
  for(let i=0;i<2;i++)await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261031_support_media.sql'),'utf8'));
  for(const id of [user,other])await query("INSERT INTO users VALUES($1,$2,'Test','Customer',true)",[id,company]);
  for(const id of [agent,foreignAgent])await query("INSERT INTO platform_support_agents VALUES($1,'agent@example.test','Agent','Test','agent',true)",[id]);
  await query("INSERT INTO support_tickets(user_id,status,assigned_agent_id) VALUES($1,'open',$2)",[user,agent]);pool.query=query;pool.connect=async()=>({query,release(){}});
  const app=express();app.use(express.json());app.use('/api',require('../dist/middleware/trialMiddleware').subscriptionGate);app.use('/api/support',require('../dist/routes/supportRoutes').default);app.use('/api/support-agent',require('../dist/routes/supportAgentRoutes').default);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const request=(route,id=user,method='GET',body,agentToken=false)=>fetch(base+route,{method,headers:{Authorization:'Bearer '+jwt.sign(agentToken?{tokenType:'platform_support_agent',agentId:id}:{id},agentToken?process.env.SUPPORT_AGENT_JWT_SECRET:process.env.JWT_SECRET)},...(body?{body}:{})});
  const form=()=>{const f=new FormData();f.append('file',new Blob(['%PDF-1.4\nPrivate support proof'],{type:'application/pdf'}),'proof.pdf');return f;};
  assert.equal((await fetch(base+'/api/support/tickets/1/attachments',{method:'POST',body:form()})).status,401);
  assert.equal((await request('/api/support/tickets/1/attachments',other,'POST',form())).status,404);
  let r=await request('/api/support/tickets/1/attachments',user,'POST',form());assert.equal(r.status,201);const message=(await r.json()).message;assert.equal(message.attachment_type,'application/pdf');
  const content=`/api/support/attachments/${message.attachment_id}/content`;
  assert.equal((await request(content,other)).status,404);assert.equal(reads,0);
  r=await request(content);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(await r.text(),/Private support proof/);
  r=await request(`/api/support-agent/attachments/${message.attachment_id}/content`,foreignAgent,'GET',null,true);assert.equal(r.status,403);
  r=await request(`/api/support-agent/attachments/${message.attachment_id}/content`,agent,'GET',null,true);assert.equal(r.status,200);
  r=await request('/api/support-agent/tickets/1/attachments',agent,'POST',form(),true);assert.equal(r.status,201);
  r=await request('/api/support/tickets/1/messages');assert.equal(r.status,200);assert.equal((await r.json()).messages.length,2);
  await query("UPDATE support_tickets SET status='resolved' WHERE id=1");assert.equal((await request('/api/support/tickets/1/attachments',user,'POST',form())).status,409);
 }finally{if(server)await new Promise(r=>server.close(r));pool.query=old.query;pool.connect=old.connect;Object.assign(storage,originals);await db.close();await pool.end();}
});
