'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const account={provider:'cbe',institution:'Commercial Bank of Ethiopia',account_holder:'Synthetic Daycare',account_number:'1234567890123'};
const receipt=(patch={})=>({id:'synthetic-request',purpose:'invoice',target_id:7,provider:'cbe',amount:'120.00',currency:'ETB',status:'awaiting_proof',version:2,expected:account,payer_name:'Synthetic Parent',valid_from:'2026-11-01T09:00:00Z',expires_at:'2026-11-20T09:00:00Z',...patch});
function harness(file,imports){
  const slots=[],cleanups=new Map();let cursor=0,effects=[],tree,props={};
  const react={Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]||=( {current:initial});},
    useCallback(callback,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))slots[i]={callback,deps};return slots[i].callback;},
    useEffect(callback,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old[j])){slots[i]=deps;effects.push(()=>{cleanups.get(i)?.();cleanups.set(i,callback());});}},
  };
  const primitives=Object.fromEntries(['Button','Card','Text','Field','Notice','Badge'].map(name=>[name,name]));
  const m={exports:{}};
  vm.runInNewContext(compile(file),{module:m,exports:m.exports,Date,Math,globalThis:{},require(name){if(name==='react')return {...react,default:react};if(name==='react-native')return {View:'View'};if(name.includes('design/System')||name==='./ui.web')return primitives;if(name.endsWith('types/daycarePayments'))return {receiptStatusLabel:value=>value};if(name in imports)return imports[name];throw Error(name);}});
  const nodes=()=>{const all=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;all.push(n);visit(n.props?.children);}visit(tree);return all;};
  const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
  return {render(next=props){props=next;cursor=0;effects=[];tree=m.exports.default(props);effects.forEach(effect=>effect());return tree;},nodes,text:()=>text(tree),find:predicate=>nodes().find(predicate),button:title=>nodes().find(n=>n.type==='Button'&&(n.props.title||text(n))===title),unmount:()=>cleanups.forEach(cleanup=>cleanup?.())};
}
function parent(api={}){return harness('../src/screens/payments/ReceiptPaymentCard.tsx',{'../../api/daycarePayments':{receivingAccounts:async()=>[account],receiptRequests:async()=>[],...api}});}
function portal(api={}){return harness('../src/portal/DaycarePaymentManagement.web.tsx',{'./api':{portalClient:{get:async url=>({data:url.endsWith('settings')?{version:1,accounts:{cbe:{...account,enabled:true}}}:{items:[],total:0}}),...api},apiError:error=>error.message}});}
const props={purpose:'invoice',targetId:7};

test('saved proof survives reload without consulting disabled/unavailable receiving accounts; callback changes do not reload',async()=>{
  let lists=0,accountLoads=0;
  const h=parent({receiptRequests:async()=>{lists++;return [receipt({status:'review_pending',submitted_reference:'https://apps.cbe.com.et/?id=SYNTHETIC'})];},receivingAccounts:async()=>{accountLoads++;throw Error('Unavailable');}});
  h.render({...props,onApplied:()=>{}});await turn();h.render({...props,onApplied:()=>{}});await turn();h.render({...props,onApplied:()=>{}});
  assert.equal(lists,1);assert.equal(accountLoads,0);
  assert.equal(h.find(n=>n.type==='Field').props.value,'https://apps.cbe.com.et/?id=SYNTHETIC');assert.match(h.text(),/Synthetic Daycare/);
});

test('rapid duplicate opens issue one request; lost creation response recovers the saved request',async()=>{
  const pending=deferred();let creates=0,lists=0;
  const h=parent({receiptRequests:async()=>++lists===1?[]:[receipt()],createReceiptRequest:async()=>{creates++;return pending.promise;}});
  h.render(props);await turn();h.render();const open=h.button('Show amount and receiving details');open.props.onPress();open.props.onPress();assert.equal(creates,1);
  pending.reject(Error('Lost response'));await turn();h.render();assert.match(h.text(),/120.00 ETB/);assert.equal(h.button('Show amount and receiving details'),undefined);assert.equal(creates,1);
});

test('in-flight request from the previous target cannot replace the next target or fire its applied callback',async()=>{
  const old=deferred();let applied=0;
  const h=parent({receiptRequests:async(_purpose,id)=>id===7?old.promise:[receipt({id:'new-target',target_id:8,amount:'240.00'})]});
  h.render({...props,onApplied:()=>{applied++;}});h.render({...props,targetId:8,onApplied:()=>{applied++;}});await turn();h.render();old.resolve([receipt({status:'applied'})]);await turn();h.render();
  assert.match(h.text(),/240.00 ETB/);assert.equal(applied,0);
});

