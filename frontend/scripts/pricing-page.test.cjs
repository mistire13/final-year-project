'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const subscriptions={exports:{}};
vm.runInNewContext(compile('../src/portal/subscriptions.ts'),{module:subscriptions,exports:subscriptions.exports});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const catalog=[
  {code:'standard',name:'Standard',description:'A growing daycare',max_children:50,trial_days:0,monthly_price:'200',six_month_price:'1200',annual_price:'2400',available:true,version:3},
  {code:'premium',name:'Premium',description:'A larger center',max_children:150,trial_days:0,monthly_price:'400',six_month_price:'2000',annual_price:'3600',available:true,version:4},
];
function textOf(node){if(node===false||node===true||node==null)return '';if(Array.isArray(node))return node.map(textOf).join('');return node&&typeof node==='object'?textOf(node.props?.children):String(node);}

function harness(packages=async()=>catalog,props={}){
  const slots=[],choices=[];let cursor=0,effects=[],tree;
  const react={
    createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
    useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>value!==old.deps[j])){old?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=effect();});}},
  };
  const m={exports:{}};
  vm.runInNewContext(compile('../src/landing/PricingPage.web.tsx'),{module:m,exports:m.exports,
    require(name){
      if(name==='react')return {...react,default:react};
      if(name==='motion/react')return {motion:new Proxy({},{get:(_target,key)=>String(key)}),useReducedMotion:()=>true};
      if(name==='../portal/api')return {portalApi:{packages},apiError:error=>error.message};
      if(name==='../portal/subscriptions')return subscriptions.exports;
      if(name==='../portal/ui.web')return {Icon:()=>null};
      if(name.endsWith('.css'))return {};
      if(name.endsWith('.png'))return 'synthetic-logo';
      if(name==='./HeroAtmosphere.web')return {__esModule:true,default:()=>null};
      if(name==='./PublicNavMenu.web')return {__esModule:true,default:()=>null};
      throw Error(name);
    }});
  const nodes=(from=tree)=>{const all=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;all.push(node);visit(node.props?.children);};visit(from);return all;};
  const render=()=>{cursor=0;effects=[];tree=m.exports.default({onChoose:(offer,cycle)=>choices.push({offer,cycle}),...props});for(const effect of effects)effect();return tree;};
  const button=label=>nodes().find(node=>node.type==='button'&&textOf(node).trim()===label);
  const click=label=>{const target=button(label);assert.ok(target,`missing action ${label}`);assert.notEqual(target.props.disabled,true,`${label} is unavailable`);target.props.onClick();render();};
  return {render,nodes,button,click,choices,text:()=>textOf(tree)};
}

test('package choice precedes three full billing-period comparison cards',async()=>{
  const h=harness();h.render();await turn();h.render();
  assert.equal(h.nodes().filter(node=>node.type==='article').length,2);
  assert.equal(h.button('Continue with Monthly'),undefined);
  assert.equal(h.choices.length,0);
  h.click('Choose Premium');
  const cards=h.nodes().filter(node=>node.type==='article');
  assert.equal(cards.length,3);
  assert.deepEqual(cards.map(card=>h.nodes(card).find(node=>node.type==='h3')?.props.children[0]),['Monthly','6 months','Annual']);
  assert.ok(cards.every(card=>h.nodes(card).some(node=>node.type==='ul')),'periods provide comparison details');
  assert.equal(h.nodes().find(node=>node.props?.type==='radio'||node.props?.role==='radio'||node.props?.role==='radiogroup'),undefined);
  h.click('Continue with Annual');
  assert.equal(h.choices.length,1);assert.equal(h.choices[0].offer,catalog[1]);assert.equal(h.choices[0].cycle,'annual');
  h.click('Change package');assert.ok(h.button('Choose Standard'));
});

test('cards lead with configured monthly prices and period totals use real monthly comparisons',async()=>{
  const h=harness();h.render();await turn();h.render();
  const packages=h.nodes().filter(node=>node.type==='article');
  const monthlyPrices=packages.map(card=>textOf(h.nodes(card).find(node=>node.props?.className==='pricing-package-price')));
  assert.ok(monthlyPrices[0].includes('200ETB / month'));
  assert.ok(monthlyPrices[1].includes('400ETB / month'));
  assert.ok(monthlyPrices[0].includes('Up to 50 active children'));
  assert.equal(h.text().includes('little worlds'),false);
  h.click('Choose Standard');
  assert.equal(h.nodes().filter(node=>node.type==='s').length,0,'no invented original price for an undiscounted package');
  assert.ok(h.text().includes('2,400'));assert.ok(!h.text().includes('Save 30%'));
  h.click('Change package');h.click('Choose Premium');
  const annual=h.nodes().find(node=>node.type==='article'&&node.props['aria-labelledby']==='period-annual');
  assert.ok(textOf(annual).includes('3,600'));assert.ok(textOf(annual).includes('Save 25%'));
  assert.equal(textOf(h.nodes(annual).find(node=>node.type==='s')),'4,800 ETB');
  assert.ok(textOf(annual).includes('Compared with monthly billing'));
});

