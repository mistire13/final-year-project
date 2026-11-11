'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, transform = source => source) {
  return ts.transpileModule(transform(fs.readFileSync(path.join(__dirname,file),'utf8')),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
}
function nodes(tree) {
  const output=[];
  const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;output.push(node);visit(node.props?.children);};
  visit(tree);return output;
}
function textOf(node) {
  if(Array.isArray(node))return node.map(textOf).join('');
  return node && typeof node==='object'?textOf(node.props?.children):String(node??'');
}

test('homepage registration actions open the dedicated pricing page and retain the footer name', () => {
  const paths=[],events=[],storage=new Map(),Footer=function LandingFooter(){},Menu=function PublicNavMenu(){};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{}};
  const m={exports:{}};
  vm.runInNewContext(compile('../src/landing/LandingPage.web.tsx'),{module:m,exports:m.exports,
    window:{history:{pushState:(_state,_title,path)=>paths.push(path)},dispatchEvent:event=>events.push(event.type),sessionStorage:{setItem:(key,value)=>storage.set(key,value)}},
    PopStateEvent:class {constructor(type){this.type=type;}},
    require(name){
      if(name==='react')return {...react,default:react};
      if(name==='motion/react')return {motion:new Proxy({},{get:(_target,key)=>String(key)}),useReducedMotion:()=>true};
      if(name==='../portal/ui.web')return {Icon:()=>null};
      if(name==='./LandingFooter.web')return {__esModule:true,default:Footer};
      if(name==='./PublicNavMenu.web')return {__esModule:true,default:Menu};
      if(name.endsWith('.css'))return {};
      if(name.endsWith('.png'))return 'synthetic-logo';
      return {__esModule:true,default:()=>null};
    }});
  const all=nodes(m.exports.default());
  const registrationButtons=all.filter(node=>node.type==='button'&&/Register (your )?daycare/i.test(textOf(node)));
  assert.ok(registrationButtons.length>=2,'both navigation and hero register actions remain available');
  for(const button of registrationButtons)button.props.onClick();
  assert.ok(paths.every(value=>value==='/pricing'));
  assert.equal(events.length,registrationButtons.length);
  assert.equal(all.find(node=>node.props?.role==='dialog'),undefined);
  assert.ok(all.find(node=>node.type===Menu&&node.props.activePage==='home'));
  all.find(node=>node.type===Footer).props.onRegister('Sunrise Daycare');
  assert.equal(storage.get('ankelba_daycare_name'),'Sunrise Daycare');
  assert.equal(paths.at(-1),'/pricing');
});

test('home and pricing share the five requested navigation links on desktop and mobile',()=>{
  const react={Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...props,children}})};
  const m={exports:{}};
  vm.runInNewContext(compile('../src/landing/PublicNavMenu.web.tsx'),{module:m,exports:m.exports,
    require(name){if(name==='react')return {...react,default:react};if(name==='../portal/ui.web')return {Icon:()=>null};if(name.endsWith('.css'))return {};throw Error(name);}});
  const expected=[['Why Ankelba','/#why-ankelba'],['Features','/#features'],['How it works','/#a-day-together'],['Pricing','/pricing'],['Check Status','/application-status']];
  for(const activePage of ['home','pricing']){
    const all=nodes(m.exports.default({activePage}));
    const navs=all.filter(node=>node.type==='nav');assert.equal(navs.length,2);
    for(const nav of navs){
      const links=nodes(nav).filter(node=>node.type==='a');
      assert.deepEqual(links.map(node=>[textOf(node),node.props.href]),expected);
      assert.equal(links[3].props['aria-current'],activePage==='pricing'?'page':undefined);
      let menuOpen=true;
      links[0].props.onClick({currentTarget:{closest:()=>({set open(value){menuOpen=value;}})}});
      assert.equal(menuOpen,false,'choosing a mobile link closes the menu');
    }
  }
});

test('homepage section links align their target after the React page mounts',()=>{
  for(const id of ['why-ankelba','features','a-day-together']){
    const effects=[],scrolled=[];let cleanup;
    const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useEffect:effect=>effects.push(effect)};
    const m={exports:{}};
    vm.runInNewContext(compile('../src/landing/LandingPage.web.tsx'),{module:m,exports:m.exports,
      window:{location:{hash:`#${id}`},requestAnimationFrame:callback=>{callback();return 1;},cancelAnimationFrame(){},addEventListener(){},removeEventListener(){}},
      document:{getElementById:target=>({scrollIntoView:options=>scrolled.push({target,options})})},
      require(name){if(name==='react')return {...react,default:react};if(name==='motion/react')return {motion:new Proxy({},{get:(_target,key)=>String(key)}),useReducedMotion:()=>true};if(name==='../portal/ui.web')return {Icon:()=>null};if(name.endsWith('.css'))return {};if(name.endsWith('.png'))return 'synthetic-logo';return {__esModule:true,default:()=>null};}});
    m.exports.default();
    for(const effect of effects){const result=effect();if(result)cleanup=result;}
    assert.equal(scrolled.length,1);assert.equal(scrolled[0].target,id);assert.equal(scrolled[0].options.block,'start');
    cleanup?.();
  }
});

test('public pricing and old payment email links mount the pricing journey', () => {
  const Pricing=function PricingJourney(){},Landing=function LandingPage(){};
  for(const [pathname,search,expected] of [['/pricing','',Pricing],['/pricing/','',Pricing],['/','?subscription_resume=synthetic-id',Pricing],['/','',Landing]]) {
    const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{},Suspense:()=>null};
    const m={exports:{}};
    vm.runInNewContext(compile('../src/portal/PortalGate.web.tsx',source=>source.replace('function GateContent(','export function GateContent(')),{module:m,exports:m.exports,
      window:{location:{pathname,search}},URLSearchParams,__DEV__:true,
      require(name){
        if(name==='react')return {...react,default:react};
        if(name==='../landing/PricingJourney.web')return {__esModule:true,default:Pricing};
        if(name==='../landing/LandingPage.web')return {__esModule:true,default:Landing};
        if(name==='./previewPolicy')return {isPortalPreviewPath:()=>false};
        return {__esModule:true,default:()=>null};
      }});
    assert.equal(m.exports.GateContent({children:null}).type,expected,`${pathname}${search}`);
  }
});
