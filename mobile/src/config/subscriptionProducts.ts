import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
export type PlanKey = string;
export const SALE_PLAN_KEYS = [10,35,50,65,80,95,110].map(size=>`team_${size}`);
export const STORE_PRODUCT_IDS: Record<string,string> = Object.fromEntries(
 [...SALE_PLAN_KEYS,'basic','professional','enterprise'].map(key=>[key,`com.samuel33.futurejobspro.${key}_monthly`]));
type PlanCopy = {name:string;audience:string;featured?:boolean;tint:string;icon:ComponentProps<typeof Ionicons>['name'];features:string[]};
export const FALLBACK_PLAN_COPY: Record<string,PlanCopy> = Object.fromEntries([10,35,50,65,80,95,110].map(size=>[
 `team_${size}`, {name:`Team ${size}`,audience:'Company workspace',featured:size===50,tint:'#00AFC8',icon:'business-outline',
 features:[`Up to ${size} active accounts (owners and workers)`,'Time tracking, GPS and Worker Tools','Scheduling, expenses and reports',
 `${size*10} operations AI requests/month`,`${size*100} MB knowledge document allowance`]}]));
export function planKeyForProduct(productId:string):PlanKey|null {
 return Object.keys(STORE_PRODUCT_IDS).find(key=>STORE_PRODUCT_IDS[key]===productId)||null;
}
