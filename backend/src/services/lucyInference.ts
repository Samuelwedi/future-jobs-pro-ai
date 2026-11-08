import OpenAI from 'openai';
export function compatibleMessages(instructions:string,input:any[]){
 const messages:any[]=[{role:'system',content:instructions}];
 for(const item of input){
  if(item.type==='function_call'){
   const previous=messages[messages.length-1];
   const call={id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments||'{}'}};
   if(previous.role==='assistant'&&previous.tool_calls)previous.tool_calls.push(call);
   else messages.push({role:'assistant',content:null,tool_calls:[call]});
  }else if(item.type==='function_call_output')messages.push({role:'tool',tool_call_id:item.call_id,content:item.output});
  else if(item.type==='message')messages.push({role:'assistant',content:(item.content||[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('\n')});
  else if(['user','assistant','system'].includes(item.role))messages.push({role:item.role,content:item.content});
 }
 return messages;
}
export function compatibleConfig(){
 const baseURL=process.env.LUCY_LLM_BASE_URL?.trim();const model=process.env.LUCY_LLM_MODEL?.trim();
 if(!baseURL&&!model)return null;
 if(!baseURL||!model)throw new Error('Lucy inference needs both a base URL and a model');
 const parsed=new URL(baseURL);
 if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('Invalid Lucy inference base URL');
 if(parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)&&!parsed.hostname.endsWith('.railway.internal'))throw new Error('Remote Lucy inference must use HTTPS');
 return {baseURL,model,apiKey:process.env.LUCY_LLM_API_KEY?.trim()||'local-no-key'};
}
export function lucyInferenceReady(){return Boolean(compatibleConfig()||process.env.OPENAI_API_KEY?.trim());}
/** Preserve provider completion limits instead of reporting truncated output as finished. */
export function compatibleResponse(response:any,fallbackModel:string){
 const choice=response?.choices?.[0],message=choice?.message;
 if(!message || typeof message!=='object')throw new Error('Lucy inference returned no response');
 const content=typeof message.content==='string'?message.content:typeof message.refusal==='string'?message.refusal:'';
 const calls=message.tool_calls ?? [];
 if(!Array.isArray(calls))throw new Error('Lucy inference returned invalid tools');
 const output=calls.map((call:any)=>{
  if(!call||call.type!=='function'||!call.function||typeof call.function!=='object')throw new Error('Lucy inference returned an unsupported tool');
  return {type:'function_call',call_id:call.id,name:call.function.name,arguments:call.function.arguments};
 });
 if(content)output.push({type:'message',role:'assistant',content:[{type:'output_text',text:content}]} as any);
 const complete=['stop','tool_calls'].includes(choice.finish_reason);
 return {model:response.model||fallbackModel,status:complete?'completed':'incomplete',output_text:content,output};
}
export async function lucyResponse({instructions,input,tools=[],maxOutputTokens=1200}:{instructions:string;input:any[];tools?:any[];maxOutputTokens?:number}){
 const alternate=compatibleConfig();
 if(alternate){
  try{
   const client=new OpenAI({...alternate,timeout:45000,maxRetries:0});
   const response=await client.chat.completions.create({model:alternate.model,messages:compatibleMessages(instructions,input),max_tokens:maxOutputTokens,
    ...(tools.length?{tools:tools.map(({type,name,description,parameters,strict})=>({type:'function' as const,function:{name,description,parameters,strict}}))}:{}),stream:false});
   return compatibleResponse(response,alternate.model);
  }catch(error:any){
   if(process.env.LUCY_ALLOW_PAID_FALLBACK!=='true'||!process.env.OPENAI_API_KEY||![429,500,502,503,504].includes(error.status))throw error;
  }
 }
 if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error('Lucy inference is not configured'),{status:503});
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:45000,maxRetries:1});
 return client.responses.create({model:process.env.OPENAI_LUCY_MODEL?.trim()||'gpt-5',instructions,input,tools,max_output_tokens:maxOutputTokens,reasoning:{effort:'medium'},store:false});
}
