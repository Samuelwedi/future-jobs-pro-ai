const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeIncidentContext}=require('../dist/services/incidentContext');
test('IT evidence allows bounded technical context and drops arbitrary sensitive fields',()=>{
 const result=sanitizeIncidentContext({platform:'android',buildVersion:'9',token:'secret',email:'user@example.com',errorStack:'at x Bearer secret-token sk-proj-secret user@example.com',componentStack:'x'.repeat(5000)});
 assert.equal(result.platform,'android');assert.equal(result.buildVersion,'9');
 assert.equal(result.token,undefined);assert.equal(result.email,undefined);
 assert.equal(result.componentStack.length,4000);
 assert.equal(result.errorStack.includes('secret'),false);assert.equal(result.errorStack.includes('@'),false);
});
test('invalid payloads do not reach model evidence',()=>{
 for(const v of [null,42,[], 'stack']) assert.deepEqual(sanitizeIncidentContext(v),{});
 assert.deepEqual(sanitizeIncidentContext({platform:{token:'secret'}}),{});
});
