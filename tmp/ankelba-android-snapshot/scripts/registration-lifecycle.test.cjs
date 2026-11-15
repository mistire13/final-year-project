'use strict';
// Component-level application regression checks; no production database is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(register,props={}) {
  const slots = [], storage = new Map();
  const windowListeners=new Map(),documentListeners=new Map();
  class Element {constructor(link){this.link=link;}closest(selector){return this.link&&selector==='a[href]'?this:null;}}
  const listen=(listeners,type,callback)=>listeners.set(type,callback);
  const unlisten=(listeners,type,callback)=>{if(listeners.get(type)===callback)listeners.delete(type);};
  const window={
    location:{pathname:'/pricing',search:'?from=pricing',hash:''},
    sessionStorage:{getItem:key=>storage.get(key)||null,removeItem:key=>storage.delete(key)},
    addEventListener:(type,callback)=>listen(windowListeners,type,callback),
    removeEventListener:(type,callback)=>unlisten(windowListeners,type,callback),
    dispatchEvent:event=>{windowListeners.get(event.type)?.(event);return !event.defaultPrevented;},
    history:{pushState(_state,_title,value){const url=new URL(value,'https://ankelba.example');Object.assign(window.location,{pathname:url.pathname,search:url.search,hash:url.hash});}},
  };
  const Payment = function SubscriptionPayment() {};
  const payment = {id:'synthetic-payment-id',token:'synthetic-payment-token',status:'verified',email:'paid@example.invalid',terms:{code:'premium',name:'Premium',billing_cycle:'six_month',version:4}};
  let cursor = 0, effects = [], tree, cleared = 0;
  const react = {
    createElement:(type, props, ...children)=>({type,props:{...props,children}}),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect, deps) { const i = cursor++; const previous = slots[i]; if (!previous || deps.some((value, j) => value !== previous.deps[j])) { previous?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = effect(); }); } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/landing/EnrollmentCheckout.web.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(compiled, {
    module:m, exports:m.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === '../portal/api') return { portalApi: { registerDaycare: register }, apiError: error => error.response?.data?.error || error.message };
      if (name === './SubscriptionPayment.web') return {__esModule:true, default:Payment,clearApplicationPayment() {cleared++;}};
      if (name === '../portal/ui.web') return {Icon:()=>null};
      throw new Error(name);
    },
    Element,
    document:{addEventListener:(type,callback)=>listen(documentListeners,type,callback),removeEventListener:(type,callback)=>unlisten(documentListeners,type,callback)},
    window,
  });
  const render = () => { cursor = 0; effects = []; tree = m.exports.default(props); for (const effect of effects) effect(); return tree; };
  const nodes = () => { const all = []; const visit = node => { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return; all.push(node); visit(node.props?.children); }; visit(tree); return all; };
  const find = predicate => nodes().find(predicate);
  const confirmPayment = () => { const step=find(n=>n.type===Payment); assert.ok(step,'payment precedes the application form');step.props.onPaid(payment);render(); };
  return {render,find,confirmPayment,payment,storage,window,windowListeners,documentListeners,linkTarget:new Element(true),buttonTarget:new Element(false),get cleared(){return cleared;},change:(id,value)=>{find(n=>n.props?.id===id).props.onChange({target:{value}});render();}};
}

function mountGate(window) {
  let state,effect;
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{state=initial;return[state,value=>{state=value;}];},useRef:initial=>({current:initial}),useEffect:callback=>{effect=callback;},Suspense:()=>null};
  const source=fs.readFileSync(path.join(__dirname,'../src/portal/PortalGate.web.tsx'),'utf8').replace('function GateContent(','export function GateContent(');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const m={exports:{}};
  vm.runInNewContext(compiled,{module:m,exports:m.exports,window,Event,URLSearchParams,__DEV__:true,
    require(name){if(name==='react')return {...react,default:react};if(name==='./previewPolicy')return {isPortalPreviewPath:()=>false};return {__esModule:true,default:()=>null};}});
  m.exports.GateContent({children:null});const cleanup=effect();
  return {get path(){return state;},cleanup};
}

