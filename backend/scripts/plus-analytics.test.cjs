'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createAnalyticsService,range,money,change,csvCell,csv,groupAttendance}=require('../src/modules/analytics/plus-analytics.service');

test('analytics validates real calendar dates, bounds ranges and keeps monetary comparisons exact',()=>{
  assert.deepEqual(range({from:'2026-11-01',to:'2026-11-03'},'2026-11-08').previous,{from:'2026-10-29',to:'2026-10-31'});
  for(const query of [{from:'2026-02-30',to:'2026-03-01'},{from:'2024-01-01',to:'2026-01-01'},{to:'2026-11-09'},{group_id:'1;DELETE'},{daycare_id:'9'}])assert.throws(()=>range(query,'2026-11-08'),error=>error.statusCode===422);
  assert.equal(money('9999999999999999.01'),'9999999999999999.01');
  assert.deepEqual(change('10.00','20.00',true),{difference:'-10.00',percent:-50});
  assert.deepEqual(change(3,0),{difference:3,percent:null});
  assert.equal(csvCell('=HYPERLINK("evil")'),'"\'=HYPERLINK(""evil"")"');
  assert.equal(csvCell('-20.25'),'"-20.25"');
});

test('attendance groups actual recorded child-days across calendar weeks and months with clipped edges',()=>{
  const daily=[{date:'2026-10-31',present:2,absent:0},{date:'2026-11-01',present:0,absent:1},{date:'2026-11-02',present:1,absent:1},{date:'2026-11-03',present:0,absent:0}];
  const weekly=groupAttendance(daily,'week');assert.equal(weekly.length,2);
  assert.deepEqual(weekly[0],{from:'2026-10-31',to:'2026-11-01',present:2,absent:1,recorded_child_days:3,present_percent:66.67});
  assert.deepEqual(weekly[1],{from:'2026-11-02',to:'2026-11-03',present:1,absent:1,recorded_child_days:2,present_percent:50});
  const monthly=groupAttendance(daily,'month');assert.equal(monthly.length,2);assert.equal(monthly[1].recorded_child_days,3);assert.equal(monthly[1].present_percent,33.33);
  assert.equal(groupAttendance([{date:'2026-11-01',present:0,absent:0}])[0].present_percent,null);
  assert.equal(range({attendance_grouping:'week'},'2026-11-08').attendance_grouping,'week');
  for(const value of ['weekly','',[],{}])assert.throws(()=>range({attendance_grouping:value},'2026-11-08'),error=>error.statusCode===422);
});

