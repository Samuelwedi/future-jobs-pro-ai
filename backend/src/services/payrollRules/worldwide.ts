import Big from 'big.js';
import {z} from 'zod';
import {createHash} from 'crypto';
import currencyUnits from './currency-units.json';
// ISO country/territory identifiers are selection metadata, not legal coverage claims.
const codes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const names=new Intl.DisplayNames(['en'],{type:'region'});
export const COUNTRIES=codes.map(code=>({code,name:names.of(code)||code})).sort((a,b)=>a.name.localeCompare(b.name));
export const CURRENCIES=Object.entries(currencyUnits.currencies).map(([code,decimals])=>({code,decimals})).sort((a,b)=>a.code.localeCompare(b.code));
const money=z.number().finite().min(0).max(1000000000),rate=z.number().finite().min(0).max(1);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Invalid calendar date');
const tiers=z.array(z.object({above:money,rate}).strict()).min(1).max(30).refine(a=>a[0].above===0&&a.every((v,i)=>!i||v.above>a[i-1].above),'Marginal brackets must start at zero and increase');
export const GlobalLineSchema=z.object({
 id:z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),label:z.string().trim().min(1).max(100),
 category:z.enum(['tax','employee_contribution','other_deduction','employer_contribution']),
 method:z.enum(['manual','fixed','percentage','progressive']),basis:z.enum(['gross','taxable']),
 period:z.enum(['pay_period','annualized']),amount:money,rate,exemption:money,credit:money,annualCap:money.nullable(),brackets:tiers
}).strict().superRefine((v,c)=>{if(v.method==='fixed'&&v.exemption!==0)c.addIssue({code:'custom',message:'Fixed lines do not use a basis exemption; set exemption to zero'});if(v.method==='manual'&&(v.annualCap!==null||v.credit!==0||v.exemption!==0))c.addIssue({code:'custom',message:'Manual amounts must be final reviewed amounts: no automatic cap, credit or exemption'});});
export const GlobalRulesSchema=z.object({
 engine:z.literal('company_rules_v1'),country:z.string().refine(c=>codes.includes(c),'Select a country or territory'),subdivision:z.string().trim().min(1).max(80),currency:z.string().refine(c=>CURRENCIES.some(x=>x.code===c),'Select a supported currency'),effectiveFrom:date,effectiveTo:date,
 policy:z.object({periodsPerYear:z.number().int().min(1).max(366),overtimeMultiplier:z.number().min(1).max(5),vacationAccrualRate:rate}).strict(),
 review:z.object({reviewer:z.string().trim().min(2).max(100),reference:z.string().trim().min(8).max(1000),reviewedOn:date,confirmed:z.literal(true)}).strict(),
 lines:z.array(GlobalLineSchema).min(1).max(40)
}).strict().superRefine((v,c)=>{if(v.effectiveFrom>v.effectiveTo)c.addIssue({code:'custom',message:'Effective dates are reversed'});if(new Set(v.lines.map(x=>x.id)).size!==v.lines.length)c.addIssue({code:'custom',message:'Line identifiers must be unique'});if(!v.lines.some(x=>x.category==='tax'))c.addIssue({code:'custom',message:'Include a tax line, even if your reviewed tax amount is zero'});});
export type GlobalRules=z.infer<typeof GlobalRulesSchema>;
export const globalTemplate=()=>({engine:'company_rules_v1',country:'',subdivision:'',currency:'',effectiveFrom:'2026-01-01',effectiveTo:'2026-12-31',policy:{periodsPerYear:12,overtimeMultiplier:1.5,vacationAccrualRate:0},review:{reviewer:'',reference:'',reviewedOn:new Date().toISOString().slice(0,10),confirmed:false},lines:[{id:'income_tax',label:'Income tax — enter independently reviewed amount',category:'tax',method:'manual',basis:'taxable',period:'pay_period',amount:0,rate:0,exemption:0,credit:0,annualCap:null,brackets:[{above:0,rate:0}]}]});
const InputSchema=z.object({payDate:date,gross:money,taxable:money,manualAmounts:z.record(z.string(),money),ytd:z.record(z.string(),money),reviewReference:z.string().trim().min(8).max(1000),companyRulesConfirmed:z.literal(true)}).strict();
const b=(v:Big.BigSource)=>new Big(v),pos=(v:Big)=>v.lt(0)?b(0):v,min=(v:Big,w:Big)=>v.lt(w)?v:w;
export function previewWorldwide(rawRules:unknown,rawInput:unknown){
 const rules=GlobalRulesSchema.parse(rawRules),i=InputSchema.parse(rawInput),decimals=CURRENCIES.find(x=>x.code===rules.currency)!.decimals;
 if(i.payDate<rules.effectiveFrom||i.payDate>rules.effectiveTo)throw new Error('Pay date is outside this rule version');
 const round=(v:Big)=>v.round(decimals,Big.roundHalfUp),out=(v:Big)=>round(v).toFixed(decimals);
 const exact=(v:number)=>b(v).eq(round(b(v)));if(!exact(i.gross)||!exact(i.taxable))throw new Error('Gross and taxable pay must use the currency minor units');
 const manualIds=rules.lines.filter(l=>l.method==='manual').map(l=>l.id),capIds=rules.lines.filter(l=>l.annualCap!==null).map(l=>l.id);
 for(const [record,ids] of [[i.manualAmounts,manualIds],[i.ytd,capIds]] as const){if(Object.keys(record).some(k=>!ids.includes(k))||ids.some(k=>!Object.prototype.hasOwnProperty.call(record,k)))throw new Error('Provide exactly the required manual amounts and capped-line YTD totals');for(const v of Object.values(record))if(!exact(v))throw new Error('Amounts must use the currency minor units');}
 let tax=b(0),employee=b(0),other=b(0),employer=b(0);
 const lines=rules.lines.map(line=>{
  const factor=line.period==='annualized'?rules.policy.periodsPerYear:1;
  const basis=pos(b(line.basis==='gross'?i.gross:i.taxable).times(factor).minus(line.exemption));
  let value=b(0);
  if(line.method==='manual')value=b(i.manualAmounts[line.id]);
  else if(line.method==='fixed')value=b(line.amount).div(factor);
  else if(line.method==='percentage')value=basis.times(line.rate).div(factor);
  else {for(let n=0;n<line.brackets.length;n++){const current=line.brackets[n],next=line.brackets[n+1];const width=pos((next?min(basis,b(next.above)):basis).minus(current.above));value=value.plus(width.times(current.rate));}value=value.div(factor);}
  value=pos(value.minus(line.credit));
  if(line.annualCap!==null){if(!exact(line.annualCap)||i.ytd[line.id]>line.annualCap)throw new Error('Invalid cap or YTD total for '+line.label);value=min(value,b(line.annualCap).minus(i.ytd[line.id]));}
  value=round(value);
  if(line.category==='tax')tax=tax.plus(value);else if(line.category==='employee_contribution')employee=employee.plus(value);else if(line.category==='other_deduction')other=other.plus(value);else employer=employer.plus(value);
  return {id:line.id,label:line.label,category:line.category,method:line.method,amount:out(value)};
 });
 const deductions=tax.plus(employee).plus(other),net=b(i.gross).minus(deductions);if(net.lt(0))throw new Error('Employee deductions exceed gross pay');
 return {engine:'company_rules_v1',classification:'custom_rules_review_required',verified:false,moneyMovement:false,country:rules.country,subdivision:rules.subdivision,currency:rules.currency,decimals,payDate:i.payDate,rulesHash:createHash('sha256').update(JSON.stringify(rules)).digest('hex'),gross:out(b(i.gross)),taxable:out(b(i.taxable)),incomeTax:out(tax),employeeContributions:out(employee),otherDeductions:out(other),totalDeductions:out(deductions),employerContributions:out(employer),employerCost:out(b(i.gross).plus(employer)),net:out(net),lines,
 // Legacy fields are zero: global contributions must not be relabeled as Canadian CPP or EI.
 cpp:out(b(0)),cpp2:out(b(0)),ei:out(b(0)),employerCpp:out(b(0)),employerEi:out(b(0)),vacationAccrualEstimate:out(b(i.gross).times(rules.policy.vacationAccrualRate)),
 scope:'Company-configured calculation or independently entered amounts. No country tax engine, cumulative assessment, filing, remittance, FX conversion or legal certification is supplied. Employer must validate the complete local payroll treatment and rounding. Taxable basis and YTD totals are independently supplied.',sources:[currencyUnits.source],currencyMetadataPublished:currencyUnits.publication.Pblshd};
}