test('standalone application requires payment and prevents duplicate submission', async () => {
  let resolve, calls=0, payload;const busyChanges=[];
  const h=harness(body=>{calls++;payload=body;return new Promise(done=>{resolve=done;});},{onBusyChange:value=>busyChanges.push(value)});
  h.render();assert.equal(h.find(n=>n.type==='form'),undefined);assert.equal(h.find(n=>n.props?.role==='dialog'),undefined);
  assert.equal(h.windowListeners.size,0);assert.equal(h.documentListeners.size,0);
  h.find(n=>n.props?.onPaid).props.onBusyChange(true);assert.equal(busyChanges.at(-1),true,'payment creation lock reaches the pricing journey');
  h.confirmPayment();h.change('daycareName','Stable Daycare');
  const submit=h.find(n=>n.type==='form').props.onSubmit;
  const pending=submit({preventDefault(){}});h.render();
  assert.equal(h.find(n=>n.type==='form').props['aria-busy'],true);
  assert.equal(h.find(n=>n.type==='fieldset').props.disabled,true);
  let unloadPrevented=false;
  const unload={preventDefault(){unloadPrevented=true;},returnValue:'unchanged'};
  h.windowListeners.get('beforeunload')(unload);assert.equal(unloadPrevented,true);assert.equal(unload.returnValue,'');
  let blockedLinks=0;
  h.documentListeners.get('click')({target:h.linkTarget,preventDefault(){blockedLinks++;}});
  h.documentListeners.get('click')({target:h.buttonTarget,preventDefault(){blockedLinks++;}});
  assert.equal(blockedLinks,1,'only navigation links are blocked while submitting');
  await submit({preventDefault(){}});assert.equal(calls,1);
  assert.equal(payload.payment_intent_id,h.payment.id);assert.equal(payload.payment_token,h.payment.token);
  assert.equal(payload.adminEmail,h.payment.email);assert.equal(payload.requestedPlan,'premium');assert.equal(payload.billingCycle,'six_month');
  resolve({application:{id:1}});await pending;h.render();
  assert.equal(h.find(n=>n.type==='form'),undefined);assert.equal(h.cleared,1);
  assert.equal(h.windowListeners.size,0);assert.equal(h.documentListeners.size,0);
  assert.ok(h.find(n=>n.type==='a'&&n.props.href==='/application-status'));
});

test('server and network errors preserve the application draft and verified payment', async () => {
  for(const failure of [{response:{data:{error:'Application already pending'}}},new Error('Network Error')]) {
    const h=harness(async()=>{throw failure;});h.render();h.confirmPayment();h.change('daycareName','Preserved Daycare');
    await h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
    assert.equal(h.find(n=>n.props?.id==='daycareName').props.value,'Preserved Daycare');
    assert.equal(h.find(n=>n.props?.id==='adminEmail').props.value,h.payment.email);
    assert.equal(h.find(n=>n.props?.id==='adminEmail').props.readOnly,true);
    assert.ok(h.find(n=>n.props?.role==='alert'));assert.equal(h.find(n=>n.type==='fieldset').props.disabled,false);assert.equal(h.cleared,0);
    assert.equal(h.windowListeners.size,0);assert.equal(h.documentListeners.size,0);
  }
});

test('a fresh application uses the saved daycare name and the paid email', () => {
  const h=harness(async()=>({}));h.storage.set('ankelba_daycare_name','Name from homepage');h.render();h.confirmPayment();
  assert.equal(h.find(n=>n.props?.id==='daycareName').props.value,'Name from homepage');
  assert.equal(h.find(n=>n.props?.id==='adminEmail').props.value,h.payment.email);
  assert.equal(h.find(n=>n.props?.id==='adminPassword').props.value,'');
});

test('portal route events preserve a pending application and allow navigation after submission settles',async()=>{
  let finish;
  const h=harness(()=>new Promise(resolve=>{finish=resolve;}));h.render();h.confirmPayment();
  const gate=mountGate(h.window);
  const pending=h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
  h.window.history.pushState({},'','/application-status');h.window.dispatchEvent(new Event('popstate'));
  assert.equal(gate.path,'/pricing','the submitted form remains mounted');
  assert.equal(h.window.location.pathname+h.window.location.search,'/pricing?from=pricing','rejected route restores the full previous URL');
  assert.ok(h.find(n=>n.type==='form'));
  finish({application:{id:2}});await pending;h.render();
  h.window.history.pushState({},'','/application-status');h.window.dispatchEvent(new Event('popstate'));
  assert.equal(gate.path,'/application-status');assert.equal(h.window.location.pathname,'/application-status');
  gate.cleanup();assert.equal(h.windowListeners.size,0);
});
