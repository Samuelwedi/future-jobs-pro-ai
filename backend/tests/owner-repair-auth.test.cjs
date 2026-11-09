const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(decoded, role='owner') {
 const module={exports:{}},queries=[],router={get(){},post(){},patch(){}};
 vm.runInNewContext(fs.readFileSync('dist/routes/supportAgentRoutes.js','utf8'),{
  module,exports:module.exports,process:{env:{SUPPORT_AGENT_JWT_SECRET:'sealed-test-secret'}},
  require(name){
   if(name==='express')return {Router:()=>router};
   if(name==='bcryptjs')return {};
   if(name==='jsonwebtoken')return {verify:()=>decoded};
   if(name.endsWith('/supportMedia'))return {mountSupportMedia(){}};
   if(name.endsWith('/database'))return {pool:{query:async(sql,args)=>{queries.push({sql,args});return {rowCount:role?1:0,rows:role?[{id:'platform-agent',role}]:[]};}}};
   throw Error(name);
  }
 });
 return {queries,async authenticate(){let status=200,allowed=false;const req={headers:{authorization:'Bearer sealed-test-token'}};await module.exports.authenticateAgent(req,{status(code){status=code;return this;},json(){}},()=>allowed=true);return {status,allowed,req};}};
}
test('customer tenant owners and public-demo credentials cannot become platform repair owners',async()=>{
 for(const claims of [{id:'customer',role:'owner',company_id:'tenant'},{tokenType:'customer',role:'owner'},{tokenType:'demo',agentId:'platform-agent',role:'owner'}]){
  const h=harness(claims),result=await h.authenticate();assert.equal(result.status,401);assert.equal(result.allowed,false);assert.equal(h.queries.length,0);
 }
});
test('platform role is loaded from the active account, never from a claimed owner role',async()=>{
 const h=harness({tokenType:'platform_support_agent',agentId:'platform-agent',role:'owner'},'agent');
 const result=await h.authenticate();assert.equal(result.allowed,true);assert.equal(result.req.supportAgent.role,'agent');assert.match(h.queries[0].sql,/is_active = TRUE/);
 const disabled=await harness({tokenType:'platform_support_agent',agentId:'platform-agent'},null).authenticate();assert.equal(disabled.status,401);
});
