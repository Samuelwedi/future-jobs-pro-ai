// New catalog keys never relabel existing paid subscriptions.
export type BillingPlan = {name:string;envName:string;features:string[];employees:number;monthlyAI:number;documentBytes:number;cadCents:number;sale:boolean};
const sizes = [10,35,50,65,80,95,110];
const amounts = [7900,19900,29900,39900,49900,59900,69900];
export const BILLING_PLANS: Record<string,BillingPlan> = Object.fromEntries(sizes.map((employees,i)=>[
 `team_${employees}`, {name:`Team ${employees}`,envName:`STRIPE_PRICE_TEAM_${employees}_MONTHLY`,
 employees,monthlyAI:employees*10,documentBytes:employees*100*1024*1024,cadCents:amounts[i],sale:true,
 features:[`Up to ${employees} active accounts (owners and workers)`, 'Time tracking, GPS and Worker Tools',
  'Scheduling, expenses and reports',`${employees*10} operations AI requests/month`,
  `${employees*100} MB knowledge document allowance`, 'Larger teams: contact sales']} ]));
for (const [key,envName,employees] of [['basic','STRIPE_PRICE_BASIC_MONTHLY',5],['professional','STRIPE_PRICE_PRO_MONTHLY',20],['enterprise','STRIPE_PRICE_ENTERPRISE_MONTHLY',0]] as const) {
 BILLING_PLANS[key]={name:`Legacy ${key}`,envName,employees,monthlyAI:0,documentBytes:0,cadCents:0,sale:false,features:['Existing subscriptions only']};
}
export const STORE_PLANS = new Map(Object.keys(BILLING_PLANS).map(key=>[`com.samuel33.futurejobspro.${key}_monthly`,key]));
export async function applyPlanAllowance(db:any,companyId:string,key:string) {
 const plan=BILLING_PLANS[key];
 if (!plan?.sale) return; // Keep operator-managed legacy allowances intact.
 await db.query(`INSERT INTO ops_limits(company_id,employees,monthly_ai_requests,document_bytes) VALUES($1,$2,$3,$4)
  ON CONFLICT(company_id) DO UPDATE SET employees=EXCLUDED.employees,monthly_ai_requests=EXCLUDED.monthly_ai_requests,document_bytes=EXCLUDED.document_bytes`,
  [companyId,plan.employees,plan.monthlyAI,plan.documentBytes]);
}
