const {test}=require('node:test');
const assert=require('node:assert/strict');
const nodemailer=require('nodemailer');
const modulePath=require.resolve('../dist/services/emailService');
function load(sendMail,configured=true){
 delete require.cache[modulePath];
 for(const name of ['SMTP_HOST','SMTP_USER','SMTP_PASS']){if(configured)process.env[name]='test';else delete process.env[name];}
 nodemailer.createTransport=()=>({sendMail});
 if(nodemailer.default)nodemailer.default.createTransport=()=>({sendMail});return require(modulePath);
}
const attachment={filename:'test.pdf',content:Buffer.from('test'),contentType:'application/pdf'};
test('disabled SMTP cannot report mail or attachment success',async()=>{
 const m=load(()=>{throw Error('must not call');},false);
 await assert.rejects(m.sendEmail('a@example.test','subject','html'),/SMTP/);
 await assert.rejects(m.sendEmailWithAttachment('a@example.test','subject','html',attachment),/SMTP/);
});
test('transport errors and rejected recipients propagate to callers',async()=>{
 let m=load(async()=>{throw Error('provider offline');});
 await assert.rejects(m.sendEmail('a@example.test','subject','html'),/offline/);
 await assert.rejects(m.sendEmailWithAttachment('a@example.test','subject','html',attachment),/offline/);
 m=load(async()=>({accepted:[],rejected:['a@example.test']}));
 await assert.rejects(m.sendEmail('a@example.test','subject','html'),/not accepted/);
 await assert.rejects(m.sendEmailWithAttachment('a@example.test','subject','html',attachment),/not accepted/);
});
test('accepted attachment reaches transport intact',async()=>{
 let sent;const m=load(async options=>{sent=options;return {accepted:['a@example.test'],rejected:[]};});
 await m.sendEmailWithAttachment('a@example.test','subject','html',attachment);
 assert.equal(sent.to,'a@example.test');assert.deepEqual(sent.attachments,[attachment]);
});
