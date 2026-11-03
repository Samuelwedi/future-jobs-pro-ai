import Big from 'big.js';
import {createHash} from 'crypto';
import {pool} from '../config/database';
import {validDate} from './payPeriodCalendar';
const digest=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
class CompensationError extends Error{constructor(message:string,public status=400){super(message);}}
const check=(value:any,message:string,status=400)=>{if(!value)throw new CompensationError(message,status);};
function intent(body:any){
 check(Array.isArray(body.employeeIds)&&body.employeeIds.length>0&&body.employeeIds.length<=500,'Select 1 to 500 employees.');
 const ids=[...new Set<string>(body.employeeIds)].sort();check(ids.every(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),'Invalid employee.');
 check(['percentage','fixed'].includes(body.raiseType),'Invalid raise type.');const value=String(body.raiseValue);check(/^\d+(\.\d{1,2})?$/.test(value)&&Number(value)>0&&Number(value)<=10000,'Enter a positive raise up to 10000 with at most two decimals.');check(validDate(body.effectiveDate),'Use a valid effective date.');
 return{employeeIds:ids,raiseType:body.raiseType,raiseValue:new Big(value).toFixed(2),effectiveDate:body.effectiveDate};
}
async function preview(c:any,company:string,input:ReturnType<typeof intent>){
 const staff=await c.query('SELECT id,first_name,last_name FROM users WHERE company_id=$1 AND id=ANY($2::uuid[]) AND COALESCE(is_active,TRUE)=TRUE ORDER BY id',[company,input.employeeIds]);check(staff.rowCount===input.employeeIds.length,'Employee is inactive or outside your company.',403);const rows=[];
 for(const person of staff.rows){const r=await c.query('SELECT hourly_rate FROM compensation_history WHERE user_id=$1 AND effective_date<=$2 ORDER BY effective_date DESC,created_at DESC LIMIT 1',[person.id,input.effectiveDate]);check(r.rowCount,'Set an initial wage before applying raises.');const current=new Big(r.rows[0].hourly_rate),next=(input.raiseType==='fixed'?current.plus(input.raiseValue):current.times(new Big(input.raiseValue).div(100).plus(1))).round(2,1);check(next.gt(0)&&next.lte(10000),'Resulting wage must be between 0 and 10000.');rows.push({id:person.id,name:`${person.first_name||''} ${person.last_name||''}`.trim(),current:current.toFixed(2),next:next.toFixed(2),effectiveDate:input.effectiveDate});}
 return{success:true,rows,fingerprint:digest({company,input,rows})};
}
export async function previewBulkCompensation(company:string,body:any){return preview(pool,company,intent(body));}
export async function applyBulkCompensation(company:string,actor:string,body:any){
 const input=intent(body);check(body.confirmed===true&&typeof body.requestKey==='string'&&/^[\w-]{8,150}$/.test(body.requestKey),'Confirm the preview and provide a request key.');const hash=digest(input),c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[company]);const saved=await c.query('SELECT payload_hash,result FROM compensation_bulk_requests WHERE company_id=$1 AND request_key=$2',[company,body.requestKey]);if(saved.rowCount){check(saved.rows[0].payload_hash===hash,'Request key belongs to another raise.',409);await c.query('COMMIT');return saved.rows[0].result;}
 const result=await preview(c,company,input);check(result.fingerprint===body.fingerprint,'Rates changed. Preview the current selection again.',409);for(const row of result.rows)await c.query('INSERT INTO compensation_history(user_id,hourly_rate,effective_date,created_by) VALUES($1,$2,$3,$4)',[row.id,row.next,input.effectiveDate,actor]);const response={...result,updatedCount:result.rows.length,message:`Compensation updated for ${result.rows.length} employees`};await c.query('INSERT INTO compensation_bulk_requests(company_id,request_key,payload_hash,result,created_by) VALUES($1,$2,$3,$4,$5)',[company,body.requestKey,hash,JSON.stringify(response),actor]);await c.query('COMMIT');return response;
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
