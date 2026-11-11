'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createSubscriptionAccess,isCareWrite}=require('../src/middleware/subscription-access');
const {effectiveFeatures,catalogFeatures}=require('../src/modules/saas/package-features');

test('SaaS exact paid-through boundary preserves care and existing debt resolution without inventing renewal',async()=>{
  const boundary=Date.parse('2026-11-09T21:00:00.000Z');
  const invoke=async(now,method,path)=>{
    let lookups=0,nextCalled=false;
    const middleware=createSubscriptionAccess({query:async(sql)=>{lookups++;assert.match(sql,/SELECT subscription_ends_at FROM daycares/);return {rows:[{subscription_ends_at:new Date(boundary)}]};}},()=>now);
    const res={status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
    await middleware({method,originalUrl:path,user:{daycare_id:7}},res,error=>{if(error)throw error;nextCalled=true;});
    return {lookups,nextCalled,res};
  };
  assert.equal((await invoke(boundary-1,'POST','/api/children')).nextCalled,true);
  for(const now of [boundary,boundary+1]){
    const denied=await invoke(now,'POST','/api/children');assert.equal(denied.nextCalled,false);assert.equal(denied.res.body.code,'SUBSCRIPTION_EXPIRED');
    for(const [method,path] of [['GET','/api/parent/children'],['POST','/api/portal/attendance'],['POST','/api/portal/checkout'],['POST','/api/health'],['POST','/api/finances/invoices/12/payments'],['POST','/api/store/orders/12/refund'],['PUT','/api/daycare-payments/settings'],['POST','/api/daycare-payments/requests'],...['verify','review','resolve'].map(action=>['POST','/api/daycare-payments/requests/00000000-0000-4000-8000-000000000001/'+action])]){
      const allowed=await invoke(now,method,path);assert.equal(allowed.nextCalled,true,path);assert.equal(allowed.lookups,0,'care/debt continuation does not invent a subscription payment');
    }
  }
  assert.equal(isCareWrite('POST','/api/children'),false);
  assert.equal(isCareWrite('POST','/api/finances/invoices'),false);
  const cancelled={status:'active',subscription_plan:'premium',subscription_status:'cancelled',subscription_ends_at:new Date(boundary),subscription_terms:{code:'premium',features:catalogFeatures('premium')}};
  assert.equal(effectiveFeatures(cancelled,boundary-1).features.shop,true,'paid cancellation retains the accepted period');
  assert.equal(effectiveFeatures(cancelled,boundary).features.shop,false,'Plus activity ends exactly at the paid-through boundary');
});

test('care invoice overdue state follows Addis Ababa dates, not the connection timezone, and is read-only',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const [center]=await db('daycares').insert({name:'Lifecycle QA center',slug:'lifecycle-qa-center',contact_email:'lifecycle@example.invalid',status:'active',subscription_plan:'standard',subscription_status:'active',subscription_ends_at:new Date(Date.now()+86400000)}).returning('*');
    const [admin,parent]=await db('users').insert([{name:'Lifecycle admin',email:'lifecycle-admin@example.invalid',role_id:1},{name:'Lifecycle parent',email:'lifecycle-parent@example.invalid',role_id:3}].map(row=>({...row,daycare_id:center.id,password_hash:'synthetic',status:'active'}))).returning('*');
    const [child]=await db('children').insert({full_name:'Lifecycle child',dob:'2023-01-01',enrollment_status:'active',daycare_id:center.id}).returning('*');
    await db('guardian_links').insert({child_id:child.id,user_id:parent.id,created_by:admin.id,daycare_id:center.id,relationship:'Parent',pickup_authorized:true});
    const dates=(await pool.query("SELECT (clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date::text AS today,((clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date-1)::text AS yesterday,((clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date+1)::text AS tomorrow")).rows[0];
    const base={daycare_id:center.id,child_id:child.id,parent_id:parent.id,invoice_type:'custom',billing_period:dates.today.slice(0,7)};
    const invoices=await db('child_invoices').insert([
      {...base,title:'Unpaid past due',amount:100,amount_paid:0,due_date:dates.yesterday,status:'pending'},
      {...base,title:'Due today',amount:100,amount_paid:0,due_date:dates.today,status:'pending'},
      {...base,title:'Future obligation',amount:100,amount_paid:0,due_date:dates.tomorrow,status:'pending'},
      {...base,title:'Partially paid past due',amount:300,amount_paid:100,due_date:dates.yesterday,status:'partially_paid'},
      {...base,title:'Paid historical bill',amount:200,amount_paid:200,due_date:dates.yesterday,status:'paid'},
      {...base,title:'Cancelled historical bill',amount:500,amount_paid:0,due_date:dates.yesterday,status:'cancelled'},
    ].map((row,index)=>({...row,billing_period:'2026-'+String(index+1).padStart(2,'0')}))).returning('*');
    const before=await db('child_invoices').where({daycare_id:center.id}).orderBy('id');
    const c=await pool.connect(),dbPath=require.resolve('../src/config/db'),servicePath=require.resolve('../src/modules/finances/finances.service');
    const oldDb=require.cache[dbPath],oldService=require.cache[servicePath];
    try{
      // At least one extreme timezone always differs from the Addis date.
      for(const timezone of ['Pacific/Kiritimati','Etc/GMT+12']){
        await c.query("SELECT set_config('TimeZone',$1,false)",[timezone]);
        const local=(await c.query('SELECT CURRENT_DATE::text AS date')).rows[0].date;
        if(local===dates.today)continue;
        let queued=Promise.resolve();const scopedQuery=(...args)=>{const result=queued.then(()=>c.query(...args));queued=result.catch(()=>{});return result;};
        require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:scopedQuery}};delete require.cache[servicePath];
        const service=require(servicePath),overview=await service.getOverview(center.id);
        assert.equal(overview.total_overdue,300,'only prior Addis calendar days with unpaid balances are overdue');
        assert.equal(overview.total_outstanding,500);
        const overdue=await service.listInvoices(center.id,{status:'overdue'});
        assert.deepEqual(overdue.map(row=>row.id).sort((a,b)=>a-b),[invoices[0].id,invoices[3].id].sort((a,b)=>a-b));
      }
    }finally{
      await c.query('RESET TIME ZONE');c.release();
      if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];if(oldService)require.cache[servicePath]=oldService;else delete require.cache[servicePath];
    }
    assert.deepEqual(await db('child_invoices').where({daycare_id:center.id}).orderBy('id'),before,'due-date reads never debit or change invoice history');
    assert.equal((await db('daycares').where({id:center.id}).first()).subscription_status,'active','parent debt never changes daycare SaaS subscription');
    assert.equal((await db('guardian_links').where({child_id:child.id,user_id:parent.id}).first()).pickup_authorized,true,'parent debt never revokes authorized pickup');
  });
});
