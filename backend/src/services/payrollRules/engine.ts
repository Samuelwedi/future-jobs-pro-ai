import Big from 'big.js';
import { z } from 'zod';
import { createHash } from 'crypto';
import {GlobalRulesSchema,previewWorldwide} from './worldwide';
const amount=z.number().finite().min(0).max(10000000);
const rate=z.number().finite().min(0).max(1);
const bracket=z.object({floor:amount,rate,constant:amount}).strict();
const brackets=z.array(bracket).min(1).max(20).refine(a=>a[0].floor===0&&a.every((v,i)=>i===0||v.floor>a[i-1].floor),'Brackets must start at zero and increase');
export const AlbertaRulesSchema=z.object({
 country:z.string().regex(/^[A-Z]{2}$/),subdivision:z.string().min(1).max(20),currency:z.string().regex(/^[A-Z]{3}$/),
 effectiveFrom:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),effectiveTo:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 policy:z.object({periodsPerYear:z.union([z.literal(12),z.literal(24),z.literal(26),z.literal(27),z.literal(52),z.literal(53)]),overtimeMultiplier:z.number().min(1).max(5),vacationAccrualRate:rate}).strict(),
 statutory:z.object({cppRate:rate,cppBaseRate:rate,cppMaximum:amount,cppBaseMaximum:amount,cppExemption:amount,cppYmpe:amount,cpp2Rate:rate,cpp2Maximum:amount,eiRate:rate,eiMaximum:amount,eiEmployerMultiplier:z.number().min(1).max(3),federalBasicMaximum:amount,federalBasicMinimum:amount,federalBasicReductionStart:amount,federalBasicReductionEnd:amount,albertaBasic:amount,employmentAmount:amount,albertaSupplementThreshold:amount,albertaSupplementRate:rate,federalBrackets:brackets,provincialBrackets:brackets}).strict()
}).strict().superRefine((v,c)=>{
 const valid=(d:string)=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 if(!valid(v.effectiveFrom)||!valid(v.effectiveTo)||v.effectiveTo<v.effectiveFrom)c.addIssue({code:'custom',message:'Enter a valid effective date range'});
 if(v.statutory.cppRate<=0||v.statutory.cppBaseRate>v.statutory.cppRate||v.statutory.federalBasicReductionEnd<=v.statutory.federalBasicReductionStart||v.statutory.federalBasicMinimum>v.statutory.federalBasicMaximum)c.addIssue({code:'custom',message:'Invalid statutory rate or threshold relationship'});
});
export const RulesSchema=z.union([AlbertaRulesSchema,GlobalRulesSchema]);
export type PayrollRules=z.infer<typeof AlbertaRulesSchema>;
export const ALBERTA_2026:PayrollRules={country:'CA',subdivision:'AB',currency:'CAD',effectiveFrom:'2026-01-01',effectiveTo:'2026-12-31',policy:{periodsPerYear:26,overtimeMultiplier:1.5,vacationAccrualRate:.04},statutory:{cppRate:.0595,cppBaseRate:.0495,cppMaximum:4230.45,cppBaseMaximum:3519.45,cppExemption:3500,cppYmpe:74600,cpp2Rate:.04,cpp2Maximum:416,eiRate:.0163,eiMaximum:1123.07,eiEmployerMultiplier:1.4,federalBasicMaximum:16452,federalBasicMinimum:14829,federalBasicReductionStart:181440,federalBasicReductionEnd:258482,albertaBasic:22769,employmentAmount:1501,albertaSupplementThreshold:4896,albertaSupplementRate:.25,
 federalBrackets:[{floor:0,rate:.14,constant:0},{floor:58523,rate:.205,constant:3804},{floor:117045,rate:.26,constant:10241},{floor:181440,rate:.29,constant:15685},{floor:258482,rate:.33,constant:26024}],
 provincialBrackets:[{floor:0,rate:.08,constant:0},{floor:61200,rate:.10,constant:1224},{floor:154259,rate:.12,constant:4309},{floor:185111,rate:.13,constant:6160},{floor:246813,rate:.14,constant:8628},{floor:370220,rate:.15,constant:12331}]}};