test('verification network failure retains entered proof and reloads the saved version before retry',async()=>{
  const calls=[];let gets=0;
  const h=parent({receiptRequests:async()=>[receipt()],verifyDaycareReceipt:async(request,reference)=>{calls.push({version:request.version,reference});throw Error('Lost response');},getReceiptRequest:async()=>{gets++;return receipt({version:3,status:'review_pending',submitted_reference:'SYNTHETIC-PROOF'});}});
  h.render(props);await turn();h.render();h.find(n=>n.type==='Field').props.onChangeText('SYNTHETIC-PROOF');h.render();h.button('Check this receipt').props.onPress();await turn();h.render();
  assert.equal(h.find(n=>n.type==='Field').props.value,'SYNTHETIC-PROOF');assert.equal(gets,1);h.button('Check this receipt').props.onPress();await turn();assert.equal(calls[1].version,3);assert.equal(calls[1].reference,'SYNTHETIC-PROOF');
});

test('checking only offers status refresh; confirmed money offers no new proof or transfer action',async()=>{
  for(const status of ['checking','verified_unapplied','resolved']){
    const h=parent({receiptRequests:async()=>[receipt({status,resolution:status==='resolved'?{evidence_reference:'SYNTHETIC-REFUND'}:undefined})]});
    h.render(props);await turn();h.render();assert.equal(h.button('Check this receipt'),undefined);assert.equal(h.button('Show amount and receiving details'),undefined);
    if(status==='checking')assert.ok(h.button('Refresh saved payment status'));
    if(status==='verified_unapplied')assert.match(h.text(),/do not pay again/);
    if(status==='resolved')assert.match(h.text(),/SYNTHETIC-REFUND/);
  }
});

test('expired proof remains submittable for timing review with warning against a new transfer',async()=>{
  const h=parent({receiptRequests:async()=>[receipt({status:'expired',submitted_reference:'SYNTHETIC-PROOF'})]});h.render(props);await turn();h.render();
  assert.match(h.text(),/payment window ended/);assert.ok(h.button('Check this receipt'));assert.match(h.text(),/Contact your daycare before making a new transfer/);
});

test('applied status refresh calls the latest completion callback exactly once',async()=>{
  let stale=0,latest=0;const pending=deferred();
  const h=parent({receiptRequests:async()=>pending.promise});
  h.render({...props,onApplied:()=>{stale++;}});h.render({...props,onApplied:()=>{latest++;}});
  pending.resolve([receipt({status:'applied'})]);await turn();h.render({...props,onApplied:()=>{latest++;}});await turn();h.render();
  assert.equal(stale,0);assert.equal(latest,1);
});

test('requests paginate and refresh without replacing unsaved receiving settings or their save version',async()=>{
  const calls=[];let settingsLoads=0,saved;
  const h=portal({get:async(url,options)=>{calls.push(options?.params);if(url.endsWith('settings')){settingsLoads++;return {data:{version:6,accounts:{cbe:{...account,enabled:true}}}};}return {data:{items:[receipt({submitted_reference:'SYNTHETIC-PROOF'})],total:51}};},put:async(_url,body)=>{saved=body;return {data:{...body,version:7}};}});
  h.render();await turn();h.render();
  h.find(n=>n.type==='input'&&n.props.value==='Synthetic Daycare').props.onChange({target:{value:'Unsaved Holder'}});h.render();
  h.button('Next requests').props.onClick();await turn();h.render();assert.equal(calls.at(-1).offset,25);assert.match(h.text(),/26–50 of 51/);assert.equal(settingsLoads,1);
  assert.ok(h.find(n=>n.type==='input'&&n.props.value==='Unsaved Holder'));assert.match(h.text(),/SYNTHETIC-PROOF/);
  h.find(n=>n.type==='textarea').props.onChange({target:{value:'Independent receiving account update'}});h.render();h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await turn();
  assert.equal(saved.version,6);assert.equal(saved.accounts.cbe.account_holder,'Unsaved Holder');
});

test('failed initial settings load cannot expose an empty save form; requests remain available',async()=>{
  const h=portal({get:async url=>{if(url.endsWith('settings'))throw Error('Settings unavailable');return {data:{items:[receipt({status:'review_pending',submitted_reference:'SYNTHETIC'})],total:1}};}});
  h.render();await turn();h.render();assert.equal(h.button('Save receiving accounts'),undefined);assert.ok(h.button('Reload receiving settings'));assert.ok(h.button('Review evidence'));assert.match(h.text(),/Retry before editing/);
});

