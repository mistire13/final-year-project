'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('portal observes a recovery navigation that occurs before its listener mounts', () => {
  const file = path.join(__dirname, '../src/portal/PortalGate.web.tsx');
  const source = fs.readFileSync(file, 'utf8').replace('function GateContent(', 'export function GateContent(');
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  let state, effect, listener;
  const react = {
    createElement:(type,props,...children)=>({type,props,children}),
    useState:initial=>{state=initial;return [state,value=>{state=value;}];},
    useRef:initial=>({current:initial}),
    useEffect:callback=>{effect=callback;},
    Suspense:()=>null,
  };
  const window = {
    location:{pathname:'/'},
    dispatchEvent:()=>true,
    history:{pushState:()=>{}},
    addEventListener:(type,callback)=>{if(type==='popstate')listener=callback;},
    removeEventListener:(type,callback)=>{if(type==='popstate' && listener===callback)listener=null;},
  };
  const m = {exports:{}};
  vm.runInNewContext(compiled, {module:m,exports:m.exports,window,Event,URLSearchParams,__DEV__:true,
    require(name) {
      if (name==='react') return {...react,default:react};
      if (name==='./previewPolicy') return {isPortalPreviewPath:()=>false};
      if (name.endsWith('.css')) return {};
      return {default:()=>null,WebMotionProvider:()=>null,SurfaceBoundary:()=>null};
    }});
  m.exports.GateContent({children:null});
  assert.equal(state,'/');
  // LandingPage's mount effect changes the path before GateContent subscribes.
  window.location.pathname='/admin/subscription';
  assert.equal(listener,undefined);
  const cleanup=effect();
  assert.equal(state,'/admin/subscription');
  window.location.pathname='/admin/dashboard';listener();
  assert.equal(state,'/admin/dashboard');
  cleanup();assert.equal(listener,null);
});
