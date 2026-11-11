'use strict';
// Authenticated acceptance probes only against the owned local fixture server.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function run(){
  const f=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../tmp/subscription-backups/plus-ui-acceptance/fixture.json'),'utf8'));
  assert.equal(f.purpose,'Disposable local acceptance ONLY');
  assert.match(f.database,/^ankelba_auth_test_\d+_\d+_[a-f0-9]{8}$/);
  const url=new URL(f.api);assert.equal(url.hostname,'localhost');assert.equal(url.protocol,'http:');
  const request=async(method,route,token,body)=>{const response=await fetch(f.api+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
  let checks=0;const expect=(label,result,status)=>{assert.equal(result.status,status,label+': '+JSON.stringify(result.body));checks++;console.log('PASS '+label);};
  expect('anonymous parent data is denied',await request('GET','/parent/children'),401);
  expect('incorrect password is denied',await request('POST','/auth/login',null,{email:f.accounts.parent,password:'wrong-disposable-password'}),401);
  const tokens={};
  for(const [role,email] of Object.entries(f.accounts)){
    const logged=await request('POST','/auth/login',null,{email,password:f.password});expect(role+' password login',logged,200);
    assert.ok(logged.body.token);tokens[role]=logged.body.token;
    const me=await request('GET','/auth/me',tokens[role]);expect(role+' authenticated identity',me,200);assert.equal(me.body.user.email,email);
  }
  expect('admin snapshot',await request('GET','/portal/snapshot',tokens.admin),200);
  expect('caregiver workspace',await request('GET','/portal/workspace',tokens.caregiver),200);
  expect('parent linked children',await request('GET','/parent/children',tokens.parent),200);
  expect('operator governance',await request('GET','/super-admin/daycares',tokens.operator),200);
  expect('parent cannot access administrator snapshot',await request('GET','/portal/snapshot',tokens.parent),403);
  expect('caregiver cannot access administrator snapshot',await request('GET','/portal/snapshot',tokens.caregiver),403);
  expect('operator cannot read parent child records',await request('GET','/parent/children',tokens.operator),403);
  expect('other daycare cannot read linked child',await request('GET',`/parent/children/${f.child_id}`,tokens.other_parent),403);
  expect('Plus administrator analytics',await request('GET','/plus/analytics',tokens.admin),200);
  expect('caregiver cannot read business analytics',await request('GET','/plus/analytics',tokens.caregiver),403);
  expect('Plus administrator schedule',await request('GET','/staff-scheduling',tokens.admin),200);
  expect('caregiver own schedule',await request('GET','/staff-scheduling',tokens.caregiver),200);
  expect('parent cannot read staff schedule',await request('GET','/staff-scheduling',tokens.parent),403);
  expect('parent private email preference',await request('GET','/billing-automation/my-reminders/preferences',tokens.parent),200);
  const settings=await request('GET','/daycare-payments/settings',tokens.admin);expect('administrator daycare receiving settings',settings,200);
  assert.equal(settings.body.accounts.cbe.account_number,'1000000901');
  const destinations=await request('GET','/daycare-payments/receiving-accounts',tokens.parent);expect('parent safe daycare receiving destinations',destinations,200);
  assert.deepEqual(destinations.body.accounts.map(a=>a.account_number),['1000000901'],'receiving destination must not fall back to platform SaaS receiver');
  expect('parent cannot edit or inspect administrator receiving settings',await request('GET','/daycare-payments/settings',tokens.parent),403);
  expect('caregiver cannot inspect receipt requests',await request('GET','/daycare-payments/requests',tokens.caregiver),403);
  expect('platform operator cannot inspect daycare receiving settings',await request('GET','/daycare-payments/settings',tokens.operator),403);
  const foreignDestinations=await request('GET','/daycare-payments/receiving-accounts',tokens.other_parent);expect('other daycare sees only its own configured receivers',foreignDestinations,200);assert.deepEqual(foreignDestinations.body.accounts,[]);
  expect('parent can log out',await request('POST','/auth/logout',tokens.parent),200);
  expect('logged out parent token is revoked',await request('GET','/auth/me',tokens.parent),401);
  expect('parent logout preserves caregiver session',await request('GET','/auth/me',tokens.caregiver),200);
  console.log(`Authenticated disposable UI API acceptance: ${checks} checks passed. No credentials or tokens printed.`);
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
