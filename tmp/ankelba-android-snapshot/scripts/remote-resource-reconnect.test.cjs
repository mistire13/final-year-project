'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

test('reconnect reloads server state, preserves cached data on failure, and ignores stale responses',async()=>{
  const slots=[];let cursor=0,effects=[],onRealtime,requests=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},
    useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}},
  };
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/hooks/useRemoteResource.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const m={exports:{}};
  vm.runInNewContext(code,{module:m,exports:m.exports,Promise,require(name){if(name==='react')return react;if(name==='react-native')return {AppState:{addEventListener:()=>({remove(){}})}};if(name==='./useRealtime')return {useRealtime:fn=>{onRealtime=fn;}};throw Error(name);}});
  const load=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  function render(){cursor=0;effects=[];const result=m.exports.useRemoteResource('bills',load,[]);for(const effect of effects)effect();return result;}
  render();assert.equal(requests.length,1);
  requests[0].resolve(['previous']);await flush();
  assert.equal(render().data[0],'previous');
  onRealtime({type:'ready'});assert.equal(requests.length,2);
  requests[1].reject(new Error('offline'));await flush();
  let state=render();assert.equal(state.data[0],'previous');assert.ok(state.error);
  onRealtime({type:'resource.changed',resource:'finances'});
  onRealtime({type:'resource.changed',resource:'finances'});
  assert.equal(requests.length,4);
  requests[3].resolve(['latest']);await flush();
  requests[2].resolve(['stale']);await flush();
  state=render();assert.equal(state.data[0],'latest');assert.equal(state.error,'');
});
