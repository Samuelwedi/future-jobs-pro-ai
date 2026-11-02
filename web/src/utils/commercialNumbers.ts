// PostgreSQL NUMERIC is serialized as a string. Normalize financial response
// fields before rendering/formatting; leave IDs, dates and user copy unchanged.
const fields=new Set(['total','subtotal','tax_rate','tax_amount','unit_price','quantity','paid_amount','balance','milestone_percentage','total_billed','total_paid','total_balance']);
export function commercialNumbers(value:any):any {
 if(Array.isArray(value))return value.map(commercialNumbers);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>{
  if(fields.has(key)&&item!==null&&item!==undefined){const number=Number(item);if(!Number.isFinite(number)||item==='')throw Error('The server returned an invalid financial amount.');return[key,number];}
  return[key,commercialNumbers(item)];
 }));
}
