const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../web/src/services/mediaDownload.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(mime='image/jpeg',status=200){
 const seen={clicks:0,fetches:0,revoked:0};
 class TestURL extends URL {static createObjectURL(){return 'blob:test';}static revokeObjectURL(){seen.revoked++;}}
 const anchor={click(){seen.clicks++;},remove(){}};
 const context={exports:{},URL:TestURL,window:{location:{origin:'https://app.example.test'},setTimeout:fn=>fn()},document:{createElement:()=>anchor,body:{appendChild(){}}},fetch:async(url,options)=>{seen.fetches++;seen.options=options;return {ok:status===200,status,blob:async()=>new Blob(['file-data'],{type:mime})};}};
 vm.runInNewContext(source,context);return {download:context.exports.downloadMedia,seen,anchor};
}
test('photo, video and audio downloads produce named files without forwarding credentials',async()=>{
 for(const [type,mime,extension] of [['photo','image/jpeg','jpg'],['video','video/mp4','mp4'],['voice_note','audio/mpeg','mp3']]){
  const f=fixture(mime);await f.download({id:'test-id',type,url:'https://res.cloudinary.com/test-cloud/image/upload/file'});
  assert.equal(f.anchor.download,`${type}-test-id.${extension}`);assert.equal(f.seen.clicks,1);assert.equal(f.seen.revoked,1);assert.equal(f.seen.options.credentials,'omit');assert.equal(f.seen.options.headers,undefined);
 }
});
test('missing media and unsupported addresses never initiate a download',async()=>{
 for(const url of ['', 'null','javascript:alert(1)','https://attacker.example/file','https://user:password@res.cloudinary.com/file']){
  const f=fixture();await assert.rejects(f.download({id:'x',type:'photo',url}));assert.equal(f.seen.fetches,0);assert.equal(f.seen.clicks,0);
 }
});
test('missing storage objects and HTML errors are not saved as media files',async()=>{
 for(const [mime,status] of [['image/jpeg',404],['text/html',200]]){
  const f=fixture(mime,status);await assert.rejects(f.download({id:'x',type:'photo',url:'https://res.cloudinary.com/test-cloud/file'}));assert.equal(f.seen.clicks,0);
 }
});
