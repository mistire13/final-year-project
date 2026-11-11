'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const textOf=node=>Array.isArray(node)?node.map(textOf).join(''):node&&typeof node==='object'?textOf(node.props?.children):String(node??'');
function harness(client){
  const state=[];let cursor=0,effects=[],tree;
  const Button=function Button(){},Card=function Card(){},Badge=function Badge(){};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},
    useRef(initial){const i=cursor++;return state[i]||=( {current:initial} );},
    useEffect(effect,deps){const i=cursor++;if(!state[i]||deps.some((value,j)=>value!==state[i].deps[j])){state[i]?.cleanup?.();state[i]={deps};effects.push(()=>{state[i].cleanup=effect();});}},};
  const m={exports:{}};
  const calendar={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/portal/StaffWeekCalendar.web.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,
    {module:calendar,exports:calendar.exports,require(name){if(name==='react')return {...react,default:react};if(name==='./ui.web')return {Button,Badge};if(name.endsWith('.css'))return {};throw Error(name);},Date,Intl});
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/portal/PlusStaffScheduling.web.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,
    {module:m,exports:m.exports,require(name){if(name==='react')return {...react,default:react};if(name==='./api')return {portalClient:client,apiError:error=>error.message};if(name==='./ui.web')return {Button,Card,Badge};if(name==='./StaffWeekCalendar.web')return calendar.exports;if(name.endsWith('.css'))return {};throw Error(name);},Date,Intl,Math});
  const nodes=()=>{const all=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;all.push(node);visit(node.props?.children);};visit(tree);return all;};
  return {render(){cursor=0;effects=[];tree=m.exports.default();effects.forEach(effect=>effect());},nodes,find:fn=>nodes().find(fn),Button,Card,Calendar:calendar.exports.default,calendar:calendar.exports};
}
const fixture={role:'admin',staff:[{id:4,name:'Synthetic Caregiver'}],groups:[],templates:[{id:'3',name:'Weekly rota',enabled:true,version:1,rules:[{}]}],assignments:[],leave:[],availability:[]};
test('administrator must preview and explicitly review before publishing dated duties',async()=>{
  const posts=[];
  const h=harness({get:async()=>({data:fixture}),post:async(url,body)=>{posts.push({url,body});return {data:url.endsWith('/preview')?{preview_token:'a'.repeat(64),shifts:[{staff_id:4,starts_at:'2027-01-04T06:00:00Z',ends_at:'2027-01-04T14:00:00Z',can_attendance:true,can_pickup:false}],conflicts:[]}:{}};}});
  h.render();await turn();h.render();
  const templateLabel=h.find(node=>node.type==='label'&&node.props.children[0]==='Template');
  templateLabel.props.children.flat().find(node=>node?.type==='select').props.onChange({target:{value:'3'}});h.render();
  const previewForm=h.find(node=>node.type==='form'&&textOf(node).includes('Preview schedule'));
  previewForm.props.onSubmit({preventDefault(){}});await turn();h.render();
  const publish=()=>h.find(node=>node.type===h.Button&&textOf(node)==='Publish reviewed schedule');
  assert.equal(publish().props.disabled,true);
  const review=h.find(node=>node.type==='label'&&textOf(node).includes('I reviewed the dated shifts'));
  review.props.children.flat().find(node=>node?.type==='input').props.onChange({target:{checked:true}});h.render();
  assert.equal(publish().props.disabled,false);publish().props.onClick();await turn();h.render();
  const body=posts.find(row=>row.url.endsWith('/publish')).body;
  assert.equal(body.confirmed,true);assert.equal(body.preview_token,'a'.repeat(64));assert.equal(body.template_id,3);assert.ok(body.request_key.length>=16);
});
test('caregiver can request own leave in Addis Ababa time without administrator template or substitution controls',async()=>{
  let sent;
  const h=harness({get:async()=>({data:{...fixture,role:'caregiver',templates:[]}}),post:async(url,body)=>{sent={url,body};return {data:{}};}});
  h.render();await turn();h.render();
  assert.equal(h.find(node=>node.type===h.Card&&node.props.title==='Weekly front-desk templates'),undefined);
  assert.equal(h.find(node=>node.type===h.Card&&node.props.title==='Arrange a front-desk substitute'),undefined);
  const times=()=>h.nodes().filter(node=>node.type==='input'&&node.props.type==='datetime-local');
  times()[0].props.onChange({target:{value:'2027-01-04T09:00'}});h.render();times()[1].props.onChange({target:{value:'2027-01-04T17:00'}});h.render();
  h.find(node=>node.type==='textarea').props.onChange({target:{value:'Planned personal leave'}});h.render();
  h.find(node=>node.type==='form'&&textOf(node).includes('Request leave')).props.onSubmit({preventDefault(){}});await turn();h.render();
  assert.equal(sent.url,'/staff-scheduling/leave');assert.equal(sent.body.staff_id,4);assert.equal(sent.body.starts_at,'2027-01-04T09:00:00+03:00');assert.equal(sent.body.ends_at,'2027-01-04T17:00:00+03:00');
});

test('front-desk templates describe duty coverage and leave permanent classroom assignments separate',async()=>{
  const h=harness({get:async()=>({data:fixture})});h.render();await turn();h.render();
  const text=h.nodes().map(textOf).join(' ');
  assert.match(text,/Caregivers keep their regular classroom assignments/);
  assert.ok(h.find(node=>node.type===h.Card&&node.props.title==='Front-desk attendance and pickup shifts'));
  assert.ok(h.find(node=>node.type==='label'&&textOf(node).startsWith('Children covered by this duty')));
  assert.ok(h.find(node=>node.type==='label'&&textOf(node).includes('Attendance / check-in responsibility')));
});

test('weekly calendar loads Monday through Sunday and refetches server-filtered records on navigation',async()=>{
  const calls=[];const h=harness({get:async(url,options)=>{calls.push(options.params);return {data:{...fixture,role:'caregiver'}};}});
  h.render();await turn();h.render();
  const first=calls.at(-1);assert.equal(new Date(first.from+'T00:00:00Z').getUTCDay(),1);assert.equal(Date.parse(first.to)-Date.parse(first.from),6*86400000);
  const calendar=h.find(node=>node.type===h.Calendar);calendar.props.onWeekChange('2027-01-04');h.render();await turn();h.render();
  assert.equal(calls.at(-1).from,'2027-01-04');assert.equal(calls.at(-1).to,'2027-01-10');assert.equal('staff_id' in calls.at(-1),false);
  const {mondayOf,dutiesOnDay}=h.calendar;
  assert.equal(mondayOf('2027-01-03'),'2026-12-28');
  const duties=[{id:1,starts_at:'2026-11-01T20:30:00Z',ends_at:'2026-11-01T21:00:00Z'},{id:2,starts_at:'2026-11-01T20:30:00Z',ends_at:'2026-11-01T21:30:00Z'},{id:3,starts_at:'2026-11-01T21:00:00Z',ends_at:'2026-11-01T22:00:00Z'}];
  assert.equal(dutiesOnDay(duties,'2026-11-01').length,2);assert.equal(dutiesOnDay(duties,'2026-11-02').length,2,'midnight end is exclusive; overnight duty appears on both days');
  const rendered=h.Calendar({...calendar.props,from:'2027-01-04'});const days=rendered.props.children.at(-1).props.children[0];
  assert.equal(days.length,7);assert.match(days[0].props['aria-label'],/^Monday/);assert.match(days[6].props['aria-label'],/^Sunday/);
});
