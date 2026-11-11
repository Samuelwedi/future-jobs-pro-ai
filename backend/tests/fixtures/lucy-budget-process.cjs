// Invoked only by the disposable local PostgreSQL integration fixture.
const url=new URL(process.env.LUCY_BUDGET_TEST_DATABASE_URL||'invalid:');
if(url.protocol!=='postgres:'||url.hostname!=='127.0.0.1'||url.pathname!=='/lucy_budget_fixture')throw Error('Dedicated local budget fixture required');
process.env.DATABASE_URL=url.toString();process.env.DB_SSL='false';process.env.NODE_ENV='test';
const {pool}=require('../../dist/config/database');const budget=require('../../dist/services/lucyBackgroundBudget');
process.send?.({ready:true});
process.once('message',async()=>{
 try{const id=await budget.reserveLucyBudget(budget.readLucyBudgetGrant(),20000);process.send?.({reserved:true,id});}
 catch{process.send?.({reserved:false});}
 finally{await pool.end();process.disconnect();}
});
