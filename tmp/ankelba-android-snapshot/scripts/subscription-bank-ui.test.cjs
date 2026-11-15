'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const blank={enabled:false,account_holder:'',account_number:''};
function harness(api={},operator={}){
  const slots=[];let cursor=0,effects=[],tree;
  const Button=function Button(){},Card=function Card(){};
  const react={Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]||=( {current:initial} );},
    useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>value!==old.deps[j])){old?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=effect();});}},};
  const source=fs.readFileSync(path.join(__dirname,'../src/portal/SubscriptionViews.web.tsx'),'utf8').replace('function PaymentSettings(','export function PaymentSettings(');
  const m={exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{module:m,exports:m.exports,
    window:{sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}},
    require(name){if(name==='react')return {...react,default:react};if(name==='./api')return {portalApi:api,operatorApi:operator,apiError:error=>error.message};if(name==='./ui.web')return {Button,Card};if(name==='./subscriptions')return {priceLabel:()=>'',dateLabel:()=>''};if(name.endsWith('.css'))return {};if(name==='./ReceiptReference.web')return {__esModule:true,default:()=>null};throw Error(name);}});
  const nodes=()=>{const all=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;all.push(node);visit(node.props?.children);};visit(tree);return all;};
  return {render(name){cursor=0;effects=[];tree=m.exports[name]();for(const effect of effects)effect();},nodes,Button};
}
test('operator edits two independent bank accounts with versioned settings',async()=>{
  let body;
  const h=harness({}, {subscriptionPaymentSettings:async()=>({accounts:{cbe:{...blank},abyssinia:{...blank}},version:7}),saveSubscriptionPaymentSettings:async value=>{body=value;return {...value,version:8};}});
  const render=()=>h.render('PaymentSettings');render();await turn();render();
  const sections=()=>h.nodes().filter(node=>node.type==='section');
  const controls=section=>section.props.children.flat().filter(node=>node?.type==='label').flatMap(node=>node.props.children.flat().filter(value=>value?.type==='input'));
  controls(sections()[0])[0].props.onChange({target:{checked:true}});render();
  controls(sections()[0])[1].props.onChange({target:{value:'Synthetic CBE Owner'}});render();
  controls(sections()[0])[2].props.onChange({target:{value:'1000000000001'}});render();
  h.nodes().find(node=>node.type==='textarea').props.onChange({target:{value:'Configure CBE for subscription payments'}});render();
  await h.nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});render();
  assert.equal(body.version,7);assert.equal(body.accounts.cbe.enabled,true);assert.equal(body.accounts.cbe.account_number,'1000000000001');
  assert.equal(body.accounts.abyssinia.enabled,false);assert.equal(body.accounts.abyssinia.account_number,'');
  controls(sections()[2])[0].props.onChange({target:{checked:true}});render();
  controls(sections()[2])[1].props.onChange({target:{value:'Synthetic Telebirr Owner'}});render();
  controls(sections()[2])[2].props.onChange({target:{value:'0911234567'}});render();
  await h.nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});render();
  assert.equal(body.accounts.telebirr.enabled,true);assert.equal(body.accounts.telebirr.account_number,'0911234567');
  assert.deepEqual(Object.keys(body).sort(),['accounts','reason','version']);
});
test('renewal captures the chosen bank and shows its required five-digit suffix',async()=>{
  let provider;
  const intent={id:'bank-renewal',token:'synthetic',status:'pending',recipient_institution:'Bank of Abyssinia',terms:{recipient_provider:'abyssinia',price:'200',billing_cycle:'monthly'}};
  const h=harness({publicPaymentSettings:async()=>({accounts:[{provider:'cbe',institution:'Commercial Bank of Ethiopia'},{provider:'abyssinia',institution:'Bank of Abyssinia'}]}),
    subscription:async()=>({id:1,subscription_status:'active'}),createRenewalIntent:async value=>{provider=value;return intent;}});
  const render=()=>h.render('DaycareSubscription');render();await turn();render();
  h.nodes().find(node=>node.type==='select').props.onChange({target:{value:'abyssinia'}});render();
  const start=h.nodes().find(node=>node.type===h.Button&&node.props.children.includes('Start renewal payment'));assert.equal(start.props.disabled,false);
  await start.props.onClick();render();assert.equal(provider,'abyssinia');
  const suffix=h.nodes().find(node=>node.type==='input'&&node.props.inputMode==='numeric');assert.equal(suffix.props.pattern,'[0-9]{5}');assert.equal(suffix.props.required,true);
});

test('CBE renewal verifies the complete receipt link without asking for a suffix',async()=>{
  let proof;
  const intent={id:'cbe-renewal',token:'synthetic',status:'pending',terms:{recipient_provider:'cbe',price:'200',billing_cycle:'monthly'}};
  const h=harness({publicPaymentSettings:async()=>({accounts:[{provider:'cbe',institution:'Commercial Bank of Ethiopia'}]}),subscription:async()=>({id:1,subscription_status:'active'}),createRenewalIntent:async()=>intent,
    verifyPaymentIntent:async(id,body)=>{proof=body;return {...intent,status:'verification_pending'};}});
  const render=()=>h.render('DaycareSubscription');render();await turn();render();
  await h.nodes().find(node=>node.type===h.Button&&node.props.children.includes('Start renewal payment')).props.onClick();render();
  const input=h.nodes().find(node=>node.type==='input'&&node.props.type==='url');assert.ok(input);
  const pattern=new RegExp(`^(?:${input.props.pattern})$`,'v');
  assert.equal(pattern.test('https://mbreciept.cbe.com.et/ReceiptToken123'),true);
  assert.equal(pattern.test('https://apps.cbe.com.et:100/?id=FT123456789012345678'),true);
  assert.equal(pattern.test('https://example.invalid/ReceiptToken123'),false);
  assert.equal(h.nodes().find(node=>node.type==='input'&&node.props.inputMode==='numeric'),undefined);
  input.props.onChange({target:{value:'https://mbreciept.cbe.com.et/ReceiptToken123'}});render();
  h.nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await turn();render();
  assert.deepEqual({...proof},{token:'synthetic',provider:'cbe',reference:'https://mbreciept.cbe.com.et/ReceiptToken123'});
});
