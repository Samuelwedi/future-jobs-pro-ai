'use strict';
// Verification-only preload. No external DNS/HTTP/HTTPS/socket transport is allowed.
// The only permitted destination is a literal 127.0.0.1 port opened by this process.
const net = require('node:net');
const ports = new Set();
const deny = () => { throw Error('External transport denied in photo candidate fixtures'); };
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const server = this;
  server.once('listening', () => {
    const address = server.address();
    if (address && address.address === '127.0.0.1') {
      ports.add(address.port);
      server.once('close', () => ports.delete(address.port));
    }
  });
  return listen.apply(server, args);
};
function check(host, port) {
  if (host !== '127.0.0.1' || !ports.has(Number(port))) deny();
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === 'object') {
    if (first.path) deny();
    check(first.host, first.port);
  } else {
    check(args[1], first);
  }
  return connect.apply(this, args);
};
require('node:tls').connect = deny;
require('node:dgram').createSocket = deny;
const fetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'http:' || url.username || url.password) deny();
  check(url.hostname, url.port || 80);
  return fetch(input, options);
};
const https = require('node:https');
https.request = https.get = deny;
const http = require('node:http');
const request = http.request;
http.request = function (input, ...rest) {
  if (typeof input === 'string' || input instanceof URL) {
    const url = new URL(input);
    if (url.protocol !== 'http:' || url.username || url.password) deny();
    check(url.hostname, url.port || 80);
  } else {
    if (!input || input.socketPath || input.protocol && input.protocol !== 'http:') deny();
    check(input.hostname || input.host, input.port || 80);
  }
  return request.call(this, input, ...rest);
};
http.get = function (...args) { const req = http.request(...args); req.end(); return req; };

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const express=require('express'),multer=require('multer');
const source=fs.readFileSync(path.join(__dirname,'../src/routes/uploadRoutes.ts'),'utf8');
async function fixture(run){
 const s={active:true,company:'company',expired:false,queries:0,checks:0,uploads:0,expireAfterQuery:0,onUpload:null,onQuery:null};
 const modules={express,multer,cloudinary:{v2:{config(){},uploader:{async upload(data,options){s.uploads++;s.data=data;s.options=options;await s.onUpload?.();return{secure_url:'https://fixture.invalid/result'};}}}},'../config/database':{pool:{async query(sql,args){s.queries++;assert.match(sql,/COALESCE\(is_active, TRUE\) = TRUE/);assert.deepEqual(Array.from(args),['actor']);const rows=s.active!==false?[{company_id:s.company}]:[];await s.onQuery?.();return{rows};}}},'../utils/auth':{verifyToken(){s.checks++;if(s.expired)throw Error('expired');if(s.expireAfterQuery && s.queries===s.expireAfterQuery)queueMicrotask(()=>s.expired=true);return{id:'actor'};}}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{require:n=>{assert.ok(modules[n],n);return modules[n];},module,exports:module.exports,process:{env:{}},console:{error(){}},Buffer});
 const app=express();app.use('/upload',module.exports.default);app.use((err,req,res,next)=>res.status(422).json({parserError:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 s.send=async({auth=true,malformed=false,noFile=false}={})=>{const headers={};if(auth)headers.authorization='Bearer fixture';let body;if(malformed){headers['content-type']='multipart/form-data; boundary=fixture';body='--fixture\r\nContent-Disposition: form-data; name="file"; filename="x"\r\n';}else{body=new FormData();body.append('purpose','schedule');if(!noFile)body.append('file',new Blob(['synthetic'],{type:'image/jpeg'}),'test.jpg');}const r=await globalThis.fetch('http://127.0.0.1:'+server.address().port+'/upload',{method:'POST',headers,body});return{status:r.status,body:await r.json()};};
 try{await run(s);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
for(const reason of ['missing','expired','inactive','no company'])test('actual multipart middleware rejects '+reason+' before malformed parser',()=>fixture(async s=>{if(reason==='expired')s.expired=true;if(reason==='inactive')s.active=false;if(reason==='no company')s.company=null;const r=await s.send({auth:reason!=='missing',malformed:true});assert.equal(r.status,401);assert.equal(r.body.parserError,undefined);assert.equal(s.uploads,0);}));
test('actual valid multipart preserves bytes, type, folder and URL',()=>fixture(async s=>{const r=await s.send();assert.deepEqual(r,{status:200,body:{success:true,url:'https://fixture.invalid/result',type:'image/jpeg'}});assert.equal(s.data,'data:image/jpeg;base64,'+Buffer.from('synthetic').toString('base64'));assert.match(s.options.folder,/^future-jobs-pro-ai\/attachments\/schedule\/[0-9]+$/);assert.equal(s.options.resource_type,'auto');assert.equal(s.uploads,1);}));
test('actual authorized malformed multipart reaches parser and never provider',()=>fixture(async s=>{assert.equal((await s.send({malformed:true})).status,422);assert.equal(s.uploads,0);}));
test('actual multipart without file preserves400',()=>fixture(async s=>{assert.equal((await s.send({noFile:true})).status,400);assert.equal(s.uploads,0);}));
for(const change of ['inactive','company','expired'])test('actual provider completion after '+change+' withholds URL',()=>fixture(async s=>{s.onUpload=()=>{if(change==='inactive')s.active=false;if(change==='company')s.company='other';if(change==='expired')s.expired=true;};const r=await s.send();assert.equal(r.status,403);assert.equal(r.body.url,undefined);assert.equal(s.uploads,1);}));
test('expiry during final query denies actual response',()=>fixture(async s=>{s.onQuery=()=>{if(s.queries===3)s.expired=true;};assert.equal((await s.send()).status,403);assert.equal(s.uploads,1);}));
test('expiry after final helper check but before caller continuation denies actual response',()=>fixture(async s=>{s.expireAfterQuery=3;const r=await s.send();assert.equal(r.status,403);assert.equal(r.body.url,undefined);assert.equal(s.uploads,1);}));

test('expiry after admission helper check denies before real malformed parser',()=>fixture(async s=>{s.expireAfterQuery=1;const r=await s.send({malformed:true});assert.equal(r.status,401);assert.equal(r.body.parserError,undefined);assert.equal(s.uploads,0);assert.equal(s.queries,1);}));
test('expiry after pre-provider helper check denies before upload',()=>fixture(async s=>{s.expireAfterQuery=2;const r=await s.send();assert.equal(r.status,403);assert.equal(r.body.url,undefined);assert.equal(s.uploads,0);assert.equal(s.queries,2);}));
test('actual multipart preserves legacy NULL-active access',()=>fixture(async s=>{s.active=null;const r=await s.send();assert.equal(r.status,200);assert.equal(s.uploads,1);}));
test('legacy NULL-active actor explicitly deactivated during provider is denied',()=>fixture(async s=>{s.active=null;s.onUpload=()=>s.active=false;const r=await s.send();assert.equal(r.status,403);assert.equal(r.body.url,undefined);assert.equal(s.uploads,1);}));
