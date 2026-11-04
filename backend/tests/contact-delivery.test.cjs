const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const mail=require('../dist/services/emailService');let server,base,calls=[],fail=false;
before(async()=>{mail.sendEmail=async(...args)=>{calls.push(args);if(fail)throw Error('provider unavailable');};const app=express();app.use(express.json());app.use(require('../dist/routes/contactRoutes').default);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));});
const payload={name:'<Name>',email:'sender@example.test',message:'<script>hello</script>'};
async function send(body){const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
test('contact validates input, escapes content, waits for provider acceptance and limits abuse',async()=>{
 assert.equal((await send({...payload,email:'invalid'})).status,400);
 assert.equal((await send({...payload,message:'x'.repeat(5001)})).status,400);assert.equal(calls.length,0);
 fail=true;const failed=await send(payload);assert.equal(failed.status,503);assert.equal(failed.data.success,false);
 fail=false;const sent=await send({...payload,to:'attacker@example.test'});assert.equal(sent.status,202);assert.equal(sent.data.success,true);
 assert.equal(calls[1][0],'support@futurejobsproai.com');assert.match(calls[1][2],/&lt;script&gt;/);assert.match(calls[1][2],/&lt;Name&gt;/);
 assert.equal((await send(payload)).status,202);
 const limit=await send(payload);assert.equal(limit.status,429);assert.equal(limit.data.success,false);assert.equal(calls.length,3);
});
