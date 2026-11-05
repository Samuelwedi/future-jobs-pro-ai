export type Tool={id:string;name:string;category:string;fields:string[];solve:(n:(i:number)=>number)=>string[]};
export const formatToolValue=(v:number,d=3,locale='en')=>Number.isFinite(v)?Number(v.toFixed(d)).toLocaleString(locale):'—';
export function createWorkerTools(t:(key:string,vars?:Record<string,string>)=>string,locale='en'):Tool[]{
const fmt=(value:number,d=3)=>formatToolValue(value,d,locale);
return [
 {id:'concrete',name:'Concrete quantity',category:'Construction',fields:['Length ft','Width ft','Depth in','Waste %'],solve:n=>{const y=n(0)*n(1)*n(2)/12/27*(1+n(3)/100);return [`${fmt(y)} yd³`,t("{value0} × 80 lb bags",{value0:String(Math.ceil(y*45))})]}},
 {id:'asphalt',name:'Asphalt tonnage',category:'Construction',fields:['Length ft','Width ft','Depth in','Density lb/ft³'],solve:n=>[t("{value0} US tons",{value0:String(fmt(n(0)*n(1)*n(2)/12*n(3)/2000))})]},
 {id:'spacing',name:'Equal spacing',category:'Carpentry',fields:['Clear span in','Item width in','Item count'],solve:n=>{const c=Math.max(1,Math.floor(n(2))),g=(n(0)-c*n(1))/(c+1);return [t("Gap {value0} in",{value0:String(fmt(g))}),t("On-center {value0} in",{value0:String(fmt(g+n(1)))})]}},
 {id:'square',name:'Check square',category:'Carpentry',fields:['Side A','Side B'],solve:n=>[t("Diagonal {value0} same units",{value0:String(fmt(Math.hypot(n(0),n(1))))})]},
 {id:'stairs',name:'Stair layout',category:'Carpentry',fields:['Total rise in','Target riser in','Tread depth in'],solve:n=>{const r=Math.max(1,Math.ceil(n(0)/n(1)));return [t("{value0} risers",{value0:String(r)}),t("Rise {value0} in",{value0:String(fmt(n(0)/r))}),t("{value0} treads",{value0:String(Math.max(0,r-1))}),t("Run {value0} in",{value0:String(fmt((r-1)*n(2)))})]}},
 {id:'roof',name:'Roof & slope',category:'Construction',fields:['Run ft','Rise ft','Building length ft'],solve:n=>{const r=Math.hypot(n(0),n(1));return [t("Pitch {value0}:12",{value0:String(fmt(n(1)/n(0)*12))}),t("Angle {value0}°",{value0:String(fmt(Math.atan2(n(1),n(0))*180/Math.PI))}),t("Rafter {value0} ft",{value0:String(fmt(r))}),t("Area {value0} ft²",{value0:String(fmt(2*r*n(2)))})]}},
 {id:'board',name:'Board feet',category:'Carpentry',fields:['Thickness in','Width in','Length ft','Quantity'],solve:n=>[t("{value0} board ft",{value0:String(fmt(n(0)*n(1)*n(2)/12*n(3)))})]},
 {id:'circle',name:'Circle & arc',category:'Measure',fields:['Diameter','Arc angle °'],solve:n=>[t("Area {value0}",{value0:String(fmt(Math.PI*n(0)*n(0)/4))}),t("Circumference {value0}",{value0:String(fmt(Math.PI*n(0)))}),t("Arc {value0}",{value0:String(fmt(Math.PI*n(0)*n(1)/360))})]},
 {id:'paint',name:'Paint & coverings',category:'Finishing',fields:['Perimeter ft','Height ft','Openings ft²','Coats'],solve:n=>{const a=Math.max(0,n(0)*n(1)-n(2));return [t("Area {value0} ft²",{value0:String(fmt(a))}),t("{value0} gal @ 350 ft²/gal",{value0:String(Math.ceil(a*n(3)/350))})]}},
 {id:'ohm',name:"Ohm's law & power",category:'Electrical',fields:['Voltage V','Current A'],solve:n=>[`${fmt(n(0)/n(1))} Ω`,`${fmt(n(0)*n(1))} W`]},
 {id:'pipe',name:'Pipe volume & flow',category:'Plumbing',fields:['Inside diameter in','Length ft','Flow gal/min'],solve:n=>{const g=Math.PI*(n(0)/2)**2*n(1)*12/231;return [t("{value0} US gal",{value0:String(fmt(g))}),t("Fill {value0} min",{value0:String(fmt(g/n(2)))})]}},
 {id:'landscape',name:'Soil, mulch & gravel',category:'Landscaping',fields:['Length ft','Width ft','Depth in','Waste %'],solve:n=>[`${fmt(n(0)*n(1)*n(2)/12/27*(1+n(3)/100))} yd³`]},
 {id:'dilution',name:'Chemical dilution',category:'Facilities',fields:['Finished volume L','Water parts'],solve:n=>[t("{value0} L concentrate",{value0:String(fmt(n(0)/(n(1)+1)))}),t("{value0} L water",{value0:String(fmt(n(0)*n(1)/(n(1)+1)))})]},
 {id:'fuel',name:'Mileage & fuel',category:'Logistics',fields:['Distance km','L/100km','Price/L'],solve:n=>{const l=n(0)*n(1)/100;return [`${fmt(l)} L`,`$${fmt(l*n(2),2)}`]}}
 ,{id:'slab',name:'Concrete slab',category:'Concrete',fields:['Length ft','Width ft','Thickness in','Waste %','Truck capacity yd³','Cost/yd³'],solve:n=>{const a=n(0)*n(1),y=a*n(2)/12/27*(1+n(3)/100);return [t("Area {value0} ft²",{value0:String(fmt(a))}),`${fmt(y)} yd³`,t("{value0} × 80 lb bags",{value0:String(Math.ceil(y*45))}),t("{value0} truckloads",{value0:String(Math.ceil(y/Math.max(n(4),.001)))}),`$${fmt(y*n(5),2)}`]}}
 ,{id:'slope',name:'Slope & grade',category:'Sitework',fields:['Rise ft','Horizontal run ft'],solve:n=>{const rise=n(0),run=n(1);return [run>0?t("Grade {value0}%",{value0:String(fmt(rise/run*100))}):t("Grade —"),run>0?t("Angle {value0}°",{value0:String(fmt(Math.atan2(rise,run)*180/Math.PI))}):t("Angle —"),rise!==0?t("Ratio 1:{value0}",{value0:String(fmt(run/Math.abs(rise)))}):t("Level"),run>0?t("Pitch {value0}:12",{value0:String(fmt(rise/run*12))}):t("Pitch —"),t("Slope {value0} ft",{value0:String(fmt(Math.hypot(rise,run)))})]}}
 ,{id:'footing',name:'Continuous footing',category:'Concrete',fields:['Total length ft','Width in','Depth in','Waste %'],solve:n=>{const y=n(0)*n(1)/12*n(2)/12/27*(1+n(3)/100);return [`${fmt(y)} yd³`,t("{value0} × 80 lb bags",{value0:String(Math.ceil(y*45))})]}}
 ,{id:'pier',name:'Concrete pier & column',category:'Concrete',fields:['Diameter in','Depth/height ft','Quantity','Waste %'],solve:n=>{const y=Math.PI*(n(0)/24)**2*n(1)*n(2)/27*(1+n(3)/100);return [`${fmt(y)} yd³`,t("{value0} × 80 lb bags",{value0:String(Math.ceil(y*45))})]}}
 ,{id:'rebar',name:'Rebar grid',category:'Concrete',fields:['Slab length ft','Slab width ft','Spacing in','Lap/waste %','Weight lb/ft'],solve:n=>{const s=Math.max(n(2)/12,.001),a=Math.ceil(n(1)/s)+1,b=Math.ceil(n(0)/s)+1,total=(a*n(0)+b*n(1))*(1+n(3)/100);return [t("{value0} lengthwise bars",{value0:String(a)}),t("{value0} crosswise bars",{value0:String(b)}),t("{value0} ft total",{value0:String(fmt(total))}),`${fmt(total*n(4))} lb`]}}
 ,{id:'masonry',name:'Block, brick & mortar',category:'Masonry',fields:['Wall length ft','Wall height ft','Openings ft²','Unit face area in²','Waste %'],solve:n=>{const a=Math.max(0,n(0)*n(1)-n(2)),c=Math.ceil(a*144/Math.max(n(3),.001)*(1+n(4)/100));return [`${fmt(a)} ft²`,t("{value0} units",{value0:String(c)}),t("{value0} ft³ mortar allowance",{value0:String(fmt(c*.025))})]}}
 ,{id:'excavation',name:'Excavation & backfill',category:'Sitework',fields:['Length ft','Width ft','Depth ft','Swell %','Structure yd³'],solve:n=>{const b=n(0)*n(1)*n(2)/27;return [t("{value0} yd³ bank",{value0:String(fmt(b))}),t("{value0} yd³ loose",{value0:String(fmt(b*(1+n(3)/100)))}),t("{value0} yd³ backfill",{value0:String(fmt(Math.max(0,b-n(4))))})]}}
 ,{id:'trench',name:'Trench volume',category:'Sitework',fields:['Length ft','Width in','Depth in','Bedding in'],solve:n=>{const y=n(0)*n(1)/12*n(2)/12/27,b=n(0)*n(1)/12*n(3)/12/27;return [t("{value0} yd³ excavation",{value0:String(fmt(y))}),t("{value0} yd³ bedding",{value0:String(fmt(b))}),t("{value0} yd³ spoil",{value0:String(fmt(Math.max(0,y-b)))})]}}
 ,{id:'drywall',name:'Drywall materials',category:'Finishing',fields:['Surface area ft²','Sheet area ft²','Waste %'],solve:n=>{const a=n(0)*(1+n(2)/100),s=Math.ceil(a/Math.max(n(1),.001));return [t("{value0} ft² adjusted",{value0:String(fmt(a))}),t("{value0} sheets",{value0:String(s)}),t("{value0} screws",{value0:String(s*32)}),t("{value0} compound pails",{value0:String(Math.ceil(s/10))})]}}
 ,{id:'tile',name:'Tile & flooring',category:'Finishing',fields:['Length ft','Width ft','Waste %','Coverage/carton ft²','Cost/ft²'],solve:n=>{const a=n(0)*n(1),buy=a*(1+n(2)/100);return [t("{value0} ft² room",{value0:String(fmt(a))}),t("{value0} ft² purchase",{value0:String(fmt(buy))}),t("{value0} cartons",{value0:String(Math.ceil(buy/Math.max(n(3),.001)))}),`$${fmt(buy*n(4),2)}`]}}
 ,{id:'roofing',name:'Roofing materials',category:'Roofing',fields:['Plan length ft','Plan width ft','Pitch rise in/12','Waste %'],solve:n=>{const a=n(0)*n(1)*Math.sqrt(1+(n(2)/12)**2)*(1+n(3)/100),sq=a/100;return [`${fmt(a)} ft²`,t("{value0} squares",{value0:String(fmt(sq))}),t("{value0} bundles",{value0:String(Math.ceil(sq*3))}),t("{value0} underlayment rolls",{value0:String(Math.ceil(a/400))})]}}
 ,{id:'deck',name:'Deck boards & joists',category:'Carpentry',fields:['Deck length ft','Deck width ft','Board face in','Gap in','Joist spacing in','Waste %'],solve:n=>{const rows=Math.ceil(n(1)*12/Math.max(n(2)+n(3),.001)),linear=rows*n(0)*(1+n(5)/100);return [t("{value0} board rows",{value0:String(rows)}),t("{value0} linear ft",{value0:String(fmt(linear))}),t("{value0} joists",{value0:String(Math.ceil(n(0)*12/Math.max(n(4),.001))+1)})]}}
 ,{id:'fence',name:'Fence materials',category:'Carpentry',fields:['Fence length ft','Section length ft','Rails/section','Picket plus gap in'],solve:n=>{const s=Math.ceil(n(0)/Math.max(n(1),.001));return [t("{value0} sections",{value0:String(s)}),t("{value0} posts",{value0:String(s+1)}),t("{value0} rails",{value0:String(s*n(2))}),t("{value0} pickets",{value0:String(Math.ceil(n(0)*12/Math.max(n(3),.001)))})]}}
 ,{id:'insulation',name:'Insulation',category:'Finishing',fields:['Wall length ft','Wall height ft','Openings ft²','Coverage/package ft²','Waste %','Cost/package'],solve:n=>{const a=Math.max(0,n(0)*n(1)-n(2))*(1+n(4)/100),p=Math.ceil(a/Math.max(n(3),.001));return [`${fmt(a)} ft²`,t("{value0} packages",{value0:String(p)}),`$${fmt(p*n(5),2)}`]}}
 ,{id:'voltage-drop',name:'Voltage drop',category:'Electrical',fields:['System voltage V','Current A','One-way length ft','Resistance Ω/1000ft'],solve:n=>{const d=2*n(2)*n(1)*n(3)/1000;return [t("{value0} V drop",{value0:String(fmt(d))}),n(0)>0?t("{value0}% drop",{value0:String(fmt(d/n(0)*100))}):'—',t("{value0} V load",{value0:String(fmt(n(0)-d))})]}}
 ,{id:'hvac-airflow',name:'HVAC airflow',category:'HVAC',fields:['Room length ft','Room width ft','Room height ft','Air changes/hour'],solve:n=>{const v=n(0)*n(1)*n(2);return [`${fmt(v)} ft³`,`${fmt(v*n(3)/60)} CFM`]}}
 ,{id:'equipment-cost',name:'Equipment operating cost',category:'Logistics',fields:['Operating hours','Fuel L/h','Fuel price/L','Rental/hour','Labour/hour'],solve:n=>{const fuel=n(0)*n(1)*n(2),rent=n(0)*n(3),lab=n(0)*n(4);return [t("Fuel ${value0}",{value0:String(fmt(fuel,2))}),t("Rental ${value0}",{value0:String(fmt(rent,2))}),t("Labour ${value0}",{value0:String(fmt(lab,2))}),t("Total ${value0}",{value0:String(fmt(fuel+rent+lab,2))})]}}
];
}

