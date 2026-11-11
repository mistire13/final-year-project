'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'');
test('Plus billing requires a fresh preview, invalidates edited fees, and saves only the reviewed configuration',async()=>{
  const settings={enabled:false,generate_day:1,due_day:10,default_fee:1000,discount_percent:0,discount_reason:'',reminder_before_days:3,reminder_after_days:3,in_app_reminders:true,email_reminders:false,version:3,updated_by:999};
  const history={runs:[],deliveries:[],aging:{}};let received,previewCalls=0,finishPreview;
  const slots=[];let cursor=0,effects=[],tree;
  const react={Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]||=({current:initial});},
    useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,index)=>value!==old.deps[index])){slots[i]={deps};effects.push(effect);}}};
  const Button=function Button(){},Card=function Card(){},Badge=function Badge(){};
  const api={get:async url=>({data:url.endsWith('settings')?settings:history}),
    post:async()=>{previewCalls++;return new Promise(resolve=>{finishPreview=()=>resolve({data:{preview_id:'synthetic-preview',billing_period:'2026-11',due_date:'2026-11-10',generated_count:1,skipped_count:0,total_amount:'1000.00',children:[]}});});},
    put:async(url,body)=>{received=body;return {data:{...body,version:4}};}};
  const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/portal/PlusBillingAutomation.web.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const m={exports:{}};vm.runInNewContext(compiled,{module:m,exports:m.exports,require(name){if(name==='react')return {...react,default:react};if(name==='./api')return {portalClient:api,apiError:error=>error.message};if(name==='./ui.web')return {Button,Card,Badge};throw Error(name);}});
  const nodes=()=>{const output=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;output.push(node);visit(node.props?.children);};visit(tree);return output;};
  const render=()=>{cursor=0;effects=[];tree=m.exports.default();for(const effect of effects)effect();};
  const button=name=>nodes().find(node=>node.type===Button&&text(node)===name);
  render();await turn();render();nodes().find(node=>node.type==='textarea'&&node.props.maxLength===1000).props.onChange({target:{value:'Review synthetic automated invoice fees'}});render();
  nodes().find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});render();
  assert.equal(button('Save schedule').props.disabled,true);
  const preview=button('Preview current month');preview.props.onClick();preview.props.onClick();assert.equal(previewCalls,1,'repeated clicks cannot overlap previews');
  finishPreview();await turn();render();assert.equal(button('Save schedule').props.disabled,false);
  const fee=nodes().find(node=>node.type==='label'&&text(node).startsWith('Default monthly fee')).props.children.find(node=>node?.type==='input');
  fee.props.onChange({target:{value:'2000'}});render();assert.equal(button('Save schedule').props.disabled,true,'editing fee requires another preview');
  button('Preview current month').props.onClick();finishPreview();await turn();render();
  nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await turn();render();
  assert.equal(received.preview_id,'synthetic-preview');assert.equal(received.default_fee,2000);assert.equal(received.version,3);assert.equal(received.enabled,true);
  assert.equal('updated_by' in received,false,'server-owned fields are not submitted back as configuration');
  assert.equal(button('Save schedule').props.disabled,true,'consumed preview cannot be reused');
});
