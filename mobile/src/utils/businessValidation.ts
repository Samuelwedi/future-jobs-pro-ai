export function validBusinessDate(value:string):boolean {if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))return false;const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function businessRangeError(start:string,end:string):string|null{return !validBusinessDate(start)||!validBusinessDate(end)?'Use valid dates in YYYY-MM-DD format.':start>end?'Start date must not follow end date.':null;}
export function positiveMoney(value:string,allowZero=false):boolean{return /^\d+(\.\d{1,2})?$/.test(value)&&Number.isFinite(Number(value))&&Number(value)<=1000000&&(allowZero?Number(value)>=0:Number(value)>0);}
export function bytesBase64(bytes:Uint8Array):string{const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const parts:string[]=[];let chunk='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];chunk+=alphabet[a>>2]+alphabet[((a&3)<<4)|((b??0)>>4)]+(i+1<bytes.length?alphabet[((b&15)<<2)|((c??0)>>6)]:'=')+(i+2<bytes.length?alphabet[c&63]:'=');if(chunk.length>=8192){parts.push(chunk);chunk='';}}parts.push(chunk);return parts.join('');}
export function integrationAuthUrl(provider:'stripe'|'quickbooks',raw:string):string {const url=new URL(raw);const host=provider==='stripe'?'connect.stripe.com':'appcenter.intuit.com';if(url.protocol!=='https:'||url.hostname!==host||url.username||url.password||url.port)throw Error('The provider returned an unsupported authorization URL.');return url.toString();}
export function businessDownloadPath(path:string):boolean {
 return /^\/((invoices|estimates)\/[a-f0-9-]{36}\/pdf|reports\/(comprehensive|timesheet\.csv)|payroll\/(export|paystub\/[a-f0-9-]{36})|evidence-bundles\/(time-entry\/[a-f0-9-]{36}\/(download|gps-video|time-entry-pdf)|voice-note\/[a-f0-9-]{36}\/caption-video))(\?[^#]*)?$/i.test(path);
}
export function validateBusinessBytes(bytes:Uint8Array,mime:string):void {
 if(!bytes.length||bytes.length>25*1024*1024)throw Error('Choose a smaller selection (maximum 25 MB).');
 if(!['application/pdf','text/csv','application/zip','video/mp4'].includes(mime))throw Error('The server did not return a supported document or video.');
 const header=String.fromCharCode(...bytes.subarray(0,12));
 if(mime==='application/pdf'&&!header.startsWith('%PDF-'))throw Error('The server did not return a PDF document.');
 if(mime==='application/zip'&&!(bytes[0]===80&&bytes[1]===75&&((bytes[2]===3&&bytes[3]===4)||(bytes[2]===5&&bytes[3]===6))))throw Error('The server did not return a ZIP package.');
 if(mime==='video/mp4'&&header.slice(4,8)!=='ftyp')throw Error('The server did not return an MP4 video.');
 if(mime==='text/csv'&&/^\s*(<!doctype|<html|\{|\[)/i.test(header))throw Error('The server did not return CSV data.');
}