export function parseToolInputs(tool:Tool, values:string[]):number[]{
 if(values.length!==tool.fields.length)throw Error('Enter a finite non-negative number in every field.');
 return tool.fields.map((field,index)=>{
  const text=values[index].trim().replace(',', '.');
  const value=Number(text);
  const signed=tool.id==='slope'&&field==='Rise ft';
  if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)||!Number.isFinite(value)||(!signed&&value<0))throw Error('Enter a finite non-negative number in every field.');
  const zeroAllowed=/Waste|waste|Swell|Openings|Cost|cost|Price|price|Rental|Labour|Gap|Water parts|Structure|Bedding/.test(field)||(field==='Rise ft'&&tool.id==='slope')||(field==='Current A'&&tool.id==='voltage-drop');
  if(value===0&&!zeroAllowed)throw Error('These inputs do not produce a valid result.');
  if(/Quantity|Item count|Coats|Rails\/section/.test(field)&&!Number.isInteger(value))throw Error('These inputs do not produce a valid result.');
  return value;
 });
}
export function parseFeet(text:string):number{
 const match=text.trim().match(/^(-?)(\d+)\s*['′]?\s*(?:(\d+)\s*)?(?:(\d+)\s*\/\s*(\d+)\s*)?["″]?$/);
 if(!match)throw Error("Use feet and inches, for example 5' 7 1/4.");
 const feet=Number(match[2]),inches=Number(match[3]||0),numerator=Number(match[4]||0),denominator=Number(match[5]||1);
 if(inches>=12||denominator===0||numerator>=denominator)throw Error("Use feet and inches, for example 5' 7 1/4.");
 const result=(feet*12+inches+numerator/denominator)*(match[1]?-1:1);
 if(!Number.isFinite(result)||!Number.isSafeInteger(feet))throw Error("Use feet and inches, for example 5' 7 1/4.");
 return result;
}
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
export function inchFraction(value:number,precision:number):string{
 if(!Number.isFinite(value)||![2,4,8,16,32,64].includes(precision))throw Error('These inputs do not produce a valid result.');
 const ticks=Math.round(Math.abs(value)*precision),whole=Math.floor(ticks/precision),numerator=ticks%precision,sign=value<0?'-':'';
 if(!numerator)return sign+whole;
 const divisor=gcd(numerator,precision);
 return sign+(whole?whole+' ':'')+(numerator/divisor)+'/'+(precision/divisor);
}