test('Plus analytics reconcile actual periods, isolate tenants and record genuine occupancy changes',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const terms=code=>({code,name:code==='premium'?'Plus':'Standard',price:'200.00',currency:'ETB',billing_cycle:'monthly'});
    const [plus,other,standard]=await db('daycares').insert([
      {name:'Synthetic Plus',contact_email:'analytics-plus@example.invalid',slug:'analytics-plus',status:'active',subscription_plan:'premium',subscription_status:'active',subscription_terms:terms('premium'),subscription_ends_at:new Date(Date.now()+86400000),max_children:50},
      {name:'Other daycare',contact_email:'analytics-other@example.invalid',slug:'analytics-other',status:'active',subscription_plan:'premium',subscription_status:'active',subscription_terms:terms('premium'),subscription_ends_at:new Date(Date.now()+86400000),max_children:50},
      {name:'Standard daycare',contact_email:'analytics-standard@example.invalid',slug:'analytics-standard',status:'active',subscription_plan:'standard',subscription_status:'active',subscription_terms:terms('standard'),subscription_ends_at:new Date(Date.now()+86400000),max_children:50},
    ]).returning('*');
    const [admin,parent,otherAdmin,standardAdmin]=await db('users').insert([
      {name:'Report owner',email:'plus-analytics-owner@example.invalid',role_id:1,status:'active',password_hash:'synthetic',daycare_id:plus.id},
      {name:'Parent',email:'plus-analytics-parent@example.invalid',role_id:3,status:'active',password_hash:'synthetic',daycare_id:plus.id},
      {name:'Other owner',email:'plus-analytics-other@example.invalid',role_id:1,status:'active',password_hash:'synthetic',daycare_id:other.id},
      {name:'Standard owner',email:'plus-analytics-standard@example.invalid',role_id:1,status:'active',password_hash:'synthetic',daycare_id:standard.id},
    ]).returning('*');
    const [group,foreignGroup]=await db('groups').insert([{name:'=Synthetic Classroom',daycare_id:plus.id},{name:'Private classroom',daycare_id:other.id}]).returning('*');
    const [child,foreignChild]=await db('children').insert([{full_name:'Synthetic child',dob:'2022-01-01',daycare_id:plus.id,group_id:group.id,enrollment_status:'active'},
      {full_name:'Other child',dob:'2022-01-01',daycare_id:other.id,group_id:foreignGroup.id,enrollment_status:'active'}]).returning('*');
    await db('attendance').insert([
      {child_id:child.id,recorded_by:admin.id,daycare_id:plus.id,event_type:'checkin',event_time:'2026-10-31T21:30:00Z'},
      {child_id:child.id,recorded_by:admin.id,daycare_id:plus.id,event_type:'checkout',event_time:'2026-11-01T10:00:00Z'},
      {child_id:child.id,recorded_by:admin.id,daycare_id:plus.id,event_type:'absent',event_time:'2026-11-01T06:00:00Z'},
      {child_id:child.id,recorded_by:admin.id,daycare_id:plus.id,event_type:'absent',event_time:'2026-11-02T06:00:00Z'},
      {child_id:foreignChild.id,recorded_by:otherAdmin.id,daycare_id:other.id,event_type:'checkin',event_time:'2026-11-01T06:00:00Z'},
    ]);
    const [currentInvoice,previousInvoice]=await db('child_invoices').insert([
      {daycare_id:plus.id,child_id:child.id,parent_id:parent.id,billing_period:'2026-11',title:'November fees',amount:100,amount_paid:60,status:'partially_paid',due_date:'2026-11-01',created_at:'2026-11-01T06:00:00Z'},
      {daycare_id:plus.id,child_id:child.id,parent_id:parent.id,billing_period:'2026-10',title:'October fees',amount:200,amount_paid:100,status:'partially_paid',due_date:'2026-10-30',created_at:'2026-10-30T06:00:00Z'},
    ]).returning('*');
    await db('child_invoices').insert({daycare_id:plus.id,child_id:child.id,billing_period:'2026-09',title:'Cancelled',amount:999,amount_paid:0,status:'cancelled',due_date:'2026-11-01',created_at:'2026-11-01T06:00:00Z'});
    await db('child_payments').insert([
      {daycare_id:plus.id,invoice_id:currentInvoice.id,amount_paid:60,payment_method:'cash_at_daycare',receipt_number:'SYNTHETIC-ONE',recorded_by:admin.id,verified_at:'2026-11-02T06:00:00Z'},
      {daycare_id:plus.id,invoice_id:previousInvoice.id,amount_paid:100,payment_method:'cash_at_daycare',receipt_number:'SYNTHETIC-TWO',recorded_by:admin.id,verified_at:'2026-11-02T06:00:00Z'},
    ]);
    const [product]=await db('products').insert({daycare_id:plus.id,name:'Synthetic supplies',price:5,stock_qty:2,available:true,created_by:admin.id}).returning('*');
    const [paidOrder,demoOrder]=await db('orders').insert([
      {daycare_id:plus.id,parent_id:parent.id,total:15,order_status:'collected',payment_status:'paid',created_at:'2026-10-30T06:00:00Z'},
      {daycare_id:plus.id,parent_id:parent.id,total:99,order_status:'placed',payment_status:'paid',created_at:'2026-11-02T06:00:00Z'},
    ]).returning('*');
    await db('payments').insert([{order_id:paidOrder.id,method:'pay_at_daycare',status:'paid',verified_at:'2026-11-02T06:00:00Z'},
      {order_id:demoOrder.id,method:'demo',status:'paid',verified_at:'2026-11-02T06:00:00Z'}]);
    await db('order_items').insert([{daycare_id:plus.id,order_id:paidOrder.id,product_id:product.id,quantity:3,unit_price:5},
      {daycare_id:plus.id,order_id:demoOrder.id,product_id:product.id,quantity:1,unit_price:99}]);
    const service=createAnalyticsService(pool,{today:()=> '2026-11-08'}),user={id:admin.id,daycare_id:plus.id,role:'admin'};
    const result=await service.report(user,{from:'2026-11-01',to:'2026-11-03'});
    assert.equal(result.current.attendance.present,1);assert.equal(result.current.attendance.absent,1);assert.equal(result.current.attendance.daily[0].present,1);
    assert.equal(result.current.care_fees.billed,'100.00');assert.equal(result.current.care_fees.collected,'160.00');assert.equal(result.current.care_fees.outstanding_now,'40.00');
    assert.equal(result.previous.care_fees.billed,'200.00');assert.equal(result.previous.care_fees.collected,'0.00');assert.equal(result.previous.care_fees.outstanding_now,'100.00');
    assert.equal(result.current.shop.collected,'15.00');assert.equal(result.current.shop.paid_orders,1);assert.equal(result.best_sellers[0].units,3);
    assert.equal(result.current.shop.paid_orders_placed,1);assert.equal(result.current.shop.unpaid_orders,0);
    assert.equal(result.low_stock[0].stock_qty,2);assert.equal(result.occupancy.current_active_children,1);assert.equal(result.occupancy.observations.length,0);
    const weekly=await service.report(user,{from:'2026-11-01',to:'2026-11-03',attendance_grouping:'week'});
    assert.equal(weekly.current.attendance.grouped.length,2);assert.equal(weekly.current.attendance.grouped[0].to,'2026-11-01');assert.equal(weekly.current.attendance.grouped[1].from,'2026-11-02');
    assert.equal(weekly.current.attendance.grouped.reduce((sum,row)=>sum+row.recorded_child_days,0),weekly.current.attendance.recorded_child_days);
    assert.ok(csv(weekly).includes('"Attendance grouping","week"'));assert.ok(csv(weekly).includes('"Previous"'));
    assert.ok(result.occupancy.coverage_started_at);assert.equal(result.groups.length,1);assert.ok(csv(result).includes("'=Synthetic Classroom"));
    await assert.rejects(service.report({...user,daycare_id:other.id},{from:'2026-11-01',to:'2026-11-03'}),error=>error.statusCode===403);
    await assert.rejects(service.report({id:standardAdmin.id,daycare_id:standard.id,role:'admin'},{}),error=>error.statusCode===403);
    await assert.rejects(service.report({...user,role:'parent'},{}),error=>error.statusCode===403);
    await assert.rejects(service.report(user,{from:'2026-11-01',to:'2026-11-03',group_id:String(foreignGroup.id)}),error=>error.statusCode===404);
    const before=(await db('daycare_occupancy_observations').where({daycare_id:plus.id}).orderBy('id')).at(-1);
    const unchangedCount=await db('daycare_occupancy_observations').where({daycare_id:plus.id}).count('* as n').first();
    await db('daycares').where({id:plus.id}).update({max_children:50});
    await db('children').where({id:child.id}).update({enrollment_status:'active'});
    assert.equal((await db('daycare_occupancy_observations').where({daycare_id:plus.id}).count('* as n').first()).n,unchangedCount.n);
    await db('daycares').where({id:plus.id}).update({max_children:60});
    await db('children').where({id:child.id}).update({enrollment_status:'inactive'});
    const observed=await db('daycare_occupancy_observations').where({daycare_id:plus.id}).orderBy('id');
    assert.ok(observed.length>=3);assert.equal(observed.at(-1).active_children,0);assert.equal(observed.at(-1).capacity,60);assert.equal(observed.at(-2).reason,'capacity_change');
    assert.ok(new Date(observed.at(-1).observed_at)>=new Date(before.observed_at));
    const tenant=await pool.connect();try{
      await tenant.query('SET ROLE ankelba_tenant');await tenant.query("SELECT set_config('app.daycare_id',$1,false)",[String(plus.id)]);
      const rows=(await tenant.query('SELECT daycare_id FROM daycare_occupancy_observations')).rows;assert.ok(rows.length);assert.ok(rows.every(row=>row.daycare_id===plus.id));
      await assert.rejects(tenant.query("INSERT INTO daycare_occupancy_observations(daycare_id,active_children,capacity,reason) VALUES($1,99,100,'fake')",[plus.id]),error=>error.code==='42501');
      // The trigger may write, even though callers cannot insert or execute it directly.
      await tenant.query("UPDATE children SET enrollment_status='active' WHERE id=$1",[child.id]);
      const restrictedPool={connect:async()=>({query:(...args)=>tenant.query(...args),release(){}})};
      const restrictedReport=await createAnalyticsService(restrictedPool,{today:()=> '2026-11-08'}).report(user,{from:'2026-11-01',to:'2026-11-03'});
      assert.equal(restrictedReport.current.care_fees.collected,'160.00');
      await assert.rejects(tenant.query('SELECT capture_daycare_occupancy()'),error=>error.code==='42501');
      await tenant.query('RESET ROLE');
    }finally{tenant.release();}
    // A later cash return must not rewrite the original collection period.
    const cash=await db('payments').where({order_id:paidOrder.id}).first();
    await db('payments').where({id:cash.id}).update({gateway_ref:'SYNTHETIC-ANALYTICS-CASH'});
    await db('shop_order_refunds').insert({daycare_id:plus.id,order_id:paidOrder.id,payment_id:cash.id,parent_id:parent.id,actor_id:admin.id,amount:'15.00',original_payment_reference:'SYNTHETIC-ANALYTICS-CASH',refund_reference:'SYNTHETIC-ANALYTICS-RETURN',reason:'Synthetic full cash return for accounting regression',stock_disposition:'not_restocked',original_order_status:'collected',refunded_at:'2026-11-03T21:15:00Z',request_key:'synthetic_analytics_refund_01',request_hash:'a'.repeat(64)});
    await db('orders').where({id:paidOrder.id}).update({payment_status:'refunded',order_status:'cancelled'});
    const original=await service.report(user,{from:'2026-11-01',to:'2026-11-03'});
    assert.equal(original.current.shop.gross_collected,'15.00');assert.equal(original.current.shop.refunds,'0.00');assert.equal(original.current.shop.collected,'15.00');assert.equal(original.best_sellers.length,0);
    const returned=await service.report(user,{from:'2026-11-04',to:'2026-11-04'});
    assert.equal(returned.current.shop.gross_collected,'0.00');assert.equal(returned.current.shop.refunds,'15.00');assert.equal(returned.current.shop.collected,'-15.00');
    assert.ok(csv(returned).includes('Recorded cash returns (no app transfer)'));assert.ok(csv(returned).includes('"Shop net collections","-15.00"'));
    assert.equal((await db('payments').where({id:cash.id}).first()).status,'paid','original payment evidence remains paid');
  });
});
