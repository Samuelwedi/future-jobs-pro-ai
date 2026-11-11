const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {Writable}=require('node:stream');const {v2:cloudinary}=require('cloudinary');const {uploadEvidenceFile}=require('../dist/services/evidenceUpload');
test('videos use bounded chunked streaming and propagate provider or read failures',async()=>{
 const saved=cloudinary.uploader.upload_chunked_stream;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-stream-'));const file=path.join(dir,'clip.mov');fs.writeFileSync(file,Buffer.alloc(200000));let options,bytes=0;
 try {
 cloudinary.uploader.upload_chunked_stream=(opts,callback)=>{options=opts;return new Writable({write(chunk,encoding,done){bytes+=chunk.length;done();},final(done){callback(null,{secure_url:'https://example.test/video'});done();}});};
 assert.equal((await uploadEvidenceFile(file,'fixture',true)).secure_url,'https://example.test/video');assert.equal(bytes,200000);assert.equal(options.chunk_size,6*1024*1024);assert.equal(options.resource_type,'video');assert.equal(options.timeout,120000);
 await assert.rejects(()=>uploadEvidenceFile(path.join(dir,'missing'),'fixture',true),/ENOENT/);
 cloudinary.uploader.upload_chunked_stream=(opts,callback)=>new Writable({write(c,e,d){callback(Error('provider failed'));d();}});await assert.rejects(()=>uploadEvidenceFile(file,'fixture',true),/provider failed/);
 cloudinary.uploader.upload_chunked_stream=()=>{throw Error('configuration failure');};await assert.rejects(()=>uploadEvidenceFile(file,'fixture',true),/configuration failure/);
 }finally{cloudinary.uploader.upload_chunked_stream=saved;fs.rmSync(dir,{recursive:true,force:true});}
});
