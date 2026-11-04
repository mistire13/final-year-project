'use strict';
require('dotenv').config();
async function main(){
 const key=process.env.NVIDIA_API_KEY;
 if(!key || key.startsWith('placeholder')) {console.log('Provider key is not configured.');return;}
 const base=(process.env.NVIDIA_BASE_URL||'https://integrate.api.nvidia.com/v1').replace(/\/$/,'');
 console.log(`Provider endpoint: ${new URL(base).origin}${new URL(base).pathname}`);
 const response=await fetch(base+'/models',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(12000)});
 console.log(`Provider catalog HTTP ${response.status}`);
 if(!response.ok)return;
 const ids=(await response.json()).data?.map(model=>model.id)||[];
 console.log(`Catalog count: ${ids.length}; text candidates: ${ids.filter(id=>/^(meta|nvidia|mistralai|qwen)\//.test(id)).join(', ')}`);
 const candidates=[process.env.NVIDIA_MODEL,process.env.NVIDIA_FALLBACK_MODEL,'meta/llama-3.3-70b-instruct','meta/llama-3.1-8b-instruct'].filter(Boolean);
 for(const model of [...new Set(candidates)])console.log(`${model}: ${ids.includes(model)?'listed':'not listed'}`);
 if(process.argv.includes('--probe')){
  const model=process.argv.find(arg=>arg.startsWith('--model='))?.slice(8)||process.env.NVIDIA_MODEL||'meta/llama-3.3-70b-instruct';const started=Date.now();
  const result=await fetch(base+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:'Reply with the single word READY.'}],max_tokens:220,temperature:0}),signal:AbortSignal.timeout(12000)});
  let valid=false;if(result.ok){const data=await result.json();valid=typeof data.choices?.[0]?.message?.content==='string'&&data.choices[0].message.content.trim().length>0;console.log(`finish_reason=${data.choices?.[0]?.finish_reason}; synthetic answer=${String(data.choices?.[0]?.message?.content||'').slice(0,80)}`);}
  console.log(`Live synthetic probe: HTTP ${result.status}; nonempty response=${valid}; elapsed=${Date.now()-started}ms`);
  if(!result.ok){const diagnostic=await result.json().catch(()=>({}));console.log(`Provider diagnostic: ${diagnostic.title||diagnostic.error?.type||'Request rejected'}`);}
 }
}
main().catch(error=>{console.error(`Provider check failed: ${error.name}`);process.exitCode=1;});
