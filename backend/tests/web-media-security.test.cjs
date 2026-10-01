require('./media-download.test.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {webSecurityHeaders}=require('../dist/config/webSecurity');
async function policy(cloud){
 const old=process.env.CLOUDINARY_CLOUD_NAME;
 let server;
 try {
  if(cloud===undefined)delete process.env.CLOUDINARY_CLOUD_NAME;else process.env.CLOUDINARY_CLOUD_NAME=cloud;
  const app=express();app.use(webSecurityHeaders());app.get('/',(_q,r)=>r.send('ok'));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const res=await fetch(`http://127.0.0.1:${server.address().port}/`);
  return res.headers.get('content-security-policy');
 }finally{if(server)await new Promise(r=>server.close(r));if(old===undefined)delete process.env.CLOUDINARY_CLOUD_NAME;else process.env.CLOUDINARY_CLOUD_NAME=old;}
}
test('media security allows configured Cloudinary photos, videos and downloads without permitting external scripts',async()=>{
 const h=await policy('test-cloud');const directives=Object.fromEntries(h.split(';').map(s=>{const [key,...v]=s.split(' ');return [key,v];}));
 for(const key of ['img-src','media-src','connect-src'])assert.ok(directives[key].includes('https://res.cloudinary.com/test-cloud/'));
 assert.deepEqual(directives['script-src'],["'self'"]);assert.deepEqual(directives['object-src'],["'none'"]);assert.deepEqual(directives['frame-ancestors'],["'self'"]);
 assert.ok(!h.includes('https://res.cloudinary.com;'));
});
test('missing or malformed Cloudinary account never broadens media policy',async()=>{
 for(const value of [undefined,'','bad/name','good;script-src *'])assert.ok(!(await policy(value)).includes('res.cloudinary.com'));
});