test('unconfigured, invalid and unavailable prices cannot advance to payment',async()=>{
  for(const offer of [
    {...catalog[0],monthly_price:null,six_month_price:'',annual_price:'invalid'},
    {...catalog[0],monthly_price:'0',six_month_price:'-5',annual_price:null},
    {...catalog[0],available:false},
  ]){
    const h=harness(async()=>[offer]);h.render();await turn();h.render();h.click('Choose Standard');
    for(const name of ['Monthly','6 months','Annual'])assert.equal(h.button(`${name} unavailable`).props.disabled,true);
    assert.equal(h.choices.length,0);assert.equal(h.nodes().find(node=>node.type==='s'),undefined);
  }
});

test('catalog failures have a working retry and checkout keeps the selected payment summary',async()=>{
  let attempts=0;
  const h=harness(async()=>{if(++attempts===1)throw Error('Temporary connection issue');return catalog;});
  h.render();await turn();h.render();assert.ok(h.nodes().find(node=>node.props?.role==='alert'));
  h.click('Try again');await turn();h.render();assert.equal(attempts,2);assert.ok(h.button('Choose Standard'));
  let requests=0;
  const checkout=harness(async()=>{requests++;return catalog;},{checkout:'Payment form slot',selectedTerms:{offer:catalog[1],cycle:'annual'},checkoutStage:'application'});
  checkout.render();await turn();checkout.render();
  assert.equal(requests,0,'catalog refresh must not replace payment-bound terms');
  assert.ok(checkout.text().includes('Daycare application'));
  assert.ok(checkout.text().includes('3,600'));assert.ok(checkout.text().includes('Payment form slot'));
  assert.equal(checkout.button('Choose Standard'),undefined);
  assert.equal(checkout.nodes().find(node=>node.props?.role==='dialog'),undefined);
});

test('application success moves focus to the updated checkout heading',()=>{
  const props={checkout:'Application form slot',selectedTerms:{offer:catalog[0],cycle:'monthly'},checkoutStage:'application'};
  const h=harness(async()=>catalog,props);h.render();
  let focusCalls=0,scrollCalls=0;
  h.nodes().find(node=>node.props?.id==='pricing-content-title').props.ref.current={focus(){focusCalls++;}};
  h.nodes().find(node=>node.props?.id==='pricing-content').props.ref.current={scrollIntoView(){scrollCalls++;}};
  props.checkoutStage='submitted';h.render();
  assert.equal(focusCalls,1);assert.equal(scrollCalls,1);
  assert.ok(h.text().includes('Application submitted'));
});

test('public matrix compares manual and Plus tools using server flags and configured capacity',async()=>{
  const offers=catalog.map(offer=>({...offer,name:offer.code==='premium'?'Plus':'Standard',max_children:offer.code==='standard'?72:140,features:{shop:offer.code==='premium',business_analytics:offer.code==='premium',billing_automation:offer.code==='premium',staff_scheduling:false}}));
  const h=harness(async()=>offers);h.render();await turn();h.render();
  const table=h.nodes().find(node=>node.type==='table');assert.ok(table);
  const rows=h.nodes(table).filter(node=>node.type==='tr');
  const find=label=>rows.find(node=>textOf(node).includes(label));
  assert.match(textOf(find('Manual invoices, payment records and receipts')),/IncludedIncluded/);
  assert.match(textOf(find('Shop catalogue, categories, stock and new orders')),/Not includedIncluded/);
  assert.match(textOf(find('Active child limit')),/72 active children140 active children/);
  assert.match(textOf(find('Repeating attendance\/pickup shifts')),/Not includedNot included/,'disabled capability is not advertised');
  assert.match(h.text(),/Email reminders require configured delivery and parent consent/);
  assert.doesNotMatch(textOf(table),/profit|learning portfolios|surveys|weekly invoices/i);
  assert.ok(h.nodes(table).filter(node=>node.type==='th').every(node=>['row','col'].includes(node.props.scope)));
});
