const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/uploadMetadata.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { uploadMetadata } = context.exports;
test('camera upload preserves MOV, MP4 and HEIC types instead of renaming capture bytes', () => {
  assert.equal(uploadMetadata('file:///capture.MOV', 'file').type, 'video/quicktime');
  assert.equal(uploadMetadata('file:///capture.mp4', 'file').type, 'video/mp4');
  assert.equal(uploadMetadata('file:///capture.heic', 'file').type, 'image/heic');
  assert.equal(uploadMetadata('content://camera/123', 'file', {name: 'capture.mov', mimeType: 'video/quicktime'}).type, 'video/quicktime');
});
test('capture passes metadata through and does not describe a queued upload as failure', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/screens/CameraView.tsx'), 'utf8');
  assert.match(source, /'file', false, capture.fileInfo/);
  assert.doesNotMatch(source, /name: isVideo \? 'evidence.mp4'/);
  assert.match(source, /queued \? 'Upload queued' : unresolved \? 'Check upload status' : 'Upload Failed'/);
});