test('independent resolution sends optimistic version plus evidence and never exposes rejection of verified money',async()=>{
  let body,posts=0;const record=receipt({status:'verified_unapplied',version:9});
  const h=portal({get:async url=>({data:url.endsWith('settings')?{version:1,accounts:{}}:{items:[record],total:1}}),post:async(url,value)=>{posts++;assert.match(url,/\/resolve$/);body=value;return {data:receipt({status:'resolved'})};}});
  h.render();await turn();h.render();h.button('Review evidence').props.onClick();h.render();assert.equal(h.button('Reject submitted proof'),undefined);assert.equal(h.button('Record independent confirmation'),undefined);
  assert.equal(h.button('Record completed resolution').props.disabled,true);
  h.find(n=>n.type==='input'&&n.props.minLength===4).props.onChange({target:{value:'SYNTHETIC-REFUND'}});
  h.nodes().filter(n=>n.type==='textarea').at(-1).props.onChange({target:{value:'Independently returned the full amount'}});
  h.find(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.required).props.onChange({target:{checked:true}});h.render();
  assert.equal(h.button('Record completed resolution').props.disabled,false);
  h.nodes().filter(n=>n.type==='form').at(-1).props.onSubmit({preventDefault(){}});await turn();h.render();assert.equal(posts,1);assert.equal(body.version,9);assert.equal(body.amount_confirmed,true);assert.equal(body.evidence_reference,'SYNTHETIC-REFUND');
});

test('independent approval requires entered bank date and sends confirmed evidence in Addis Ababa time',async()=>{
  let body;const record=receipt({status:'review_pending',submitted_reference:'SYNTHETIC-PROOF',version:8});
  const h=portal({get:async url=>({data:url.endsWith('settings')?{version:1,accounts:{}}:{items:[record],total:1}}),post:async(url,value)=>{assert.match(url,/\/review$/);body=value;return {data:receipt({status:'applied'})};}});
  h.render();await turn();h.render();h.button('Review evidence').props.onClick();h.render();
  const date=h.find(n=>n.type==='input'&&n.props.type==='datetime-local');assert.equal(date.props.value,'');assert.equal(date.props.required,true);
  date.props.onChange({target:{value:'2026-11-10T13:30:15'}});
  h.nodes().filter(n=>n.type==='input'&&n.props.minLength===4).at(-1).props.onChange({target:{value:'SYNTHETIC-EVIDENCE'}});
  h.nodes().filter(n=>n.type==='textarea').at(-1).props.onChange({target:{value:'Independently checked the bank transaction'}});
  h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.required).forEach(n=>n.props.onChange({target:{checked:true}}));h.render();
  h.nodes().filter(n=>n.type==='form').at(-1).props.onSubmit({preventDefault(){}});await turn();
  assert.equal(body.payment_date,'2026-11-10T10:30:15.000Z');assert.equal(body.version,8);assert.equal(body.confirmed_amount,120);assert.equal(body.verified_reference,'SYNTHETIC-PROOF');assert.equal(body.decision,'approve');
});

test('parent API preserves role client, target filters, request key and optimistic proof version',async()=>{
  const calls=[],client={get:async(...args)=>{calls.push(['get',...args]);return {data:{accounts:[account],items:[receipt()]}};},post:async(...args)=>{calls.push(['post',...args]);return {data:receipt()};}};
  const m={exports:{}};vm.runInNewContext(compile('../src/api/daycarePayments.ts'),{module:m,exports:m.exports,require(name){assert.equal(name,'./client');return {apiClient:client};}});
  await m.exports.receiptRequests('invoice',7);assert.equal(calls.at(-1)[2].params.target_id,7);assert.equal(calls.at(-1)[2].params.purpose,'invoice');
  await m.exports.createReceiptRequest('order',8,'abyssinia','SYNTHETIC_REQUEST_KEY');assert.equal(calls.at(-1)[2].request_key,'SYNTHETIC_REQUEST_KEY');
  await m.exports.verifyDaycareReceipt(receipt({id:'request/id',provider:'abyssinia',version:8}),' PROOF ',' 12345 ');
  assert.equal(calls.at(-1)[1],'/daycare-payments/requests/request%2Fid/verify');assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1)[2])),{version:8,reference:'PROOF',suffix:'12345'});
  await m.exports.verifyDaycareReceipt(receipt(),' PROOF ','12345');assert.equal('suffix' in calls.at(-1)[2],false);
});
