'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function paymentHarness(api, paid, selection, props = {}) {
  api={publicPaymentSettings:async()=>({accounts:[{provider:'cbe',institution:'Commercial Bank of Ethiopia',account_holder:'Synthetic recipient',account_number:'1000000000001'}]}),...api};
  const slots = [], storage = new Map();
  let cursor = 0, pendingEffects = [], tree;
  const react = {
    Fragment: Symbol('fragment'),
    createElement(type, props, ...children) { return {type,props:{...props,children}}; },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = {current:initial}; return slots[index]; },
    useEffect(effect, deps) { const index = cursor++; const old = slots[index]; if (!old || deps.some((v,i) => v !== old[i])) { slots[index] = deps; pendingEffects.push(effect); } },
  };
  const cards = function PackageCards() {}, receipt = function ReceiptReference() {}, lottie = function LottieVerified() {};
  const source = fs.readFileSync(path.join(__dirname, '../src/landing/SubscriptionPayment.web.tsx'), 'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const moduleObject = {exports:{}};
  vm.runInNewContext(compiled, {
    module: moduleObject,
    exports: moduleObject.exports,
    setInterval: (...args) => {
      const t = setInterval(...args);
      if (t && typeof t.unref === 'function') t.unref();
      return t;
    },
    clearInterval,
    setTimeout: (...args) => {
      const t = setTimeout(...args);
      if (t && typeof t.unref === 'function') t.unref();
      return t;
    },
    clearTimeout,
    Date,
    window: {
      sessionStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
      },
    },
    require(name) {
      if (name === 'react') return react;
      if (name === '../portal/api') return { portalApi: api, apiError: e => e.message };
      if (name === '../portal/PackageCards.web') return cards;
      if (name === '../portal/ReceiptReference.web') return receipt;
      if (name === './LottieVerified.web') return { default: lottie };
      if (name === '../portal/subscriptions') return { priceLabel: (price, cycle) => `${price} ETB ${cycle}` };
      throw new Error(name);
    },
  });
  function render() { cursor=0; pendingEffects=[]; tree=moduleObject.exports.default({onPaid:paid,selection,...props}); for(const effect of pendingEffects)effect(); }
  function nodes() { const output=[]; const visit=node=>{if(Array.isArray(node))return node.forEach(visit); if(!node || typeof node !== 'object')return;output.push(node);visit(node.props?.children);};visit(tree);return output; }
  return {render,nodes,cards,storage,find:fn=>nodes().find(fn)};
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('payment creation uses the package and period chosen on pricing page', async () => {
  const offer={code:'premium',name:'Premium',max_children:150,annual_price:'2000'};
  let created;
  const api={createPaymentIntent:async body=>{created=body;return {id:'selected',token:'secret',status:'pending',terms:{recipient_provider:'cbe',code:'premium',billing_cycle:'annual'}};}};
  const h=paymentHarness(api,()=>{},{offer,cycle:'annual'});
  h.render();await turn();h.render();
  assert.equal(h.find(node=>node.type==='input'&&node.props.type==='radio'),undefined);
  h.find(node=>node.type==='input'&&node.props.type==='email').props.onChange({target:{value:'director@example.org'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  assert.equal(created.package_code,'premium');assert.equal(created.billing_cycle,'annual');
  const missing=paymentHarness(api,()=>{});missing.render();
  assert.equal(missing.find(node=>node.type==='form'),undefined);
});

test('repeated submits cannot overlap payment creation or verification', async () => {
  const offer={code:'standard',name:'Standard',max_children:50,monthly_price:'200'};
  const intent={id:'one-session',token:'secret',status:'pending',terms:{recipient_provider:'cbe',code:'standard',billing_cycle:'monthly',price:'200'}};
  let creations=0,verifications=0,statusChecks=0,finishCreate,finishVerify;const busyChanges=[];
  const api={
    createPaymentIntent:()=>{creations++;return new Promise(resolve=>{finishCreate=resolve;});},
    verifyPaymentIntent:()=>{verifications++;return new Promise(resolve=>{finishVerify=resolve;});},
    paymentIntentStatus:async()=>{statusChecks++;return intent;},
  };
  const h=paymentHarness(api,()=>{},{offer,cycle:'monthly'},{onBusyChange:value=>busyChanges.push(value)});h.render();await turn();h.render();
  h.find(node=>node.type==='input'&&node.props.type==='email').props.onChange({target:{value:'director@example.invalid'}});h.render();
  const start=h.find(node=>node.type==='form').props.onSubmit;
  const first=start({preventDefault(){}}),second=start({preventDefault(){}});
  assert.equal(creations,1,'synchronous duplicate submission must share a single creation');
  h.render();assert.equal(busyChanges.at(-1),true,'delayed payment creation locks the surrounding plan navigation');
  finishCreate(intent);await Promise.all([first,second]);h.render();
  assert.equal(busyChanges.at(-1),false);
  const verify=h.find(node=>node.type==='form').props.onSubmit;
  verify({preventDefault(){}});verify({preventDefault(){}});
  h.find(node=>node.type==='button'&&node.props.children.includes('Refresh payment status')).props.onClick();
  assert.equal(verifications,1,'reference verification cannot be submitted twice');
  assert.equal(statusChecks,0,'a stale refresh action cannot race with verification');
  finishVerify({...intent,status:'verification_pending'});await turn();h.render();
  assert.ok(h.find(node=>node.props?.role==='status'));
});

test('restoring payment does not signal an empty session before server recovery completes', async () => {
  let resolveStatus;const sessions=[];
  const api={paymentIntentStatus:()=>new Promise(resolve=>{resolveStatus=resolve;})};
  const resume={id:'recovered-payment',token:'recovery-secret'};
  const h=paymentHarness(api,()=>{},undefined,{resume,onSession:value=>sessions.push(value)});
  h.render();h.render();
  assert.equal(sessions.includes(null),false,'initial null would unlock plan changes during payment recovery');
  resolveStatus({id:resume.id,status:'verified',terms:{recipient_provider:'cbe',code:'standard',billing_cycle:'monthly',price:'200'}});
  await turn();h.render();
  assert.equal(sessions.at(-1).id,resume.id);assert.equal(sessions.at(-1).token,resume.token);
});

test('a failed payment recovery can retry without starting or discarding a payment', async () => {
  let requests=0;const sessions=[];
  const resume={id:'recover-again',token:'retained-secret'};
  const api={paymentIntentStatus:async(id,token)=>{
    requests++;assert.equal(id,resume.id);assert.equal(token,resume.token);
    if(requests===1)throw Error('Temporary connection issue');
    return {id,status:'verified',terms:{recipient_provider:'cbe',code:'premium',billing_cycle:'annual',price:'3600',version:4}};
  }};
  const h=paymentHarness(api,()=>{},undefined,{resume,onSession:value=>sessions.push(value)});
  h.render();await turn();h.render();
  assert.equal(h.find(node=>node.type==='form'),undefined);
  assert.ok(h.find(node=>node.props?.role==='alert'));
  h.find(node=>node.type==='button'&&node.props.children.includes('Retry payment recovery')).props.onClick();
  h.render();await turn();h.render();
  assert.equal(requests,2);assert.equal(sessions.includes(null),false);
  assert.equal(sessions.at(-1).terms.price,'3600');assert.equal(sessions.at(-1).token,resume.token);
  assert.ok(h.find(node=>node.type==='button'&&node.props.children.includes('Continue to application')));
});

test('a deleted saved payment offers an explicit return to pricing without silently clearing recovery',async()=>{
  for(const resume of [null,{id:'deleted-payment',token:'retained-secret'}]){
    const sessions=[];
    const missing=Object.assign(Error('Payment session could not be found.'),{response:{status:404}});
    const h=paymentHarness({paymentIntentStatus:async()=>{throw missing;}},()=>{},undefined,{resume,onSession:value=>sessions.push(value)});
    h.storage.set('ankelba_application_payment',JSON.stringify({id:'deleted-payment',token:'retained-secret',status:'pending'}));
    h.render();await turn();h.render();
    assert.ok(h.find(node=>node.props?.role==='alert'));
    assert.equal(h.storage.has('ankelba_application_payment'),true);
    assert.equal(sessions.includes(null),false);
    h.find(node=>node.type==='button'&&node.props.children.includes('Return to pricing')).props.onClick();h.render();
    assert.equal(h.storage.has('ankelba_application_payment'),false);assert.equal(sessions.at(-1),null);
  }
});

test('application requires verified payment and survives a pending verification', async () => {
  const offer={code:'premium',name:'Premium',max_children:150,monthly_price:'100'};
  const intent={id:'session-id',token:'secret',status:'pending',recipient:'account',terms:{recipient_provider:'cbe',code:'premium',name:'Premium',price:'100',billing_cycle:'monthly',max_children:150}};
  let created, verified, paid, currentStatus='verification_pending';
  const api={packages:async()=>[offer],createPaymentIntent:async body=>{created=body;return intent;},verifyPaymentIntent:async(id,body)=>{verified={id,body};return {...intent,status:'verification_pending',message:'Telebirr verification is temporarily unavailable. Do not pay again.'};},paymentIntentStatus:async()=>({...intent,status:currentStatus})};
  const h=paymentHarness(api,value=>{paid=value;},{offer,cycle:'monthly'});
  h.render(); await turn(); h.render();
  h.find(node=>node.type==='input' && node.props.type==='email').props.onChange({target:{value:'admin@example.org'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  assert.equal(created.package_code,'premium');assert.equal(created.billing_cycle,'monthly');assert.equal(created.email,'admin@example.org');
  h.find(node=>node.type==='input' && node.props.placeholder==="https://mbreciept.cbe.com.et/…").props.onChange({target:{value:'https://mbreciept.cbe.com.et/PAY123'}});h.render();
  h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await turn();h.render();
  assert.equal(verified.id,'session-id');assert.equal(verified.body.reference,'https://mbreciept.cbe.com.et/PAY123');
  assert.ok(h.find(node=>node.props?.role==='status' && node.props.children.includes('Telebirr verification is temporarily unavailable. Do not pay again.')),'the returned failure must stay visible next to Verify payment');
  assert.equal(h.find(node=>node.type==='button' && node.props.children.includes('Continue to application')),undefined);
  currentStatus='verified';h.find(node=>node.type==='button' && node.props.children.includes('Refresh payment status')).props.onClick();await turn();h.render();
  h.find(node=>node.type==='button' && node.props.children.includes('Continue to application')).props.onClick();
  assert.equal(paid.status,'verified');assert.equal(paid.token,'secret');assert.equal(paid.email,'admin@example.org');
});

test('a rejected session can be restarted after checking the current server status', async () => {
  const offer={code:'standard',name:'Standard',max_children:50,monthly_price:'100'};
  const intent={id:'rejected-session',token:'secret',status:'rejected',recipient:'account',terms:{recipient_provider:'cbe',code:'standard',name:'Standard',price:'100',billing_cycle:'monthly',max_children:50}};
  let statusChecks=0;const sessions=[];
  const api={packages:async()=>[offer],createPaymentIntent:async()=>intent,paymentIntentStatus:async()=>{statusChecks++;return intent;}};
  const h=paymentHarness(api,()=>{},{offer,cycle:'monthly'},{onSession:value=>sessions.push(value)});
  h.render();await turn();h.render();
  h.find(node=>node.type==='input' && node.props.type==='email').props.onChange({target:{value:'admin@example.org'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  const button=()=>h.find(node=>node.type==='button' && node.props.children.includes('Start a new payment session'));
  assert.equal(button().props.disabled,true);
  h.find(node=>node.type==='input' && node.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();
  button().props.onClick();await turn();h.render();
  assert.equal(statusChecks,1);
  assert.equal(h.storage.has('ankelba_application_payment'),false);
  assert.ok(h.find(node=>node.type==='input' && node.props.type==='email'));
  assert.equal(sessions.at(-1),null,'only an explicitly completed restart releases payment-bound terms');
});

test('restart preserves a payment that was confirmed while the screen was stale', async () => {
  const offer={code:'standard',name:'Standard',max_children:50,monthly_price:'100'};
  const intent={id:'stale-session',token:'secret',status:'rejected',recipient:'account',terms:{recipient_provider:'cbe',code:'standard',name:'Standard',price:'100',billing_cycle:'monthly',max_children:50}};
  const api={packages:async()=>[offer],createPaymentIntent:async()=>intent,paymentIntentStatus:async()=>({...intent,status:'verified'})};
  const h=paymentHarness(api,()=>{},{offer,cycle:'monthly'});
  h.render();await turn();h.render();
  h.find(node=>node.type==='input' && node.props.type==='email').props.onChange({target:{value:'admin@example.org'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  h.find(node=>node.type==='input' && node.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();
  h.find(node=>node.type==='button' && node.props.children.includes('Start a new payment session')).props.onClick();await turn();h.render();
  assert.equal(JSON.parse(h.storage.get('ankelba_application_payment')).status,'verified');
  assert.ok(h.find(node=>node.type==='button' && node.props.children.includes('Continue to application')));
});

test('countdown and verified celebration preserve the payment session without an unsafe start-over shortcut', async () => {
  const offer={code:'standard',name:'Standard',max_children:50,monthly_price:'200'};
  const tenMinutesFuture = new Date(Date.now() + 600000).toISOString();
  const intent={id:'live-timer-session',token:'secret',status:'pending',recipient:'0911234567',recipient_name:'Ankelba Daycare Platform',recipient_institution:'Telebirr',expires_at:tenMinutesFuture,terms:{recipient_provider:'cbe',code:'standard',name:'Standard',price:'200',billing_cycle:'monthly',max_children:50}};
  const sessions=[];
  const api={
    createPaymentIntent:async()=>intent,
    verifyPaymentIntent:async()=>({...intent,status:'verified'}),
    paymentIntentStatus:async()=>({...intent,status:'verified'}),
  };
  const h=paymentHarness(api,()=>{},{offer,cycle:'monthly'},{onSession:v=>sessions.push(v)});
  h.render();await turn();h.render();
  h.find(node=>node.type==='input' && node.props.type==='email').props.onChange({target:{value:'director@example.com'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await turn();h.render();h.render();

  // Verify countdown badge is present
  const timerNode = h.find(node=>node.props?.role==='timer');
  assert.ok(timerNode, 'Timer badge must be rendered during active session');

  // An active session must not be discarded; a transfer may already exist.
  const cancelButton = h.find(node=>node.type==='button' && node.props.children.includes('Change package / Start over'));
  assert.equal(cancelButton, undefined);

  // Verify verification triggers celebration popup
  h.find(node=>node.type==='input' && node.props.placeholder==="https://mbreciept.cbe.com.et/…").props.onChange({target:{value:'https://mbreciept.cbe.com.et/PAY12345'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await turn();h.render();

  const celebrationModal = h.find(node=>node.props?.role==='dialog');
  assert.ok(celebrationModal, 'Celebration popup dialog must appear upon verified status');

  assert.equal(sessions.at(-1).status, 'verified');
  assert.equal(JSON.parse(h.storage.get('ankelba_application_payment')).status, 'verified');
});

test('Bank of Abyssinia selection is captured before payment and verification sends its receipt suffix',async()=>{
  const offer={code:'standard',name:'Standard',monthly_price:'200'};let created,proof;
  const intent={id:'boa-test',token:'synthetic',status:'pending',provider:'abyssinia',terms:{recipient_provider:'abyssinia',code:'standard',price:'200',billing_cycle:'monthly'}};
  const h=paymentHarness({publicPaymentSettings:async()=>({accounts:[{provider:'abyssinia',institution:'Bank of Abyssinia',account_holder:'Synthetic BOA',account_number:'2000000000002'}]}),
    createPaymentIntent:async body=>{created=body;return intent;},verifyPaymentIntent:async(id,body)=>{proof=body;return {...intent,status:'verification_pending',message:'Awaiting bank review.'};}},()=>{},{offer,cycle:'monthly'});
  h.render();await turn();h.render();
  assert.equal(h.find(node=>node.type==='select').props.value,'abyssinia');
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  assert.equal(created.provider,'abyssinia');assert.equal(h.find(node=>node.type==='select'),undefined,'bank is fixed once a payment session exists');
  const suffix=h.find(node=>node.type==='input'&&node.props.inputMode==='numeric');assert.equal(suffix.props.required,true);assert.equal(suffix.props.pattern,'[0-9]{5}');
  suffix.props.onChange({target:{value:'12345'}});h.render();
  h.find(node=>node.type==='input'&&node.props.placeholder==='Bank of Abyssinia reference').props.onChange({target:{value:'FT1234567890'}});h.render();
  h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await turn();h.render();
  assert.equal(proof.provider,'abyssinia');assert.equal(proof.suffix,'12345');assert.equal(proof.reference,'FT1234567890');
});

test('CBE signup accepts a full receipt link without a suffix or screenshot control',async()=>{
  let proof;
  const intent={id:'cbe-link-test',token:'synthetic',status:'pending',provider:'cbe',terms:{recipient_provider:'cbe',code:'standard',price:'200',billing_cycle:'monthly'}};
  const h=paymentHarness({createPaymentIntent:async()=>intent,verifyPaymentIntent:async(id,body)=>{proof=body;return {...intent,status:'verification_pending'};}},()=>{},{offer:{code:'standard',name:'Standard'},cycle:'monthly'});
  h.render();await turn();h.render();await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  const input=h.find(node=>node.type==='input'&&node.props.type==='url');assert.ok(input);assert.equal(input.props.required,true);
  const pattern=new RegExp(`^(?:${input.props.pattern})$`,'v');
  assert.equal(pattern.test('https://mbreciept.cbe.com.et/ReceiptToken123'),true);
  assert.equal(pattern.test('https://apps.cbe.com.et:100/?id=FT123456789012345678'),true);
  assert.equal(pattern.test('https://example.invalid/ReceiptToken123'),false);
  assert.equal(pattern.test('FT1234567890'),false);
  assert.equal(h.find(node=>node.type==='input'&&node.props.inputMode==='numeric'),undefined);
  assert.equal(h.find(node=>typeof node.type==='function'&&node.type.name==='ReceiptReference'),undefined);
  input.props.onChange({target:{value:'https://apps.cbe.com.et:100/?id=FT123456789012345678'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  assert.deepEqual({...proof},{token:'synthetic',provider:'cbe',reference:'https://apps.cbe.com.et:100/?id=FT123456789012345678'});
});

test('unconfigured banks block creation and a bank configuration request can retry',async()=>{
  let creates=0,attempts=0;
  const h=paymentHarness({publicPaymentSettings:async()=>{if(++attempts===1)throw Error('Bank configuration unavailable');return {accounts:[]};},createPaymentIntent:async()=>{creates++;}},()=>{},{offer:{code:'standard'},cycle:'monthly'});
  h.render();await turn();h.render();
  assert.ok(h.find(node=>node.props?.role==='alert'));
  h.find(node=>node.type==='button'&&node.props.children.includes('Retry payment options')).props.onClick();await turn();h.render();await turn();h.render();
  assert.equal(attempts,2);
  assert.equal(h.find(node=>node.type==='button'&&node.props.children.includes('Continue to payment')).props.disabled,true);
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(creates,0);
});

test('Telebirr can be selected alongside both banks without requesting a bank suffix',async()=>{
  const offer={code:'standard',name:'Standard',monthly_price:'200'};let created,proof;
  const intent={id:'telebirr-test',token:'synthetic',status:'pending',provider:'telebirr',recipient:'251911234567',terms:{recipient_provider:'telebirr',code:'standard',price:'200',billing_cycle:'monthly'}};
  const h=paymentHarness({publicPaymentSettings:async()=>({accounts:[{provider:'cbe',institution:'Commercial Bank of Ethiopia'},{provider:'abyssinia',institution:'Bank of Abyssinia'},{provider:'telebirr',institution:'Telebirr'}]}),
    createPaymentIntent:async body=>{created=body;return intent;},verifyPaymentIntent:async(id,body)=>{proof=body;return {...intent,status:'verification_pending',message:'Awaiting verification.'};}},()=>{},{offer,cycle:'monthly'});
  h.render();await turn();h.render();
  h.find(node=>node.type==='select').props.onChange({target:{value:'telebirr'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  assert.equal(created.provider,'telebirr');
  assert.equal(h.find(node=>node.type==='input'&&node.props.inputMode==='numeric'),undefined);
  h.find(node=>node.type==='input'&&node.props.placeholder==='Enter Telebirr reference').props.onChange({target:{value:'DK-SYNTHETIC-001'}});h.render();
  await h.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();
  assert.deepEqual({...proof},{token:'synthetic',provider:'telebirr',reference:'DK-SYNTHETIC-001'});
});

test('legacy Telebirr sessions are retained for review and cannot silently become bank payments',async()=>{
  let calls=0;
  const h=paymentHarness({verifyPaymentIntent:async()=>{calls++;}},()=>{});
  h.storage.set('ankelba_application_payment',JSON.stringify({id:'legacy',token:'synthetic',status:'verification_pending',terms:{code:'standard',recipient_institution:'Telebirr'},recipient:'0911234567'}));
  h.render();await turn();h.render();
  assert.equal(h.find(node=>node.type==='form'),undefined);assert.equal(calls,0);
  assert.ok(h.find(node=>node.type==='p'&&node.props.children.some(value=>typeof value==='string'&&value.includes('previous payment method'))));
  assert.equal(JSON.parse(h.storage.get('ankelba_application_payment')).recipient,'0911234567');
});
