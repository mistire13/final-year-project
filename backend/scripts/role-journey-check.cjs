'use strict';
// Real HTTP journeys against the explicitly owned disposable fixture only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg'),bcrypt=require('bcryptjs');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const artifact=path.resolve(__dirname,'../../tmp/subscription-backups/plus-ui-acceptance/fixture.json');
const reportFile=path.resolve(__dirname,'../../tmp/role-journey-api-results.json');
const fixture=JSON.parse(fs.readFileSync(artifact,'utf8'));
assert.equal(fixture.purpose,'Disposable local acceptance ONLY');
assert.match(fixture.database,new RegExp(`^ankelba_auth_test_${fixture.pid}_\\d+_[a-f0-9]{8}$`));
assert.notEqual(fixture.database,process.env.DB_NAME);
assert.match(fixture.api,/^http:\/\/localhost:\d+\/api$/);
const results=[];
async function request(method,route,token,body){
  const response=await fetch(fixture.api+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
}
function expect(label,result,status){assert.equal(result.status,status,`${label}: ${JSON.stringify(result.body)}`);results.push({label,status,result:'passed'});console.log('PASS '+label);return result.body;}
async function prepare(){
  if(fixture.role_states)return;
  const pool=new Pool({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:fixture.database});
  const c=await pool.connect();
  try{
    assert.equal((await c.query('SELECT name FROM daycares WHERE id=$1',[fixture.daycare_id])).rows[0]?.name,'Disposable Plus acceptance center');
    await c.query('BEGIN');
    const offer=(await c.query("SELECT * FROM subscription_packages WHERE code='standard'")).rows[0];
    const terms=JSON.stringify(require('../src/modules/saas/subscriptions.service').termsFor(offer,'monthly'));
    const started=new Date(Date.now()-7*86400000),ends=new Date(Date.now()+23*86400000),expired=new Date(Date.now()-86400000);
    const standard=(await c.query("UPDATE daycares SET subscription_status='active',subscription_started_at=$1,subscription_ends_at=$2,subscription_terms=$3,max_children=50 WHERE name='Disposable Standard comparison center' RETURNING id",[started,ends,terms])).rows[0];
    const ended=(await c.query("INSERT INTO daycares(name,slug,contact_email,status,subscription_plan,subscription_status,subscription_started_at,subscription_ends_at,subscription_terms,max_children) VALUES('Disposable expired acceptance center',$1,'expired-center@example.invalid','active','standard','active',$2,$3,$4,50) RETURNING id",['expired-'+crypto.randomBytes(6).toString('hex'),new Date(Date.now()-32*86400000),expired,terms])).rows[0];
    const hash=await bcrypt.hash(fixture.password,4);
    const states={};
    for(const [code,dc] of [['standard',standard],['expired',ended]]){
      const people={};
      for(const [role,roleId]of [['admin',1],['caregiver',2],['parent',3]]){
        const email=`${code}-${role}@example.invalid`;
        const user=(await c.query('INSERT INTO users(name,email,password_hash,role_id,daycare_id,status,profile_complete) VALUES($1,$2,$3,$4,$5,\'active\',true) RETURNING id',[`Disposable ${code} ${role}`,email,hash,roleId,dc.id])).rows[0];
        fixture.accounts[`${code}_${role}`]=email;people[role]=user.id;
      }
      const group=(await c.query('INSERT INTO groups(name,daycare_id,lead_caregiver_id) VALUES($1,$2,$3) RETURNING id',[`${code} classroom`,dc.id,people.caregiver])).rows[0];
      const child=(await c.query("INSERT INTO children(full_name,dob,enrollment_status,daycare_id,group_id,caregiver_id,monthly_care_fee) VALUES($1,'2023-01-01','active',$2,$3,$4,500) RETURNING id",[`Disposable ${code} child`,dc.id,group.id,people.caregiver])).rows[0];
      await c.query("INSERT INTO guardian_links(daycare_id,child_id,user_id,created_by,relationship,pickup_authorized) VALUES($1,$2,$3,$4,'Parent',true)",[dc.id,child.id,people.parent,people.admin]);
      const invoice=(await c.query("INSERT INTO child_invoices(daycare_id,child_id,parent_id,invoice_type,billing_period,title,amount,amount_paid,due_date,status,created_at) VALUES($1,$2,$3,'custom',to_char(NOW(),'YYYY-MM'),$4,500,0,(NOW() AT TIME ZONE 'Africa/Addis_Ababa')::date,'pending',NOW()-INTERVAL '2 days') RETURNING id",[dc.id,child.id,people.parent,`Disposable ${code} existing bill`])).rows[0];
      const accounts={cbe:{enabled:true,account_holder:`Disposable ${code} receiver`,account_number:code==='standard'?'1000000902':'1000000903'},abyssinia:{enabled:false,account_holder:'',account_number:''},telebirr:{enabled:false,account_holder:'',account_number:''}};
      await c.query('INSERT INTO daycare_payment_settings(daycare_id,accounts,updated_by) VALUES($1,$2,$3)',[dc.id,JSON.stringify(accounts),people.admin]);
      states[code]={daycare_id:dc.id,child_id:child.id,invoice_id:invoice.id,...people};
    }
    await c.query('COMMIT');fixture.role_states=states;fs.writeFileSync(artifact,JSON.stringify(fixture,null,2));console.log('Prepared owned disposable Standard and expired-role fixtures.');
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await pool.end();}
}
async function run(){
  await prepare();if(process.argv.includes('--prepare'))return;
  const tokens={},users={};
  for(const [role,email]of Object.entries(fixture.accounts)){
    const logged=expect(role+' real password login',await request('POST','/auth/login',null,{email,password:fixture.password}),200);tokens[role]=logged.token;users[role]=logged.user;
    const me=expect(role+' authenticated identity',await request('GET','/auth/me',tokens[role]),200);assert.equal(me.user.email,email);
  }
  for(const role of ['parent','caregiver','operator'])expect(role+' denied administrator finance',await request('GET','/finances/overview',tokens[role]),403);
  for(const role of ['parent','caregiver','admin'])expect(role+' denied platform governance',await request('GET','/super-admin/daycares',tokens[role]),403);
  expect('other daycare cannot read child reports',await request('GET',`/reports/daily/child/${fixture.child_id}`,tokens.other_parent),404);
  expect('other daycare cannot read child health',await request('GET',`/health/child/${fixture.child_id}`,tokens.other_parent),404);
  expect('caregiver cannot create invoice',await request('POST','/finances/invoices',tokens.caregiver,{}),403);
  expect('parent cannot create care report',await request('POST','/reports/daily',tokens.parent,{}),403);
  for(const state of ['standard','expired']){
    const f=fixture.role_states[state],admin=tokens[`${state}_admin`],parent=tokens[`${state}_parent`],caregiver=tokens[`${state}_caregiver`];
    expect(state+' existing invoice remains readable',await request('GET',`/finances/invoices/${f.invoice_id}`,admin),200);
    expect(state+' parent care bills remain readable',await request('GET','/finances/parent/my-bills',parent),200);
    expect(state+' caregiver safety workspace remains readable',await request('GET','/portal/workspace',caregiver),200);
    const receipt=expect(state+' parent can start existing bill verification',await request('POST','/daycare-payments/requests',parent,{purpose:'invoice',target_id:f.invoice_id,provider:'cbe',request_key:crypto.randomUUID()}),200);
    assert.equal(Number(receipt.amount),500);assert.equal(receipt.expected.account_number,state==='standard'?'1000000902':'1000000903');
    expect(state+' Plus business analytics denied',await request('GET','/plus/analytics',admin),403);
    expect(state+' new shop product denied',await request('POST','/store/products',admin,{name:'Forbidden synthetic product',price:1,stock_qty:1,available:true}),403);
    expect(state+' cannot allocate another tenant invoice',await request('GET',`/finances/invoices/${fixture.care_invoice_id}`,admin),404);
  }
  const expired=fixture.role_states.expired;
  expect('expired subscription blocks new invoice',await request('POST','/finances/invoices',tokens.expired_admin,{child_id:expired.child_id,title:'Must be blocked',amount:20,due_date:'2026-12-10',invoice_type:'custom'}),403);
  const health=expect('caregiver records a health observation',await request('POST','/health',tokens.caregiver,{child_id:fixture.child_id,record_type:'health',description:'Disposable journey observation only',severity:'low',parent_notified:false}),201);
  const notices=expect('parent reads caregiver health observation',await request('GET',`/health/child/${fixture.child_id}`,tokens.parent),200);assert.match(JSON.stringify(notices),/Disposable journey observation only/);
  const ann=expect('admin publishes internal disposable parent announcement',await request('POST','/communication/announcements',tokens.admin,{title:'Disposable journey announcement',body:'Synthetic parent feed acceptance only.',audience:'parents',request_key:crypto.randomUUID()}),201);
  assert.match(JSON.stringify(expect('parent reads targeted announcement',await request('GET','/communication/announcements',tokens.parent),200)),/Disposable journey announcement/);
  assert.doesNotMatch(JSON.stringify(expect('other daycare cannot see targeted announcement',await request('GET','/communication/announcements',tokens.other_parent),200)),/Disposable journey announcement/);
  const msg=expect('parent sends internal disposable caregiver message',await request('POST','/communication/messages',tokens.parent,{recipient_id:users.caregiver.id,subject:'Disposable journey',body:'Synthetic journey message from parent.'}),201);
  assert.match(JSON.stringify(expect('caregiver receives linked parent message',await request('GET','/communication/messages',tokens.caregiver),200)),/Synthetic journey message from parent/);
  expect('parent cannot message unrelated tenant',await request('POST','/communication/messages',tokens.parent,{recipient_id:fixture.role_states.standard.caregiver,body:'Should be blocked'}),404);
  expect('invalid invoice amount rejected visibly by API',await request('POST','/finances/invoices',tokens.admin,{child_id:fixture.child_id,title:'Invalid amount',amount:-1,due_date:'2026-12-10'}),422);
  const custom=expect('admin creates a registration fee invoice',await request('POST','/finances/invoices',tokens.admin,{child_id:fixture.child_id,title:'Disposable cash journey fee',amount:25,due_date:'2026-12-10',billing_period:'2026-12',invoice_type:'registration_fee'}),201);
  const paid=expect('admin records real-path synthetic cash receipt',await request('POST',`/finances/invoices/${custom.invoice.id}/payments`,tokens.admin,{amount_paid:25,payment_method:'cash_at_daycare',notes:'Synthetic acceptance only; no real cash received.'}),201);assert.equal(paid.receipt.verification_source,'cash_confirmed');
  assert.match(JSON.stringify(expect('parent receives settled cash bill and receipt',await request('GET','/finances/parent/my-bills',tokens.parent),200)),/cash_confirmed/);
  expect('anonymous cannot read private bills',await request('GET','/finances/parent/my-bills'),401);
  for(const role of Object.keys(tokens))expect(role+' test session logout',await request('POST','/auth/logout',tokens[role]),200);
  expect('logged-out parent cannot reuse token',await request('GET','/auth/me',tokens.parent),401);
  console.log(`Role journey API acceptance: ${results.length} passed.`);
}
run().catch(error=>{results.push({result:'failed',message:error.message});console.error(error.message);process.exitCode=1;}).finally(()=>fs.writeFileSync(reportFile,JSON.stringify({scope:'Owned disposable fixture; no live provider/email',checks:results},null,2)));
