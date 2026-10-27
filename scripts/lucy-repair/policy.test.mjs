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
test('all application areas can prepare bounded source repairs',async()=>{
 const {requiresReview,regressionPaths}=await import('./policy.mjs');
 const expanded=(file,scope)=>JSON.stringify({files:[{path:file,content:'export const fixed=true;'},{path:regressionPaths[scope],content:'// regression test'}]});
 for(const [scope,file] of [['backend','backend/src/services/payrollService.ts'],['customer-web','web/src/pages/Schedule.tsx'],['mobile','mobile/src/screens/ChatScreen.tsx'],['portal-app','webdash/src/App.js'],['application','backend/src/services/quickbookService.ts']]) assert.equal(validatePatch(expanded(file,scope),scope).files[0].path,file);
 assert.equal(requiresReview(validatePatch(expanded('backend/src/controllers/chatController.ts','backend'),'backend'),'backend'),true);
 assert.equal(requiresReview(validatePatch(expanded('web/src/pages/Payroll.tsx','customer-web'),'customer-web'),'customer-web'),true);
 assert.equal(requiresReview(validatePatch(expanded('web/src/components/Calendar.css','customer-web'),'customer-web'),'customer-web'),true);
 for(const file of ['web/src/../secrets.ts','web/src/.env.ts','backend/src/services/ownerRepairService.ts','backend/src/routes/supportAgentRoutes.ts','web/src/a.test.ts','mobile/package.json','.github/workflows/lucy-repair.yml'])assert.throws(()=>validatePatch(patch(file),'application'));
});
test('portal styles keep the bounded publisher while application entry points need review', async()=>{
 const {requiresReview}=await import('./policy.mjs');
 assert.equal(requiresReview({files:[{path:'webdash/src/App.css',content:'body {}'}]},'support-portal'),false);
 for(const extension of ['js','jsx','ts','tsx']) {
  assert.equal(requiresReview({files:[{path:`webdash/src/App.${extension}`,content:'export default App;'}]},'portal-app'),true);
 }
});