export const SOURCES=[
'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html',
'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html'];
export const rulesHash=(rules:unknown)=>createHash('sha256').update(JSON.stringify(RulesSchema.parse(rules))).digest('hex');
export function classification(rules:any){if(rules.engine==='company_rules_v1')return 'custom_rules_review_required';return rules.country==='CA'&&rules.subdivision==='AB'&&rules.currency==='CAD'&&JSON.stringify(rules.statutory)===JSON.stringify(ALBERTA_2026.statutory)&&rules.effectiveFrom>=ALBERTA_2026.effectiveFrom&&rules.effectiveTo<=ALBERTA_2026.effectiveTo?'reference_rules_review_required':'custom_rules_review_required';}
export const PreviewSchema=z.object({payDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),gross:amount,cppYtd:amount,cpp2Ytd:amount,eiYtd:amount,pensionableYtd:amount,federalClaim:amount.optional(),provincialClaim:amount.optional(),additionalTax:amount.default(0),standardCaseConfirmed:z.literal(true)}).strict();
const b=(x:Big.BigSource)=>new Big(x),max=(x:Big,y:Big)=>x.gt(y)?x:y,min=(x:Big,y:Big)=>x.lt(y)?x:y,pos=(x:Big)=>max(x,b(0));
const cents=(x:Big)=>x.round(2,Big.roundHalfUp),out=(x:Big)=>cents(x).toFixed(2);
export function previewPayroll(rawRules:unknown,rawInput:unknown){
 if((rawRules as any)?.engine==='company_rules_v1')return previewWorldwide(rawRules,rawInput);
 const rules=AlbertaRulesSchema.parse(rawRules),i=PreviewSchema.parse(rawInput),s=rules.statutory,P=rules.policy.periodsPerYear;
 if(rules.country!=='CA'||rules.subdivision!=='AB'||rules.currency!=='CAD')throw new Error('No calculation engine is implemented for this jurisdiction. Do not reuse Alberta formulas elsewhere.');
 if(i.payDate<rules.effectiveFrom||i.payDate>rules.effectiveTo||!Number.isFinite(Date.parse(i.payDate))||new Date(i.payDate).toISOString().slice(0,10)!==i.payDate)throw new Error('Pay date is outside this rule version');
 if(!i.payDate.startsWith('2026-'))throw new Error('The implemented engine supports 2026 only');
 if(i.cppYtd>s.cppMaximum||i.cpp2Ytd>s.cpp2Maximum||i.eiYtd>s.eiMaximum)throw new Error('YTD contributions exceed this rule version; review payroll history');
 const gross=b(i.gross),exemption=b(s.cppExemption).div(P).round(2,Big.roundDown);
 const cpp=cents(pos(min(b(s.cppMaximum).minus(i.cppYtd),gross.minus(exemption).times(s.cppRate))));
 const cpp2=cents(pos(min(b(s.cpp2Maximum).minus(i.cpp2Ytd),b(i.pensionableYtd).plus(gross).minus(max(b(i.pensionableYtd),b(s.cppYmpe))).times(s.cpp2Rate))));
 const ei=cents(pos(min(b(s.eiMaximum).minus(i.eiYtd),gross.times(s.eiRate))));
 const enhanced=cpp.times(b(s.cppRate).minus(s.cppBaseRate).div(s.cppRate)).plus(cpp2);
 const annual=pos(gross.minus(enhanced).times(P));
 const baseClaim=annual.lte(s.federalBasicReductionStart)?b(s.federalBasicMaximum):annual.gte(s.federalBasicReductionEnd)?b(s.federalBasicMinimum):cents(b(s.federalBasicMaximum).minus(annual.minus(s.federalBasicReductionStart).times(b(s.federalBasicMaximum).minus(s.federalBasicMinimum).div(b(s.federalBasicReductionEnd).minus(s.federalBasicReductionStart)))));
 // CRA recommends the annual maximum in and after the period where the cap is reached.
 const baseCppCredit=cpp.plus(i.cppYtd).gte(s.cppMaximum)?b(s.cppBaseMaximum):min(b(s.cppBaseMaximum),max(cpp.times(P),b(i.cppYtd)).times(b(s.cppBaseRate).div(s.cppRate)));
 const eiCredit=ei.plus(i.eiYtd).gte(s.eiMaximum)?b(s.eiMaximum):min(b(s.eiMaximum),max(ei.times(P),b(i.eiYtd)));
 const creditBase=baseCppCredit.plus(eiCredit);
 const federalRate=s.federalBrackets[0].rate,provRate=s.provincialBrackets[0].rate;
 const bracketTax=(list:PayrollRules['statutory']['federalBrackets'])=>{const br=[...list].reverse().find(v=>annual.gte(v.floor))!;return annual.times(br.rate).minus(br.constant);};
 const federalAnnual=pos(bracketTax(s.federalBrackets).minus(b(i.federalClaim??baseClaim).times(federalRate)).minus(creditBase.times(federalRate)).minus(min(gross.times(P),b(s.employmentAmount)).times(federalRate)));
 const provincialCredits=b(i.provincialClaim??s.albertaBasic).plus(creditBase).times(provRate);
 const supplement=pos(provincialCredits.minus(s.albertaSupplementThreshold).times(s.albertaSupplementRate));
 const provincialAnnual=pos(bracketTax(s.provincialBrackets).minus(provincialCredits).minus(supplement));
 const incomeTax=cents(federalAnnual.plus(provincialAnnual).div(P).plus(i.additionalTax));
 const deductions=cpp.plus(cpp2).plus(ei).plus(incomeTax),net=gross.minus(deductions);
 if(net.lt(0))throw new Error('Deductions exceed gross pay; manual review is required');
 return {engine:'ca-ab-regular-2026-v1',classification:classification(rules),verified:false,moneyMovement:false,rulesHash:rulesHash(rules),currency:rules.currency,payDate:i.payDate,
 gross:out(gross),cpp:out(cpp),cpp2:out(cpp2),ei:out(ei),incomeTax:out(incomeTax),federalTax:out(federalAnnual.div(P)),provincialTax:out(provincialAnnual.div(P)),additionalTax:out(b(i.additionalTax)),net:out(net),
 employerCpp:out(cpp.plus(cpp2)),employerEi:out(ei.times(s.eiEmployerMultiplier)),vacationAccrualEstimate:out(gross.times(rules.policy.vacationAccrualRate)),
 scope:'Regular cash wages only; full-year CPP eligibility; standard EI; no Quebec transfer, bonuses, noncash benefits, commission, pension/RRSP deductions, garnishments or special credits. Gross and YTD must be independently reviewed. Vacation accrual is not paid or deducted here.',sources:SOURCES};
}
