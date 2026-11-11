'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
function load(name, imports = {}) {
  const module = {exports: {}};
  vm.runInNewContext(ts.transpileModule(source(name), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module, exports:module.exports, require: id => {if(id in imports)return imports[id];throw Error(id);}});
  return module.exports;
}
const announcements = load('utils/announcements.ts');
const items = [
  {id:1,title:'Entrance changed',body:'Contact the office',announcement_type:'alert',author_name:'Office'},
  {id:2,title:'Weekly menu · ምግብ',body:'Beans and rice',announcement_type:'meal_plan',author_name:'Kitchen'},
  {id:3,title:'Meeting',body:'Please discuss lunch arrangements',announcement_type:'general',author_name:'Office'},
];
test('meal-plan filtering uses the published type, including Amharic titles; keyword mentions are not misclassified', () => {
  assert.deepEqual(Array.from(announcements.filterAnnouncements(items, '', true), item=>item.id), [2]);
  assert.deepEqual(Array.from(announcements.filterAnnouncements(items, '  ምግብ  ', true), item=>item.id), [2]);
});
test('search matches author and content, distinguishes no results, and preserves source order', () => {
  assert.deepEqual(Array.from(announcements.filterAnnouncements(items, 'OFFICE'), item=>item.id), [1,3]);
  assert.equal(announcements.filterAnnouncements(items, 'unmatched').length, 0);
  assert.equal(announcements.filterAnnouncements(items, 'rice')[0].id, 2);
});
test('alerts retain their importance and read IDs reject malformed preference values', () => {
  assert.equal(announcements.announcementLabel(items[0]), 'Important notice');
  assert.equal(announcements.announcementLabel(items[1]), 'Meal plan');
  assert.deepEqual(Array.from(announcements.validReadAnnouncementIds([1,'2',null,-1,3.5,4])), [1,4]);
  assert.equal(announcements.validReadAnnouncementIds(null).length, 0);
});
test('mixed Amharic text uses an explicit system fallback while Latin preserves Quicksand weights', () => {
  const fonts={regular:'Q400',medium:'Q500',semibold:'Q600',bold:'Q700'};
  const typography=load('utils/parentTypography.ts',{'../theme/tokens':{fonts}});
  assert.equal(typography.parentTextFont('Hello', 'semibold', 'web'), 'Q600');
  assert.equal(typography.parentTextFont(['Weekly menu ',{props:{children:'ምግብ'}}], 'bold', 'android'), 'sans-serif');
  assert.equal(typography.parentTextFont('ምግብ', 'regular', 'ios'), 'System');
});
test('all six Today’s Highlights background/text/icon color pairs remain exactly as approved', () => {
  const text=source('screens/home/HomeScreen.tsx');
  const block=text.slice(text.indexOf('// Dynamic Highlights'),text.indexOf('// Attendance badge'));
  const pairs=Array.from(block.matchAll(/bg: "(#[A-Fa-f0-9]+)",\s+ink: "(#[A-Fa-f0-9]+)"/g), match=>[match[1],match[2]]);
  assert.deepEqual(pairs,[['#FFF7CF','#DD7B13'],['#F1EDF6','#6745AF'],['#E8F6F3','#008794'],['#F0F6E8','#3B813C'],['#FFF0E9','#CC423E'],['#FDEDED','#BD4264']]);
});
test('editing allergies preserves opaque medical and routine notes; clearing one section does not clear others', () => {
  const {replaceCareSection}=load('utils/careProfileSections.ts');
  const medical={category:'medical_note',instruction_text:'Exact medication details | dosage and schedule'};
  const routine={category:'general',instruction_text:'Nap: 12:30\nComfort: blanket'};
  const old={category:'allergy',instruction_text:'Old allergy'};
  const next={category:'allergy',instruction_text:'Updated allergy'};
  const updated=replaceCareSection(2,[medical,routine,old],[next,{category:'note',instruction_text:'Not part of this edit'}]);
  assert.equal(updated[0],medical);assert.equal(updated[1],routine);assert.equal(updated[2],next);assert.equal(updated.length,3);
  const cleared=replaceCareSection(2,[medical,routine,old],[]);
  assert.equal(cleared.length,2);assert.equal(cleared[0].instruction_text,medical.instruction_text);
});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function readHarness(api){
  const slots=[],cleanup=[];let cursor=0,pending=[];
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]||=( {current:initial});},
    useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old[j])){slots[i]=deps;pending.push(()=>cleanup.push(fn()));}}};
  const hook=load('hooks/useAnnouncementReads.ts',{'react':react,'../api/client':{apiClient:api},'../utils/announcements':announcements}).useAnnouncementReads;
  const navigation={addListener:()=>()=>{}};
  return {render(){cursor=0;pending=[];const value=hook(navigation);pending.forEach(fn=>fn());return value;},unmount(){cleanup.forEach(fn=>fn?.());}};
}
test('opening an announcement persists its read state, and a later visit hydrates it', async()=>{
  let saved=[];const api={get:async()=>({data:{read_announcement_ids:saved}}),patch:async(_,body)=>({data:{read_announcement_ids:saved=[...saved,body.read_announcement_id]}})};
  const first=readHarness(api);assert.equal(first.render().readIds,null);await turn();
  assert.equal(await first.render().markRead(2),true);assert.deepEqual(Array.from(first.render().readIds),[2]);first.unmount();
  const reopened=readHarness(api);reopened.render();await turn();assert.deepEqual(Array.from(reopened.render().readIds),[2]);
});
test('a failed read acknowledgement keeps the announcement unread and exposes a retry error',async()=>{
  const h=readHarness({get:async()=>({data:{read_announcement_ids:[]}}),patch:async()=>{throw Error('offline');}});
  h.render();await turn();assert.equal(await h.render().markRead(1),false);
  assert.equal(h.render().readIds.length,0);assert.match(h.render().readError,/could not be marked as read/);
});
test('a stale preference fetch cannot erase a newly saved read acknowledgement',async()=>{
  const old=deferred();const h=readHarness({get:()=>old.promise,patch:async()=>({data:{read_announcement_ids:[1]}})});
  h.render();await h.render().markRead(1);old.resolve({data:{read_announcement_ids:[]}});await turn();
  assert.deepEqual(Array.from(h.render().readIds),[1]);
});
test('a preference outage never invents an unread badge and can recover on retry',async()=>{
  let fail=true;const h=readHarness({get:async()=>{if(fail)throw Error('offline');return {data:{read_announcement_ids:[1]}};}});
  h.render();await turn();assert.equal(h.render().readIds,null);assert.match(h.render().readError,/could not be loaded/);
  fail=false;await h.render().refreshReads();assert.deepEqual(Array.from(h.render().readIds),[1]);assert.equal(h.render().readError,'');
});
