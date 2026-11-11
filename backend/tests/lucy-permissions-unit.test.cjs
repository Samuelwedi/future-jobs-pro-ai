const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../dist/config/database');
const {isManagerRole,manages}=require('../dist/middleware/companyActor');
const {createCompanyTask,TaskInputError}=require('../dist/services/companyTaskService');
const {createPTORequest}=require('../dist/services/ptoService');
const id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const actor={id:id(11),company_id:id(1),role:'owner'},assignee=id(12);
after(async()=>{await pool.end();});

test('manager aliases share a closed role vocabulary',()=>{
 for(const role of ['boss','owner','manager','admin','OWNER']){assert.equal(isManagerRole(role),true);assert.equal(manages({...actor,role}),true);}
 for(const role of ['employee','superadmin','owner ',null,{},['owner']])assert.equal(isManagerRole(role),false);
});

test('task validation rejects invalid inputs before acquiring a connection',async()=>{
 const connect=pool.connect;let attempts=0;pool.connect=async()=>{attempts++;throw new Error('Must not connect');};
 try{
  for(const value of [undefined,null,{},'', '  ','x'.repeat(4001)])await assert.rejects(()=>createCompanyTask(actor,value),error=>error instanceof TaskInputError&&error.status===400);
  for(const value of ['not-an-id',{},42])await assert.rejects(()=>createCompanyTask(actor,'Task',value),error=>error.status===400);
  await assert.rejects(()=>createCompanyTask({...actor,role:'employee'},'Task'),error=>error.status===403);
  assert.equal(attempts,0);
 }finally{pool.connect=connect;}
});

test('task writes lock tenant members in stable order and commit internal notification atomically',async()=>{
 const connect=pool.connect;const statements=[];let released=false;
 pool.connect=async()=>({query:async(sql,args)=>{
  statements.push({sql,args});
  if(sql.includes('WHERE id=ANY')){assert.deepEqual(args,[[actor.id,assignee],actor.company_id]);assert.match(sql,/company_id=\$2/);assert.match(sql,/is_active/);assert.match(sql,/ORDER BY id FOR UPDATE/);return {rows:[{id:actor.id,role:'owner'},{id:assignee,role:'employee'}]};}
  if(sql.startsWith('INSERT INTO tasks'))return {rows:[{id:id(20),description:args[1],assigned_to:args[2],company_id:args[0]}]};
  return {rows:[]};
 },release(){released=true;}});
 try{const result=await createCompanyTask(actor,' Trimmed task ',assignee.toUpperCase(),true);assert.equal(result.description,'Trimmed task');assert.equal(result.assigned_to,assignee);assert.equal(statements[0].sql,'BEGIN');assert.equal(statements.at(-1).sql,'COMMIT');assert.ok(statements.some(row=>row.sql.startsWith('INSERT INTO in_app_notifications')));assert.equal(released,true);}
 finally{pool.connect=connect;}
});

test('task service rejects revoked actor or missing tenant assignee and rolls back',async()=>{
 const connect=pool.connect;
 try{for(const [members,status] of [[[],403],[[{id:actor.id,role:'employee'},{id:assignee,role:'employee'}],403],[[{id:actor.id,role:'owner'}],404]]){
  const statements=[];pool.connect=async()=>({query:async(sql)=>{statements.push(sql);return {rows:sql.includes('WHERE id=ANY')?members:[]};},release(){}});
  await assert.rejects(()=>createCompanyTask(actor,'Blocked task',assignee),error=>error.status===status);
  assert.equal(statements.at(-1),'ROLLBACK');assert.ok(!statements.some(sql=>sql.startsWith('INSERT')));
 }}finally{pool.connect=connect;}
});

test('internal task-notification failure cannot return an apparently successful task commit',async()=>{
 const connect=pool.connect;const statements=[];
 pool.connect=async()=>({query:async(sql)=>{statements.push(sql);if(sql.includes('WHERE id=ANY'))return {rows:[{id:actor.id,role:'owner'},{id:assignee,role:'employee'}]};if(sql.startsWith('INSERT INTO tasks'))return {rows:[{id:id(20)}]};if(sql.startsWith('INSERT INTO in_app_notifications'))throw new Error('Notification storage unavailable');return {rows:[]};},release(){}});
 try{await assert.rejects(()=>createCompanyTask(actor,'Atomic task',assignee,true),/storage unavailable/);assert.equal(statements.at(-1),'ROLLBACK');assert.ok(!statements.includes('COMMIT'));}
 finally{pool.connect=connect;}
});

test('PTO expected role is checked in the same membership lock as submission',async()=>{
 const connect=pool.connect;const statements=[];
 pool.connect=async()=>({query:async(sql,args)=>{statements.push(sql);if(sql.startsWith('SELECT id FROM users')){assert.match(sql,/company_id=\$2/);assert.match(sql,/FOR UPDATE/);assert.match(sql,/LOWER\(COALESCE\(role/);assert.deepEqual(args,[actor.id,actor.company_id,'owner']);return {rows:[],rowCount:0};}return {rows:[],rowCount:0};},release(){}});
 try{await assert.rejects(()=>createPTORequest(actor.id,actor.company_id,'2027-01-01','2027-01-02','sick',undefined,'owner'),error=>error.status===403);assert.equal(statements.at(-1),'ROLLBACK');assert.ok(!statements.some(sql=>sql.startsWith('INSERT')));}
 finally{pool.connect=connect;}
});
