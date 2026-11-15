'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const compile=(file,change=x=>x)=>ts.transpileModule(change(fs.readFileSync(path.join(__dirname,file),'utf8')),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'');
const nodes=tree=>{const out=[];function visit(node){if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;out.push(node);visit(node.props?.children);}visit(tree);return out;};
const react={createElement:(type,props,...children)=>({type,props:{...props,children}})};

test('recovery pages preserve role sessions and payment address, and retry without initiating payment',()=>{
  const Button=function Button(){},Card=function Card(){};let reloads=0,retries=0;
  const location={pathname:'/admin/subscription',search:'?resume=saved',hash:'#payment=saved',reload:()=>{reloads++;}};
  const before=JSON.stringify(location);
  const m={exports:{}};vm.runInNewContext(compile('../src/portal/SurfaceRecovery.web.tsx'),{module:m,exports:m.exports,window:{location,localStorage:{clear:()=>assert.fail('session cleared'),removeItem:()=>assert.fail('token cleared')}},require(name){if(name==='react')return {...react,default:react};if(name==='./ui.web')return {Button,Card,Icon:()=>null};if(name.endsWith('.css'))return {};throw Error(name);}});
  const render=m.exports.default;
  const pending=render({kind:'payment-unavailable'});nodes(pending).find(node=>node.type===Button).props.onClick();assert.equal(reloads,1);assert.equal(JSON.stringify(location),before);assert.match(text(pending),/Do not make another payment/);
  nodes(render({kind:'unavailable',onRetry:()=>{retries++;}})).find(node=>node.type===Button).props.onClick();assert.equal(retries,1);assert.equal(reloads,1);
  const destinations=[['/super-admin','/super-admin'],['/staff/business','/staff/workspace'],['/app','/app'],['/unknown','/']];for(const [route,expected]of destinations)assert.equal(m.exports.recoveryWorkspace(route),expected);
  for(const [route,expected]of [['/super-admin','/super-admin'],['/app','/app'],['/admin/orders','/admin/login']]){location.pathname=route;const page=render({kind:'session-expired'});assert.ok(nodes(page).some(node=>node.type==='a'&&text(node)==='Sign in again'&&node.props.href===expected));}
  location.pathname='/session-expired';const chooser=render({kind:'session-expired'});for(const destination of ['/app','/admin/login','/super-admin'])assert.ok(nodes(chooser).some(node=>node.type==='a'&&node.props.href===destination));
  assert.match(text(render({kind:'subscription-ended'})),/Essential care and authorized pickup remain available/);
});

test('unknown public/operator/caregiver/parent routes show404 while legacy payment recovery still reaches pricing',()=>{
  const Recovery=function Recovery(){},Pricing=function Pricing(){},Landing=function Landing(){};
  function gate(pathname,search='',dev=true){
    const m={exports:{}};const hooks={...react,useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{},Suspense:()=>null};
    vm.runInNewContext(compile('../src/portal/PortalGate.web.tsx',s=>s.replace('function GateContent(','export function GateContent(')),{module:m,exports:m.exports,window:{location:{pathname,search,hash:''}},URLSearchParams,__DEV__:dev,require(name){if(name==='react')return {...hooks,default:hooks};if(name==='./SurfaceRecovery.web')return {__esModule:true,default:Recovery};if(name==='../landing/PricingJourney.web')return {__esModule:true,default:Pricing};if(name==='../landing/LandingPage.web')return {__esModule:true,default:Landing};if(name==='./previewPolicy')return {isPortalPreviewPath:path=>/^\/(admin|staff)\/preview/.test(path)};if(name.endsWith('.css'))return {};return {__esModule:true,default:()=>null,WebMotionProvider:()=>null,SurfaceBoundary:()=>null};}});
    return m.exports.GateContent({children:'parent app'});
  }
  assert.equal(gate('/').type,Landing);
  for(const path of ['/missing','/super-admin/missing','/caregiver/missing','/app/missing']){const result=gate(path);assert.equal(result.type,Recovery);assert.equal(result.props.kind,'not-found');}
  assert.equal(gate('/missing','?subscription_resume=old-payment').type,Pricing);
  assert.equal(gate('/admin/preview','',false).props.kind,'forbidden');
  assert.equal(gate('/payment-unavailable/').props.kind,'payment-unavailable');
});
