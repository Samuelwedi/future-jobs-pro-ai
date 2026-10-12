import { pool } from '../config/database';

// The same history used by payroll; never copy pay rates into a second user field.
export async function employeeCompensation(userId:string) {
 const result=await pool.query(`SELECT ch.hourly_rate,ch.effective_date,
    ch.effective_date <= (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(to_jsonb(c)->>'timezone',''),'UTC'))::date AS is_current
   FROM compensation_history ch JOIN users u ON u.id=ch.user_id JOIN companies c ON c.id=u.company_id
   WHERE ch.user_id=$1 ORDER BY ch.effective_date DESC,ch.created_at DESC`,[userId]);
 const current=result.rows.find(r=>r.is_current);
 const upcoming=result.rows.filter(r=>!r.is_current).reverse();
 return {current_rate:current?Number(current.hourly_rate):null,rate_effective_date:current?.effective_date||null,
   scheduled_rates:upcoming.map(r=>({hourly_rate:Number(r.hourly_rate),effective_date:r.effective_date}))};
}
