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
