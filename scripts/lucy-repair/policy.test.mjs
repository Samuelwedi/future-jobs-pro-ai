import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePatch } from './policy.mjs';
const patch = path => JSON.stringify({files:[{path,content:'export const fixed = true;'}]});
test('only approved repair paths are accepted',()=>{
 assert.equal(validatePatch(patch('mobile/src/services/RecorderSession.ts'),'mobile-audio').files.length,1);
 for(const name of ['.github/workflows/lucy-repair.yml','backend/src/utils/auth.ts','mobile/package.json','../secrets','.env','webdash/src/App.js']) assert.throws(()=>validatePatch(patch(name),'support-portal'));
});
test('malformed, repeated and oversized changes fail closed',()=>{
 assert.throws(()=>validatePatch('invalid','mobile-audio'));
 assert.throws(()=>validatePatch('{"files":[]}','mobile-audio'));
 assert.throws(()=>validatePatch(patch('mobile/src/services/RecorderSession.ts'),'unknown'));
 const file={path:'webdash/src/App.css',content:'x'};
 assert.throws(()=>validatePatch(JSON.stringify({files:[file,file]}),'support-portal'));
 assert.throws(()=>validatePatch(JSON.stringify({files:[{...file,content:'x'.repeat(100001)}]}),'support-portal'));
});
