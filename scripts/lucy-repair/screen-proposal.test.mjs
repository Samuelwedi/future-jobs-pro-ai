import test from 'node:test';
import assert from 'node:assert/strict';
import { screenProposal } from './screen-proposal.mjs';
const secret='synthetic-credential-for-regression-only';
const patch=content=>JSON.stringify({files:[{path:'webdash/src/App.css',content}]});
test('file handoff preserves large valid proposal exactly',()=>{
 const content='/* ordinary CSS comment */\n'.repeat(3000);
 assert.equal(screenProposal(patch(content),'support-portal',[secret]).files[0].content,content);
});
test('credentials, encoded credentials and masked proposals never transfer',()=>{
 for(const value of [secret,Buffer.from(secret).toString('base64'),Buffer.from(secret).toString('hex'),'***','github_pat_'+'a'.repeat(30),'sk-proj-'+'b'.repeat(30)]){
  assert.throws(()=>screenProposal(patch(value),'support-portal',[secret]),/Proposal rejected/);
 }
 assert.throws(()=>screenProposal(patch('body {}'),'support-portal',[]),/not configured/);
});
test('malformed and out-of-scope proposal rejected before upload',()=>{
 assert.throws(()=>screenProposal('', 'support-portal',[secret]));
 assert.throws(()=>screenProposal(patch('body {}'),'mobile-audio',[secret]));
});
