import {validateBusinessBytes} from './businessValidation';
export async function copyBusinessStream(reader:{read:()=>Promise<{done:boolean;value?:Uint8Array}>;cancel:()=>Promise<unknown>;releaseLock:()=>void},write:(chunk:Uint8Array)=>void,mime:string,maxBytes:number):Promise<number>{
 let size=0,prefix=new Uint8Array(0),checked=false;
 try{while(true){const{done,value}=await reader.read();if(done)break;if(!value?.length)continue;size+=value.length;if(size>maxBytes)throw Error('Choose a smaller selection.');if(prefix.length<12){const chunk=value.subarray(0,12-prefix.length),next=new Uint8Array(prefix.length+chunk.length);next.set(prefix);next.set(chunk,prefix.length);prefix=next;}if(prefix.length>=12&&!checked){validateBusinessBytes(prefix,mime);checked=true;}write(value);}if(!checked)validateBusinessBytes(prefix,mime);return size;
 }catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}
}
