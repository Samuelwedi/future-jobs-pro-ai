const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),sharp=require('sharp');
const ex={};
new Function('exports','require',ts.transpileModule(fs.readFileSync(require.resolve('../src/services/shiftAttachmentPreviewImage.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText)(ex,require);
const render=(b,t,n=b.length)=>ex.renderShiftPreviewImage(b,t,n);
const canvas=(w,h)=>sharp({create:{width:w,height:h,channels:4,background:{r:225,g:15,b:40,alpha:0}}});

test('transparent PNG makes a bounded private JPEG with a white background',async()=>{
  const orig=await canvas(1350,675).png().toBuffer();
  const out=await render(orig,'image/png');
  assert.ok(out);
  const {data,info}=await sharp(out).raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height,info.channels],[1024,512,3]);
  assert.deepEqual([...data.subarray(0,3)],[255,255,255]);
  assert.equal((await sharp(orig).metadata()).format,'png');
});
test('camera orientation is applied before stripping metadata',async()=>{
  const orig=await canvas(120,60).jpeg().withMetadata({orientation:6}).toBuffer();
  const before=await sharp(orig).metadata();
  assert.ok(before.exif);assert.equal(before.orientation,6);
  const out=await render(orig,'image/jpeg');
  assert.ok(out);
  const after=await sharp(out).metadata();
  assert.equal(after.format,'jpeg');assert.equal(after.width,60);assert.equal(after.height,120);
  assert.equal(after.exif,undefined);assert.equal(after.icc,undefined);assert.equal(after.orientation,undefined);
});
test('does not render unsupported, type-mismatched or truncated bytes',async()=>{
  const png=await canvas(32,16).png().toBuffer(), jpeg=await canvas(32,16).jpeg().toBuffer();
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  for(const [data,type] of [[png,'image/jpeg'],[jpeg,'image/png'],[png,'image/webp'],[svg,'image/png'],[jpeg.subarray(0,jpeg.length-12),'image/jpeg'],[png.subarray(0,40),'image/png']]){
    assert.equal(await render(data,type),null);
  }
});
test('exact recorded source length and byte size are mandatory',async()=>{
  const png=await canvas(12,12).png().toBuffer();
  for(const length of [0,png.length+1,png.length-1,NaN,Infinity,png.length+.5]){
    assert.equal(await render(png,'image/png',length),null);
  }
  assert.equal(await render(Buffer.alloc(5*1024*1024+1),'image/png'),null);
  assert.equal(await render(new Uint8Array(png),'image/png'),null);
});
test('small compressed bytes cannot create an over-budget pixel source',async()=>{
  const big=await canvas(5120,4000).png().toBuffer();
  assert.ok(big.length<5*1024*1024);
  assert.equal(await render(big,'image/png'),null);
});
