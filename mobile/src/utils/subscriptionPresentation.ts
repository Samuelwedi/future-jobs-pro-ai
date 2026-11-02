export type EntitlementDisplay={status?:string;tier?:string;currentPeriodEnd?:string|null;expiresAt?:string|null;cancelAtPeriodEnd?:boolean};
export function subscriptionPresentation(value:EntitlementDisplay,now=Date.now()){
 const status=(value.status||'').toLowerCase(),trial=['trialing','in_trial'].includes(status),raw=value.currentPeriodEnd||value.expiresAt,parsed=raw?Date.parse(raw):NaN,validEnd=Number.isFinite(parsed),expired=validEnd&&parsed<=now;
 const active=['active','trialing','in_trial','grace_period'].includes(status)&&!expired&&(!raw||validEnd)&&(!trial||validEnd);
 return{active,expired,trial,renewalDate:validEnd?raw:null,dateLabel:trial?(expired?'Trial ended':'Trial ends'):expired?'Ended':value.cancelAtPeriodEnd?'Ends':'Renews'};
}
export function localizedPlanFeature(value:string,t:(key:string,vars?:Record<string,string>)=>string){
 for(const[pattern,key]of [[/^Up to (\d+) active accounts \(owners and workers\)$/,'Up to {count} active accounts (owners and workers)'],[/^(\d+) operations AI requests\/month$/,'{count} operations AI requests/month'],[/^(\d+) MB knowledge document allowance$/,'{count} MB knowledge document allowance']] as const){const match=value.match(pattern);if(match)return t(key,{count:match[1]});}return t(value);
}
