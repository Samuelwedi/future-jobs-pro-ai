// Preview by default. --apply creates separate new products; existing subscriptions are untouched.
const fs=require('node:fs'),path=require('node:path');
const Stripe=require('stripe');
const {BILLING_PLANS}=require('../dist/config/billingPlans');
async function main(){
 const plans=Object.entries(BILLING_PLANS).filter(([,p])=>p.sale);
 console.table(plans.map(([key,p])=>({key,currency:'CAD',monthly:p.cadCents/100,accounts:p.employees,productId:`com.samuel33.futurejobspro.${key}_monthly`})));
 if(!process.argv.includes('--apply'))return;
 const key=process.env.STRIPE_SECRET_KEY;if(!key)throw Error('STRIPE_SECRET_KEY is not configured');
 if(/^(sk|rk)_live_/.test(key)&&!process.argv.includes('--live'))throw Error('Use --live with --apply to create the live catalog');
 const stripe=new Stripe(key);const mappings=[];
 for(const [plan,p] of plans){
  const lookup=`futurejobs_1_2_1_${plan}_cad_monthly`;
  const existing=await stripe.prices.list({lookup_keys:[lookup],limit:2});let price=existing.data[0];
  if(price && (!price.active||price.unit_amount!==p.cadCents||price.currency!=='cad'||price.recurring?.interval!=='month'))throw Error('Existing price conflicts with '+lookup);
  if(!price){const product=await stripe.products.create({name:p.name,metadata:{release:'1.2.1',planKey:plan,activeAccounts:String(p.employees)}},{idempotencyKey:lookup+'_product'});
   price=await stripe.prices.create({product:product.id,currency:'cad',unit_amount:p.cadCents,recurring:{interval:'month'},lookup_key:lookup,metadata:{planKey:plan}},{idempotencyKey:lookup+'_price'});}
  mappings.push(`${p.envName}=${price.id}`);
 }
 const output=path.resolve(__dirname,'../../billing-price-mappings.txt');fs.writeFileSync(output,mappings.join('\n')+'\n');
 console.log('New catalog created. Non-secret Railway price mappings: '+output);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
