'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('operator must confirm daycare agreement before authorizing an overdue payment restart', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../src/portal/SubscriptionViews.web.tsx'),'utf8')
    .replace('function ManageSubscription(', 'export function ManageSubscription(');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const state=[],refs=[];let cursor=0,refCursor=0,effects=[],tree,received;
  const react={
    Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},
    useRef(initial){const i=refCursor++;return refs[i] ||= {current:initial};},
    useEffect(effect,deps){const i=cursor++;const old=state[i];if(!old||deps.some((v,j)=>v!==old[j])){state[i]=deps;effects.push(effect);}},
  };
  const Button=function Button(){};
  const api={authorizeRenewalRestart:async(id,body)=>{received={id,body};}};
  const m={exports:{}};
  vm.runInNewContext(compiled,{module:m,exports:m.exports,Date,Math,globalThis:{},
    require(name){
      if(name==='react')return {...react,default:react};
      if(name==='./api')return {operatorApi:api,apiError:e=>e.message};
      if(name==='./ui.web')return {Button,Card:function Card(){}};
      if(name==='./subscriptions')return {dateLabel:x=>String(x),offerPrice:()=>100,priceLabel:()=>''};
      if(name==='./ReceiptReference.web')return {default:()=>null};
      if(name.endsWith('.css'))return {};
      throw new Error(name);
    }});
  const value={id:42,version:9,subscription_status:'active',subscription_plan:'standard',billing_cycle:'monthly',
    subscription_ends_at:'2020-01-01T00:00:00Z',renewal_restart_eligible:true};
  const props={value,offers:[{code:'standard',available:true,version:1}],onSaved:async()=>{},onRefreshOffers:async()=>{}};
  function render(){cursor=0;refCursor=0;effects=[];tree=m.exports.ManageSubscription(props);for(const f of effects)f();}
  function nodes(){const result=[];const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;result.push(n);visit(n.props?.children);};visit(tree);return result;}
  const find=predicate=>nodes().find(predicate);
  render();render();
  find(n=>n.type==='select').props.onChange({target:{value:'authorize_restart'}});render();
  find(n=>n.type==='textarea').props.onChange({target:{value:'Agreed restart with daycare'}});render();
  assert.equal(find(n=>n.type===Button && n.props.type==='submit').props.disabled,true);
  find(n=>n.type==='input' && n.props.type==='checkbox').props.onChange({target:{checked:true}});render();
  assert.equal(find(n=>n.type===Button && n.props.type==='submit').props.disabled,false);
  await find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(received.id,42);
  assert.deepEqual(JSON.parse(JSON.stringify(received.body)),{version:9,reason:'Agreed restart with daycare',acknowledge_restart:true});
});
