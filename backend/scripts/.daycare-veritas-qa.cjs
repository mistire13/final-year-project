'use strict';
// Local interactive acceptance only. The helper owns and deletes the generated
// database; configured application databases are never seeded or written.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {randomBytes}=require('node:crypto');
const {createInterface}=require('node:readline');
const {once}=require('node:events');
const {Pool,types}=require('pg');
const bcrypt=require('bcryptjs');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {setupRuntimeRoles}=require('./setup-runtime-roles.cjs');
const {createTenantPool}=require('../src/db/tenant-pool');
types.setTypeParser(1082,value=>value);
const artifactDir=path.resolve(__dirname,'../../tmp/subscription-backups/plus-ui-acceptance');
const artifact=path.join(artifactDir,'fixture.json');
const stopFile=path.join(artifactDir,'stop.json');

async function run(){
  const port=Number(process.env.PLUS_UI_API_PORT||5300);
  assert.ok(Number.isSafeInteger(port)&&port>=1024&&port<=65535,'Use a local unprivileged fixture port.');
  await withCurrentDatabase(async({db,pool,name})=>{
    const suffix=randomBytes(6).toString('hex');
    const roles=[{user:`plus_ui_t_${suffix}`,password:randomBytes(32).toString('hex'),group:'ankelba_tenant',other:'ankelba_control'},
      {user:`plus_ui_c_${suffix}`,password:randomBytes(32).toString('hex'),group:'ankelba_control',other:'ankelba_tenant'}];
    let raw,control,server;
    try{
      await setupRuntimeRoles(pool,roles);
      const connection={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),database:name};
      raw=new Pool({...connection,user:roles[0].user,password:roles[0].password});
      control=new Pool({...connection,user:roles[1].user,password:roles[1].password});
      const tenant=createTenantPool(raw);tenant.control=control;
      await require('../src/db/runtime-policy').verifyRuntime(raw,control);
      await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
      await db('subscription_packages').where({code:'standard'}).update({monthly_price:200,six_month_price:1100,annual_price:2000});
      await db('subscription_packages').where({code:'premium'}).update({monthly_price:400,six_month_price:2200,annual_price:4000});
      await db('subscription_payment_settings').where({id:1}).update({bank_accounts:JSON.stringify({cbe:{enabled:true,account_holder:'Disposable receiver',account_number:'1000000001'},abyssinia:{enabled:true,account_holder:'Disposable receiver',account_number:'1000000002'}})});
      const offers=await db('subscription_packages');
      const {termsFor}=require('../src/modules/saas/subscriptions.service');
      const terms=termsFor(offers.find(row=>row.code==='premium'),'monthly');
      const started=new Date(Date.now()-7*86400000),ends=new Date(Date.now()+23*86400000);
      const [center,other]=await db('daycares').insert([
        {name:'Disposable Plus acceptance center',slug:`plus-ui-${suffix}`,contact_email:'center@example.invalid',status:'active',subscription_plan:'premium',subscription_status:'active',subscription_started_at:started,subscription_ends_at:ends,subscription_terms:JSON.stringify(terms),max_children:150},
        {name:'Disposable Standard comparison center',slug:`standard-ui-${suffix}`,contact_email:'other-center@example.invalid',status:'active',subscription_plan:'standard'},
      ]).returning('*');
      const password=`Synthetic-${randomBytes(12).toString('hex')}!`,hash=await bcrypt.hash(password,4);
      const [admin,caregiver,parent,owner,outsider]=await db('users').insert([
        {name:'Acceptance administrator',email:'admin@example.invalid',role_id:1,daycare_id:center.id},
        {name:'Acceptance caregiver',email:'caregiver@example.invalid',role_id:2,daycare_id:center.id},
        {name:'Acceptance parent',email:'parent@example.invalid',role_id:3,daycare_id:center.id},
        {name:'Acceptance platform operator',email:'owner@example.invalid',role_id:0,daycare_id:null},
        {name:'Other daycare parent',email:'other-parent@example.invalid',role_id:3,daycare_id:other.id},
      ].map(row=>({...row,password_hash:hash,status:'active',profile_complete:true}))).returning('*');
      const [group]=await db('groups').insert({name:'Acceptance classroom',daycare_id:center.id,lead_caregiver_id:caregiver.id}).returning('*');
      const [child]=await db('children').insert({full_name:'Disposable child',dob:'2023-01-01',enrollment_status:'active',daycare_id:center.id,group_id:group.id,caregiver_id:caregiver.id,monthly_care_fee:2000}).returning('*');
      await db('guardian_links').insert({child_id:child.id,user_id:parent.id,created_by:admin.id,daycare_id:center.id,relationship:'Parent',pickup_authorized:true});
      await db('attendance').insert({child_id:child.id,recorded_by:caregiver.id,event_type:'checkin',daycare_id:center.id});
      const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
      const [careInvoice]=await db('child_invoices').insert({daycare_id:center.id,child_id:child.id,parent_id:parent.id,invoice_type:'custom',billing_period:today.slice(0,7),title:'Disposable care fee',amount:2000,amount_paid:0,due_date:today,status:'pending',created_at:new Date(Date.now()-2*86400000)}).returning('*');
      // This is the application's real legacy password/JWT authentication path.
      // Preview MFA authentication has separate frontend work and is not bypassed.
      process.env.NODE_ENV='test';process.env.DAYCARE_AUTH_ENABLED='false';
      process.env.JWT_SECRET=randomBytes(48).toString('hex');
      process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE='false';
      process.env.BILLING_AUTOMATION_ENABLED='false';process.env.BILLING_AUTOMATION_EMAIL_ENABLED='false';
      for(const key of ['VERITAS_API_KEY','GROQ_API_KEY','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'])delete process.env[key];
      const replace=(name,value)=>{const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports:value};};
      replace('../src/config/db',tenant);
      const veritas=require('../src/modules/saas/veritas-client');
      replace('../src/modules/saas/veritas-client',{...veritas,extractVeritasReceipt:async()=>({available:true,provider:'cbe',reference:'v2-SyntheticShopProof01'}),
        lookupVeritas:async({provider,reference})=>{
          if(provider!=='cbe')return {available:false,code:'reference_unconfirmed'};
          const token=new URL(reference).pathname.slice(1);
          if(!['v2-SyntheticShopProof01','v2-SyntheticTuitionProof01'].includes(token))return {available:false,code:'reference_unconfirmed'};
          return {available:true,result:{success:true,payer:'Acceptance parent',receiver:'Disposable daycare care receiver',
            receiverAccount:'1000000901',amount:token.includes('Shop')?100:2000,date:new Date().toISOString(),reference:token}};
        }});
      replace('nodemailer',{createTransport:()=>({sendMail:async()=>{throw new Error('External delivery is disabled in this disposable fixture.');}})});
      const adminUser={...admin,role:'admin'},parentUser={...parent,role:'parent'};
      const store=require('../src/modules/store/store.service');
      const seeded=await tenant.withTenant(center.id,async()=>{
        const receipts=require('../src/modules/daycare-payments/service').createDaycarePayments(tenant);
        await receipts.saveSettings({version:0,accounts:{cbe:{enabled:true,account_holder:'Disposable daycare care receiver',account_number:'1000000901'},abyssinia:{enabled:false,account_holder:'',account_number:''},telebirr:{enabled:false,account_holder:'',account_number:''}},reason:'Synthetic isolated acceptance receiving account'},adminUser);
        const product=await store.createProduct({name:'Disposable classroom book',price:100,stock_qty:20,available:true},adminUser);
        const order=await store.placeOrder({idempotency_key:'plus-fixture-cash-order-01',items:[{product_id:product.id,quantity:2}]},parentUser);
        const paid=await store.updateOrderStatus(order.id,{version:order.version,order_status:'confirmed',payment_status:'paid',amount_received:200,payment_confirmed:true,payment_reason:'Synthetic fixture cash physically received'},adminUser);
        const scheduling=require('../src/modules/staff-scheduling/staff-scheduling.service').createStaffScheduling(tenant);
        const template=await scheduling.createTemplate({name:'Acceptance weekday template',rules:[1,2,3,4,5].map(weekday=>({staff_id:caregiver.id,group_id:group.id,weekday,start_time:'09:00',end_time:'17:00',can_attendance:true,can_pickup:true}))},adminUser);
        const unpaid=await store.placeOrder({idempotency_key:'plus-fixture-bank-order-01',items:[{product_id:product.id,quantity:1}]},parentUser);
        return {product_id:product.id,paid_order_id:paid.id,unpaid_order_id:unpaid.id,care_invoice_id:careInvoice.id,template_id:template.id};
      });
      server=require('../src/app').listen(port,'127.0.0.1');await once(server,'listening');
      fs.mkdirSync(artifactDir,{recursive:true});
      fs.writeFileSync(artifact,JSON.stringify({purpose:'Disposable local acceptance ONLY',pid:process.pid,database:name,api:`http://localhost:${port}/api`,frontend_hint:'EXPO_PUBLIC_API_URL=http://localhost:'+port+'/api',password,accounts:{admin:admin.email,caregiver:caregiver.email,parent:parent.email,operator:owner.email,other_parent:outsider.email},daycare_id:center.id,child_id:child.id,...seeded,stop:'Type stop in stdin, or write {"pid":'+process.pid+'} to stop.json next to this file for exact cleanup.'},null,2));
      console.log(`Disposable Plus acceptance API ready at http://localhost:${port}/api. Credentials and fixture IDs: ${artifact}. Type stop to clean up.`);
      await new Promise(resolve=>{
        const input=createInterface({input:process.stdin});let stopped=false;
        const timer=setInterval(()=>{try{if(JSON.parse(fs.readFileSync(stopFile,'utf8')).pid===process.pid){fs.rmSync(stopFile);stop();}}catch{}},500);
        const stop=()=>{if(stopped)return;stopped=true;clearInterval(timer);input.close();process.stdin.destroy();process.off('SIGINT',stop);process.off('SIGTERM',stop);resolve();};
        input.on('line',line=>{if(line.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
      });
    }finally{
      if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
      if(raw)await raw.end();if(control)await control.end();
      for(const role of roles){
        if((await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role.user])).rows.length){await pool.query(`DROP OWNED BY "${role.user}"`);await pool.query(`DROP ROLE "${role.user}"`);}
      }
      if(fs.existsSync(artifact)&&JSON.parse(fs.readFileSync(artifact,'utf8')).pid===process.pid)fs.rmSync(artifact);
    }
  });
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});

