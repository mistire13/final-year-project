'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'');

function harness(api){
  const slots=[];let cursor=0,effects=[],tree;
  const react={Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]||=({current:initial});},
    useCallback(callback,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,index)=>value!==old.deps[index]))slots[i]={deps,callback};return slots[i].callback;},
    useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,index)=>value!==old.deps[index])){slots[i]={deps};effects.push(effect);}}};
  const Button=function Button(){},Card=function Card(){},Notice=function Notice(){},Text=function Text(){},Switch=function Switch(){},View=function View(){};
  const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/screens/finances/BillingReminderPreferences.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const m={exports:{}};vm.runInNewContext(compiled,{module:m,exports:m.exports,require(name){if(name==='react')return {...react,default:react};if(name==='react-native')return {Switch,View};if(name==='../../components/design/System')return {Button,Card,Notice,Text};if(name==='../../api/client')return {apiClient:api};if(name==='../../theme/tokens')return {colors:{}};throw Error(name);}});
  const nodes=()=>{const output=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;output.push(node);visit(node.props?.children);};visit(tree);return output;};
  return {render(){cursor=0;effects=[];tree=m.exports.default();for(const effect of effects)effect();},switch:()=>nodes().find(node=>node.type===Switch),button:title=>nodes().find(node=>node.type===Button&&node.props.title===title),text:()=>text(tree)};
}

test('parent reminder preference loads saved opt-in, saves explicit opt-out once, and retains unsaved choice on error',async()=>{
  let patches=0,fail=true,finish;const calls=[];
  const ui=harness({get:async url=>{calls.push(url);return {data:{billing_email:true}};},patch:(url,body)=>{patches++;calls.push([url,{...body}]);return new Promise((resolve,reject)=>{finish=()=>fail?reject(Error('Synthetic offline')):resolve({data:{billing_email:body.email_enabled}});});}});
  ui.render();assert.equal(ui.switch(),undefined);await turn();ui.render();
  assert.equal(patches,0,'opening the screen never changes consent');assert.equal(ui.switch().props.value,true);
  assert.equal(ui.button('Save reminder preference').props.disabled,true);
  ui.switch().props.onValueChange(false);ui.render();const save=ui.button('Save reminder preference');save.props.onPress();save.props.onPress();ui.render();
  assert.equal(patches,1);assert.equal(ui.switch().props.disabled,true);assert.equal(ui.button('Save reminder preference').props.loading,true);
  finish();await turn();ui.render();assert.match(ui.text(),/Could not save/);assert.equal(ui.switch().props.value,false);assert.equal(ui.button('Save reminder preference').props.disabled,false);
  fail=false;ui.button('Save reminder preference').props.onPress();finish();await turn();ui.render();
  assert.match(ui.text(),/turned off/);assert.equal(ui.button('Save reminder preference').props.disabled,true);
  assert.equal(calls[0],'/billing-automation/my-reminders/preferences');assert.equal(calls[1][1].email_enabled,false);assert.deepEqual(Object.keys(calls[1][1]),['email_enabled']);
});

test('failed preference load requires retry before the parent can change consent',async()=>{
  let attempts=0;const ui=harness({get:async()=>{if(++attempts===1)throw Error('Synthetic offline');return {data:{billing_email:false}};},patch:async()=>assert.fail('Unexpected consent write')});
  ui.render();await turn();ui.render();assert.match(ui.text(),/Could not load/);assert.equal(ui.switch(),undefined);
  ui.button('Retry preference').props.onPress();await turn();ui.render();assert.equal(ui.switch().props.value,false);assert.equal(ui.button('Save reminder preference').props.disabled,true);
});
