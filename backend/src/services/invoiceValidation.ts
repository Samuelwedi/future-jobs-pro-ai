import Big from 'big.js';
import {validDate} from './payPeriodCalendar';
export function validateInvoiceLines(items:any):{subtotal:number;ids:string[]}{
 if(!Array.isArray(items)||!items.length||items.length>500)throw Error('Provide 1 to 500 invoice lines.');
 const ids:string[]=[];let total=new Big(0);
 for(const item of items){if(typeof item.description!=='string'||!item.description.trim()||item.description.length>2000)throw Error('Provide a description for every invoice line.');const quantity=Number(item.quantity??1),price=Number(item.unit_price);if(!Number.isFinite(quantity)||quantity<=0||quantity>1000000||!Number.isFinite(price)||price<0||price>1000000||new Big(quantity).round(2).toString()!==new Big(quantity).toString()||new Big(price).round(2).toString()!==new Big(price).toString())throw Error('Use positive quantities and non-negative prices with at most two decimals.');total=total.plus(new Big(quantity).times(price).round(2));if(item.timeEntryIds!==undefined&&!Array.isArray(item.timeEntryIds))throw Error('Invalid time entry list.');for(const id of item.timeEntryIds||[]){if(typeof id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw Error('Invalid time entry.');ids.push(id);}}
 if(new Set(ids).size!==ids.length)throw Error('A time entry can only appear once on an invoice.');if(total.gt('99999999.99'))throw Error('Invoice subtotal exceeds the supported limit.');return{subtotal:Number(total.toFixed(2)),ids:ids.sort()};
}
export function validateInvoiceHeader(issueDate:any,dueDate:any,taxRate:any){if(!validDate(String(issueDate))||!validDate(String(dueDate))||dueDate<issueDate)throw Error('Use valid ordered invoice dates.');if(!Number.isFinite(Number(taxRate??0))||Number(taxRate??0)<0||Number(taxRate??0)>100)throw Error('Use a tax percentage between 0 and 100.');}
export async function lockInvoiceLabor(client:any,companyId:string,ids:string[],excludeInvoice:string|null=null,projectId:string|null=null){
 if(!ids.length)return;
 const found=await client.query(`SELECT t.id FROM time_entries t JOIN users u ON u.id=t.user_id WHERE t.id=ANY($1::uuid[]) AND u.company_id=$2 AND t.approval_status='approved' AND t.clock_out IS NOT NULL AND ($3::uuid IS NULL OR t.project_id=$3) ORDER BY t.id FOR UPDATE OF t`,[ids,companyId,projectId]);
 if(found.rowCount!==ids.length)throw Error('Linked labor must be approved, completed, and belong to this company and project.');
 const billed=await client.query(`SELECT ii.id FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.company_id=$1 AND i.status NOT IN ('cancelled','void') AND ii.time_entry_ids && $2::uuid[] AND ($3::uuid IS NULL OR i.id<>$3) LIMIT 1`,[companyId,ids,excludeInvoice]);
 if(billed.rowCount)throw Error('A linked time entry is already invoiced.');
}
