'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const recoveryModule={exports:{}};
vm.runInNewContext(compile('../src/landing/subscriptionRecovery.ts'),{module:recoveryModule,exports:recoveryModule.exports,URL,URLSearchParams});

function harness({href='https://ankelba.example/pricing',saved}={}) {
  const slots=[],storage=new Map(Object.entries(saved||{})),paths=[],events=[];
  const Pricing=function PricingPage(){},Checkout=function EnrollmentCheckout(){};
  let cursor=0,effects=[],tree;
  const react={
    createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>value!==old[j])){slots[i]=deps;effects.push(effect);}},
    useCallback(callback,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>value!==old.deps[j]))slots[i]={callback,deps};return slots[i].callback;},
  };
  const m={exports:{}};
  vm.runInNewContext(compile('../src/landing/PricingJourney.web.tsx'),{module:m,exports:m.exports,URL,
    PopStateEvent:class {constructor(type){this.type=type;}},
    window:{location:{href,origin:new URL(href).origin},history:{replaceState:(_state,_title,path)=>paths.push(path)},dispatchEvent:event=>events.push(event.type),sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}},
    require(name){
      if(name==='react')return {...react,default:react};
      if(name==='./PricingPage.web')return {__esModule:true,default:Pricing};
      if(name==='./EnrollmentCheckout.web')return {__esModule:true,default:Checkout};
      if(name==='./subscriptionRecovery')return recoveryModule.exports;
      throw Error(name);
    }});
  const render=()=>{cursor=0;effects=[];tree=m.exports.default();for(const effect of effects)effect();return tree.props;};
  return {render,storage,paths,events};
}

test('payment session terms replace current catalog selection and prevent changing a bound payment', () => {
  const h=harness();let props=h.render();
  assert.equal(props.checkout,undefined);
  const offer={code:'standard',name:'Standard',monthly_price:'200',version:9};
  props.onChoose(offer,'monthly');props=h.render();
  assert.equal(props.checkout.props.selection.offer,offer);
  assert.equal(typeof props.onBackToPlans,'function');
  const confirmed={id:'synthetic-id',token:'synthetic-token',status:'verified',terms:{code:'premium',name:'Premium locked',price:'1200',billing_cycle:'six_month',max_children:150,version:3}};
  props.checkout.props.onSession(confirmed);props=h.render();
  assert.equal(props.onBackToPlans,undefined,'an existing payment cannot be detached from its terms');
  assert.equal(props.selectedTerms.offer.code,'premium');
  assert.equal(props.selectedTerms.offer.version,3);
  assert.equal(props.selectedTerms.offer.six_month_price,'1200');
  assert.equal(props.selectedTerms.offer.monthly_price,null);
  assert.equal(props.selectedTerms.cycle,'six_month');
  props.checkout.props.onStage('application');props=h.render();
  assert.equal(props.checkoutStage,'application');
});

test('application payment email recovery opens checkout and scrubs its secret', () => {
  const id='09e688c6-8e1d-4b3a-81c6-a80b0c09b123',token='S'.repeat(43);
  const h=harness({href:`https://ankelba.example/?from=email&subscription_resume=${id}#token=${token}`});
  h.render();const props=h.render();
  assert.equal(props.checkout.props.resume.id,id);assert.equal(props.checkout.props.resume.token,token);
  assert.equal(props.onBackToPlans,undefined);
  assert.equal(h.paths[0],'/pricing?from=email');assert.ok(!h.paths.some(path=>path.includes(token)));
  const retained=JSON.parse(h.storage.get('ankelba_payment_resume'));
  assert.equal(retained.id,id);assert.equal(retained.token,token,'scrubbing the URL must not lose the rotated recovery token');
  const reload=harness({saved:Object.fromEntries(h.storage)});reload.render();
  assert.equal(reload.render().checkout.props.resume.token,token,'reload can retry after a failed recovery request');
});

test('saved application payment resumes while renewal recovery goes to the subscription portal', () => {
  const saved=harness({saved:{ankelba_application_payment:JSON.stringify({id:'saved-payment',token:'saved-secret'})}});
  saved.render();assert.equal(saved.render().checkout.props.resume.id,'saved-payment');
  const id='09e688c6-8e1d-4b3a-81c6-a80b0c09b123',token='R'.repeat(43);
  const renewal=harness({href:`https://ankelba.example/?subscription_resume=${id}#token=${token}&purpose=renewal`});
  renewal.render();assert.equal(renewal.render().checkout,undefined);
  assert.equal(renewal.paths.at(-1),'/admin/subscription');
  assert.equal(JSON.parse(renewal.storage.get('ankelba_renewal_resume')).token,token);
  assert.deepEqual(renewal.events,['popstate']);
});

test('explicit restart clears a restored intent before the customer chooses a new package', () => {
  const h=harness({saved:{ankelba_application_payment:JSON.stringify({id:'expired-payment',token:'expired-secret'})}});
  h.render();let props=h.render();
  props.checkout.props.onSession({id:'expired-payment',token:'expired-secret',status:'rejected',terms:{code:'standard',name:'Standard',price:'100',billing_cycle:'monthly',max_children:50,version:1}});
  props=h.render();assert.equal(props.checkout.props.resume.id,'expired-payment');
  props.checkout.props.onSession(null);props=h.render();
  assert.equal(props.checkout,undefined);assert.equal(props.selectedTerms,undefined);
  const freshOffer={code:'premium',name:'Premium',annual_price:'3600',version:7};
  props.onChoose(freshOffer,'annual');props=h.render();
  assert.equal(props.checkout.props.resume,null,'old recovery credentials must not restore the rejected payment again');
  assert.equal(props.checkout.props.selection.offer,freshOffer);assert.equal(props.checkout.props.selection.cycle,'annual');
});

test('payment creation locks plan changes until the request finishes', () => {
  const h=harness();let props=h.render();
  props.onChoose({code:'standard',name:'Standard',monthly_price:'200'},'monthly');props=h.render();
  assert.equal(typeof props.onBackToPlans,'function');
  props.checkout.props.onBusyChange(true);props=h.render();
  assert.equal(props.onBackToPlans,undefined,'cannot leave a checkout while its payment intent is being created');
  props.checkout.props.onBusyChange(false);props=h.render();
  assert.equal(typeof props.onBackToPlans,'function','a failed or cancelled request restores plan navigation');
  props.onBackToPlans();assert.equal(h.render().checkout,undefined);
});
