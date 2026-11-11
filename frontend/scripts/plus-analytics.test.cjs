'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function sample(){
  const attendance={present:2,absent:1,recorded_child_days:3,present_percent:66.67,daily:[{date:'2026-11-01',present:2,absent:1}],classrooms:[{group_id:null,classroom:'Unassigned',present:2,absent:1}]};
  const period={from:'2026-11-01',to:'2026-11-03',attendance,care_fees:{invoice_count:1,billed:'200.00',collected:'120.00',outstanding_now:'80.00',overdue_now:'80.00'},shop:{enabled:true,orders_placed:1,placed_total:'15.00',paid_orders:1,collected:'15.00'}};
  return {generated_at:'2026-11-08T10:00:00Z',timezone:'Africa/Addis_Ababa',daycare:{id:1,name:'<script>alert(1)</script>'},filters:{from:'2026-11-01',to:'2026-11-03',group_id:null},groups:[{id:1,name:'Room one'}],current:period,previous:{...period,from:'2026-10-29',to:'2026-10-31'},comparisons:{care_collected:{difference:'0.00',percent:0},care_billed:{difference:'0.00',percent:0},shop_collected:{difference:'0.00',percent:0},attendance:{difference:0,percent:0}},occupancy:{current_active_children:1,current_capacity:50,current_utilization_percent:2,coverage_started_at:'2026-11-08T10:00:00Z',observations:[],truncated:false},best_sellers:[{product_id:1,name:'<img src=x onerror=alert(1)>',units:3,collected:'15.00'}],low_stock:[],notes:['Current balances & recorded observations only.']};
}
function harness(get){
  const slots=[];let cursor=0,effects=[],tree;
  const react={Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>value!==old.deps[j])){old?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=effect();});}},};
  const m={exports:{}};const Card=function Card(){},Button=function Button(){},Table=function Table(){},Badge=function Badge(){};
  const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/portal/PlusAnalytics.web.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  vm.runInNewContext(compiled,{module:m,exports:m.exports,AbortController,Date,BigInt,Intl,URL,setTimeout,document:{createElement:()=>({click(){}})},
    require(name){if(name==='react')return {...react,default:react};if(name==='./api')return {portalClient:{get},apiError:error=>error.message};if(name==='./ui.web')return {Card,Button,Table,Badge};if(name.endsWith('.css'))return {};throw Error(name);}});
  const nodes=()=>{const all=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;all.push(node);visit(node.props?.children);visit(node.props?.action);};visit(tree);return all;};
  return {exports:m.exports,Button,Table,nodes,render(){cursor=0;effects=[];tree=m.exports.default();for(const effect of effects)effect();}};
}

test('printable management report escapes tenant data and preserves large monetary amounts',()=>{
  const h=harness(async()=>({data:sample()}));
  assert.equal(h.exports.reportMoney('9999999999999999.01'),'9,999,999,999,999,999.01 ETB');
  assert.equal(h.exports.reportMoney('-0.25'),'-0.25 ETB');
  const html=h.exports.printableAnalytics(sample());
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.ok(!html.includes('<img src='));
  assert.ok(html.includes('Current balances &amp; recorded observations only.'));assert.ok(html.includes('Previous equal-length period'));
});

test('analytics fetches through the authenticated portal client, filters reports and recovers from failures',async()=>{
  const calls=[];let fail=true;
  const h=harness(async(url,config)=>{calls.push({url,params:config.params});if(fail)throw Error('Report unavailable');return {data:sample()};});
  h.render();await turn();h.render();
  assert.ok(h.nodes().find(node=>node.props?.role==='alert'));
  const retry=h.nodes().find(node=>node.type===h.Button&&node.props.children.includes('Retry report'));assert.ok(retry);
  fail=false;retry.props.onClick();h.render();await turn();h.render();
  assert.equal(calls.at(-1).url,'/plus/analytics');assert.equal('daycare_id' in calls.at(-1).params,false);
  for(const table of h.nodes().filter(node=>node.type===h.Table))assert.ok(table.props.rows.every(row=>typeof row.id==='number'));
  const select=h.nodes().find(node=>node.type==='select');select.props.onChange({target:{value:'1'}});h.render();
  h.nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();await turn();h.render();
  assert.equal(calls.at(-1).params.group_id,'1');
});

test('date presets use Addis calendar days and grouped reports preserve selection through CSV requests and print',async()=>{
  const calls=[];const value=sample();value.filters.attendance_grouping='week';value.current.attendance.grouped=[{from:'2026-11-01',to:'2026-11-01',present:2,absent:1,recorded_child_days:3,present_percent:66.67}];
  const h=harness(async(url,config)=>{calls.push({url,params:config.params});return {data:url.endsWith('export.csv')?new Blob(['Synthetic CSV']):value};});
  assert.equal(h.exports.reportPreset('last_week','2027-01-01').from,'2026-12-21');assert.equal(h.exports.reportPreset('last_week','2027-01-01').to,'2026-12-27');
  assert.equal(h.exports.reportPreset('last_month','2024-03-01').to,'2024-02-29');assert.equal(h.exports.reportPreset('week','2026-11-01').from,'2026-10-26');
  h.render();await turn();h.render();const select=h.nodes().find(node=>node.type==='select'&&node.props.value==='day');select.props.onChange({target:{value:'month'}});h.render();
  h.nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});h.render();await turn();h.render();
  assert.equal(calls.at(-1).params.attendance_grouping,'month');assert.match(h.exports.printableAnalytics(value),/Recorded attendance · week/);assert.match(h.exports.printableAnalytics(value),/Recorded cash returns \(no app transfer\)/);
  assert.ok(h.nodes().filter(node=>node.type===h.Table).some(node=>node.props.rows[0]?.rate==='66.67%'));
  h.nodes().find(node=>node.type===h.Button&&node.props.children.includes('Download CSV')).props.onClick();await turn();h.render();
  assert.equal(calls.at(-1).url,'/plus/analytics/export.csv');assert.equal(calls.at(-1).params.attendance_grouping,'week','export follows the displayed server report, not unsaved draft filters');
});
