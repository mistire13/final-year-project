'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function harness(api={}){
 const source=fs.readFileSync(path.join(__dirname,'../src/portal/SubscriptionViews.web.tsx'),'utf8').replace('function ManageSubscription(','export function ManageSubscription(');
 const state=[],refs=[];let cursor=0,refCursor=0,effects=[],tree;
 const react={Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useRef(initial){const i=refCursor++;return refs[i]||={current:initial};},useEffect(effect,deps){const i=cursor++,old=state[i];if(!old||deps.some((v,j)=>v!==old[j])){state[i]=deps;effects.push(effect);}}};
 const Button=function Button(){},Badge=function Badge(){},m={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{module:m,exports:m.exports,Date,Math,globalThis:{},require(name){if(name==='react')return {...react,default:react};if(name==='./api')return {operatorApi:api,portalApi:{},apiError:e=>e.message};if(name==='./ui.web')return {Button,Badge,Card:function Card(){}};if(name==='./subscriptions')return {dateLabel:x=>String(x),offerPrice:(offer,cycle)=>offer[cycle==='annual'?'annual_price':'monthly_price'],priceLabel:(price,cycle)=>`${price} ETB / ${cycle}`};if(name==='./ReceiptReference.web')return {default:()=>null};if(name.endsWith('.css'))return {};throw Error(name);}});
 const nodes=()=>{const all=[];const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;all.push(n);visit(n.props?.children);};visit(tree);return all;};
 return {exports:m.exports,Button,Badge,nodes,render(component,props){cursor=0;refCursor=0;effects=[];tree=m.exports[component](props);for(const f of effects)f();return tree;},text:()=>JSON.stringify(tree)};
}
test('scheduled package summary shows accepted price, activation boundary and retained verified money',()=>{
 const h=harness(),change={status:'blocked',payment_status:'verified',payment_reference:'SYNTHETIC-REFERENCE',effective_at:'2026-12-01T09:00:00Z',terms:{name:'Standard',price:'100.00',max_children:2,billing_cycle:'monthly'},blocked_reason:'Active enrollment exceeds accepted capacity.'};
 h.render('ScheduledPackageSummary',{change});assert.match(h.text(),/100.00 ETB/);assert.match(h.text(),/2026-12-01/);assert.match(h.text(),/Verified and held for activation/);assert.match(h.text(),/Current|current paid package/);assert.ok(h.nodes().some(n=>n.props?.role==='alert'));assert.match(h.text(),/before paying again/);
 assert.match(h.exports.renewalResultNotice({scheduled:true}),/current package stays/);assert.equal(h.exports.renewalResultNotice({blocked:true,message:'Capacity review required'}),'Capacity review required');assert.match(h.exports.renewalResultNotice({}),/Renewal recorded/);
});
test('operator can agree next-period terms while paid through, using reviewed offer version and reason',async()=>{
 let received,refreshes=0;const h=harness({subscriptionAction:async(id,body)=>{received={id,body};}});
 const value={id:9,version:3,subscription_status:'active',subscription_plan:'standard',subscription_terms:{code:'standard'},subscription_ends_at:'2099-12-01T09:00:00Z',billing_cycle:'monthly'};
 const props={value,offers:[{code:'standard',name:'Standard',available:true,version:7,monthly_price:'100.00',max_children:2},{code:'premium',name:'Plus',available:true,version:8,monthly_price:'200.00',max_children:10}],onSaved:async()=>{refreshes++;},onRefreshOffers:async()=>{}};
 const render=()=>h.render('ManageSubscription',props),find=predicate=>h.nodes().find(predicate);render();render();
 find(n=>n.type==='select').props.onChange({target:{value:'change_package'}});render();
 const selects=h.nodes().filter(n=>n.type==='select');selects[1].props.onChange({target:{value:'premium'}});render();
 find(n=>n.type==='textarea').props.onChange({target:{value:'Daycare accepted Plus for the next paid period'}});render();
 assert.equal(find(n=>n.type===h.Button&&n.props.type==='submit').props.disabled,false);assert.match(h.text(),/Current features and capacity stay/);
 await find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(received.id,9);assert.equal(received.body.action,'change_package');assert.equal(received.body.package_code,'premium');assert.equal(received.body.terms_version,8);assert.equal(received.body.version,3);assert.equal(refreshes,1);
 props.value={...value,version:4,scheduled_change:{status:'paid'}};render();render();find(n=>n.type==='select').props.onChange({target:{value:'change_package'}});render();assert.equal(find(n=>n.type===h.Button&&n.props.type==='submit').props.disabled,true);
});
