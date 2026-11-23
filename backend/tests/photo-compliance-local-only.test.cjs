'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const sharp = require('sharp');
const crypto = require('node:crypto');

function loadLocalService() {
  const filename = path.join(__dirname,'../src/services/photoComplianceService.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  const dependencies = { sharp, fs, path, crypto };
  const imports = [];
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  vm.runInNewContext(outputText, {
    module, exports: module.exports,
    process: { get env() { assert.fail('Photo analysis must ignore service environment, including model and provider settings'); } },
    fetch() { assert.fail('Photo analysis must perform no network request'); },
    require(name) {
      imports.push(name);
      assert(Object.hasOwn(dependencies,name),'Unexpected photo compliance import: ' + name);
      return dependencies[name];
    },
  });
  assert.deepEqual(imports, ['sharp','fs','path','crypto']);
  return module.exports;
}

test('actual local still-photo scoring retains field contract and never loads a provider', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'fj-photo-local-only-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  const { analyzePhotoCompliance } = loadLocalService();
  const photo = path.join(directory,'bright-textured.png');
  const width = 1280, height = 720;
  const pixels = Buffer.from(Array.from({length: width * height}, (_,i) => i % 2 ? 192 : 64));
  await sharp(pixels,{raw:{width,height,channels:1}}).png().toFile(photo);
  const result = await analyzePhotoCompliance(photo);
  assert.equal(result.passed,true);
  assert.equal(result.score,100);
  assert.equal(result.issues.length,0);
  assert.equal(result.metadata.width,width);
  assert.equal(result.metadata.height,height);
  assert.equal(result.metadata.format,'png');
  assert.equal(result.aiAnalyzed,false);
  assert.equal(result.aiModel,null);
  assert.equal(result.aiDescription,null);
  assert.equal(result.aiTags.length,0);
  const expectedHash = crypto.createHash('sha256').update(fs.readFileSync(photo))
    .update(JSON.stringify(result.metadata)).digest('hex');
  assert.equal(result.verificationHash, expectedHash);
});

test('actual local still-photo scoring detects low resolution, limited quality and darkness', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'fj-photo-local-poor-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  const { analyzePhotoCompliance } = loadLocalService();
  const photo = path.join(directory,'dark.png');
  await sharp({create:{width:32,height:16,channels:3,background:'#111111'}}).png().toFile(photo);
  const result = await analyzePhotoCompliance(photo);
  assert.equal(result.passed,false);
  assert.equal(result.score,35);
  for (const label of ['Low resolution','Limited image detail','Image is too dark']) {
    assert(result.issues.some(issue => issue.startsWith(label)),label);
  }
  assert.equal(result.suggestions.length,3);
  assert.equal(result.aiAnalyzed,false);
});
