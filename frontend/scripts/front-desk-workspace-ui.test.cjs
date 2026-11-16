'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');

function harness(){
  const state=[];let cursor=0,tree;
  const Duties=function Duties(){},PlusStaffScheduling=function PlusStaffScheduling(){};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useEffect(effect){effect();}};
  const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/portal/FrontDeskWorkspace.web.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,require(name){if(name==='react')return react;if(name==='./PlusStaffScheduling.web')return PlusStaffScheduling;if(name==='./pages.web')return {Duties};throw Error(name);}});
  const nodes=()=>{const all=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;all.push(node);visit(node.props?.children);};visit(tree);return all;};
  return {Duties,PlusStaffScheduling,render(props){cursor=0;tree=module.exports.default(props);return tree;},nodes};
}

const ctx={data:{},date:'2027-01-04',query:'',staff:false,actor:{},preview:false,go(){},open(){}};

test('Standard front-desk stays focused on manual duties',()=>{
  const h=harness();h.render({ctx,plus:false});
  assert.ok(h.nodes().some(node=>node.type===h.Duties));
  assert.equal(h.nodes().some(node=>node.props?.role==='tablist'),false);
  assert.equal(h.nodes().some(node=>node.type===h.PlusStaffScheduling),false);
});

test('Plus front-desk switches between compact action tabs',()=>{
  const h=harness();h.render({ctx,plus:true});
  const tabs=h.nodes().filter(node=>node.props?.role==='tab');
  assert.deepEqual(tabs.map(node=>node.props.children[0]),['Duties','Weekly schedules','Leave','Substitutions']);
  tabs[1].props.onClick();h.render({ctx,plus:true});
  const scheduling=h.nodes().find(node=>node.type===h.PlusStaffScheduling);
  assert.equal(scheduling.props.section,'schedules');
  assert.equal(h.nodes().some(node=>node.type===h.Duties),false);
});
