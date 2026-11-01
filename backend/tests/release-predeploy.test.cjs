const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {run,steps}=require('../scripts/run-release-predeploy.cjs');
test('single predeploy process runs all migrations in order without shell parsing',()=>{
 const called=[];run((exe,args,opts)=>{assert.equal(exe,process.execPath);assert.equal(opts.shell,false);called.push(path.basename(args[0]));return {status:0};});assert.deepEqual(called,steps);
});
test('failed or terminated migration prevents later migrations and deployment success',()=>{
 for(const result of [{status:1},{status:null,signal:'SIGTERM'},{error:new Error('spawn failure')}]){let calls=0;assert.throws(()=>run(()=>{calls++;return result;}),/Release migration failed/);assert.equal(calls,1);}
});

const {migrate,files}=require('../scripts/run-business-parity-migration.cjs');
test('business schema is verified before commit and is wired into Railway predeploy',async()=>{
 assert.ok(steps.includes('run-business-parity-migration.cjs'));const queries=[];
 await migrate({query:async sql=>{queries.push(sql);}});
 assert.equal(queries[0],'BEGIN');assert.equal(queries.at(-1),'COMMIT');assert.equal(queries.filter(sql=>sql.startsWith('ALTER TABLE')).length,files.length);
 for(const table of ['invoices','estimates','payments'])assert.ok(queries.some(sql=>sql.includes('FROM '+table+' LIMIT 0')));
});
test('business migration rolls back and rejects when a schema change or verification fails',async()=>{
 for(const match of ['ALTER TABLE estimates','FROM payments LIMIT 0']){
  const queries=[];await assert.rejects(migrate({query:async sql=>{queries.push(sql);if(sql.includes(match))throw Error('Synthetic schema failure');}}),/Synthetic schema failure/);
  assert.equal(queries.at(-1),'ROLLBACK');assert.ok(!queries.includes('COMMIT'));
 }
});
