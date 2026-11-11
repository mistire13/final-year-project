'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createRefundService}=require('../src/modules/store/store-refunds.service');
const {isCareWrite}=require('../src/middleware/subscription-access');
test('cash refund records preserve original receipts, isolate tenants and restore stock once',async t=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const center=async slug=>(await db('daycares').insert({name:slug,slug,contact_email:slug+'@example.invalid',status:'active',subscription_plan:'standard',subscription_status:'active',subscription_ends_at:new Date(Date.now()-1000)}).returning('*'))[0];
    const a=await center('refund-center-a'),b=await center('refund-center-b');
    const account=async(dc,role,label)=>({...((await db('users').insert({name:label,email:label+'@example.invalid',daycare_id:dc.id,role_id:role==='admin'?1:3,status:'active',password_hash:'synthetic'}).returning('*'))[0]),role});
    const admin=await account(a,'admin','refund-admin-a'),parent=await account(a,'parent','refund-parent-a'),foreign=await account(b,'admin','refund-admin-b'),otherParent=await account(a,'parent','refund-other-parent');
    const svc=createRefundService(pool);let counter=0;
    async function scenario(overrides={}){
      const n=++counter;
      const product=(await db('products').insert({daycare_id:a.id,name:'Refund supplies '+n,price:100,stock_qty:7,available:true,created_by:admin.id}).returning('*'))[0];
      const order=(await db('orders').insert({daycare_id:a.id,parent_id:parent.id,total:200,order_status:'collected',payment_status:'paid',...overrides}).returning('*'))[0];
      await db('order_items').insert({daycare_id:a.id,order_id:order.id,product_id:product.id,quantity:2,unit_price:100});
      const payment=(await db('payments').insert({order_id:order.id,method:'pay_at_daycare',status:order.payment_status,gateway_ref:`CASH-${a.id}-${order.id}`,verified_at:new Date(Date.now()-600000)}).returning('*'))[0];
      const body={version:order.version,amount:200,original_payment_reference:payment.gateway_ref,refund_reference:'SYNTHETIC-RETURN-'+n,refunded_at:new Date(Date.now()-300000).toISOString(),stock_disposition:order.order_status==='collected'?'returned_to_stock':'not_handed_over',reason:'Synthetic independent cash return receipt checked',refund_confirmed:true,request_key:'synthetic_refund_request_'+n};
      return {product,order,payment,body};
    }
    await t.test('wrong amount, receipt, confirmation, role, tenant and stale version write nothing',async()=>{
      const s=await scenario();
      for(const patch of [{amount:199.99},{amount:200.001},{amount:'200.00'},{original_payment_reference:'WRONG-RECEIPT'},{refund_confirmed:false},{refunded_at:new Date(Date.now()-900000).toISOString()},{refunded_at:new Date(Date.now()+600000).toISOString()},{stock_disposition:'not_handed_over'},{version:s.order.version+1}])await assert.rejects(svc.record(s.order.id,admin,{...s.body,...patch}),e=>[409,422].includes(e.statusCode));
      await assert.rejects(svc.record(s.order.id,parent,s.body),e=>e.statusCode===403);
      await assert.rejects(svc.record(s.order.id,foreign,s.body),e=>e.statusCode===404);
      assert.equal((await db('shop_order_refunds').count('* as n').first()).n,'0');
      assert.equal((await db('products').where({id:s.product.id}).first()).stock_qty,7);
      assert.equal((await db('orders').where({id:s.order.id}).first()).payment_status,'paid');
    });
    await t.test('expired Standard preserves the refund obligation and receipt, with safe retry',async()=>{
      const s=await scenario();assert.equal(isCareWrite('POST',`/api/store/orders/${s.order.id}/refund`),true);
      const result=await svc.record(s.order.id,admin,s.body);assert.equal(result.order.payment_status,'refunded');assert.equal(result.order.order_status,'cancelled');
      assert.equal((await db('products').where({id:s.product.id}).first()).stock_qty,9);
      assert.deepEqual(await db('payments').where({id:s.payment.id}).first(),s.payment,'original cash receipt/date/status remain immutable');
      assert.equal((await svc.record(s.order.id,admin,s.body)).replayed,true);
      assert.equal((await svc.record(s.order.id,admin,Object.fromEntries(Object.entries(s.body).reverse()))).replayed,true,'semantic replay ignores JSON field order');
      assert.equal((await db('products').where({id:s.product.id}).first()).stock_qty,9);
      await assert.rejects(svc.record(s.order.id,admin,{...s.body,reason:'Different refund reason cannot reuse request'}),e=>e.statusCode===409);
      await assert.rejects(svc.record(s.order.id,admin,{...s.body,request_key:s.body.request_key+'_new'}),e=>e.statusCode===409);
      assert.equal((await db('audit_logs').where({daycare_id:a.id,action:'SHOP_CASH_REFUND_RECORDED',target_id:s.order.id}).count('* as n').first()).n,'1');
    });
    await t.test('concurrent retries append one refund and one inventory restoration',async()=>{
      const s=await scenario();const results=await Promise.all([svc.record(s.order.id,admin,s.body),svc.record(s.order.id,admin,s.body)]);
      assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
      assert.equal((await db('shop_order_refunds').where({order_id:s.order.id}).count('* as n').first()).n,'1');
      assert.equal((await db('shop_stock_movements').where({product_id:s.product.id}).count('* as n').first()).n,'2');
      assert.equal((await db('products').where({id:s.product.id}).first()).stock_qty,9);
    });
    await t.test('competing orders cannot reuse a request key or external evidence and the loser rolls back',async()=>{
      for(const collision of ['request_key','refund_reference']){
        const scenarios=[await scenario(),await scenario()];
        const shared=collision==='request_key'?'cross_order_refund_collision':'CROSS-ORDER-EXTERNAL-RETURN';
        const bodies=scenarios.map((s,index)=>({...s.body,[collision]:collision==='refund_reference'&&index===1?shared.toLowerCase():shared}));
        const results=await Promise.allSettled(scenarios.map((s,index)=>svc.record(s.order.id,admin,bodies[index])));
        assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
        assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.statusCode===409).length,1);
        for(const [index,s] of scenarios.entries()){
          const won=results[index].status==='fulfilled';
          assert.equal((await db('orders').where({id:s.order.id}).first()).payment_status,won?'refunded':'paid');
          assert.equal((await db('products').where({id:s.product.id}).first()).stock_qty,won?9:7);
          assert.equal((await db('shop_order_refunds').where({order_id:s.order.id}).count('* as n').first()).n,won?'1':'0');
          assert.deepEqual(await db('payments').where({id:s.payment.id}).first(),s.payment);
        }
      }
    });
    await t.test('demo, online, pending and already-cancelled orders require separate reconciliation',async()=>{
      for(const method of ['demo','digital']){const s=await scenario();await db('payments').where({id:s.payment.id}).update({method});await assert.rejects(svc.record(s.order.id,admin,s.body),e=>e.statusCode===409);}
      for(const overrides of [{payment_status:'pending'},{order_status:'cancelled'}]){const s=await scenario(overrides);await assert.rejects(svc.record(s.order.id,admin,s.body),e=>e.statusCode===409);}
    });
    await t.test('inventory disposition is explicit and external evidence cannot be reused',async()=>{
      const never=await scenario({order_status:'confirmed'});await svc.record(never.order.id,admin,never.body);assert.equal((await db('products').where({id:never.product.id}).first()).stock_qty,9);
      const damaged=await scenario();await svc.record(damaged.order.id,admin,{...damaged.body,stock_disposition:'not_restocked'});assert.equal((await db('products').where({id:damaged.product.id}).first()).stock_qty,7);
      const reuse=await scenario();await assert.rejects(svc.record(reuse.order.id,admin,{...reuse.body,refund_reference:never.body.refund_reference.toLowerCase()}),e=>e.statusCode===409);
      assert.equal((await db('products').where({id:reuse.product.id}).first()).stock_qty,7);assert.equal((await db('orders').where({id:reuse.order.id}).first()).payment_status,'paid');
    });
    await t.test('owner and restricted roles cannot rewrite evidence; tenant reads fail closed',async()=>{
      const record=await db('shop_order_refunds').first();await assert.rejects(db('shop_order_refunds').where({id:record.id}).update({reason:'Attempt to rewrite historical evidence'}),e=>e.code==='23514');
      await assert.rejects(db('shop_order_refunds').where({id:record.id}).delete(),e=>e.code==='23514');
      const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE ankelba_tenant');await c.query("SELECT set_config('app.daycare_id',$1,true)",[String(b.id)]);assert.equal((await c.query('SELECT * FROM shop_order_refunds')).rowCount,0);await c.query('ROLLBACK');}finally{c.release();}
    });
    await t.test('parent order reads expose only owned refund evidence and refunded orders stay closed',async()=>{
      const dbPath=require.resolve('../src/config/db'),storePath=require.resolve('../src/modules/store/store.service');const oldDb=require.cache[dbPath],oldStore=require.cache[storePath];require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:pool};delete require.cache[storePath];
      try{const store=require(storePath);const orders=(await store.listMyOrders(parent)).data;assert.ok(orders.some(o=>o.refund?.refund_reference));assert.equal((await store.listMyOrders(otherParent)).data.length,0);assert.equal((await store.listAllOrders({},foreign)).data.length,0);const closed=orders.find(o=>o.payment_status==='refunded');await assert.rejects(store.updateOrderStatus(closed.id,{version:closed.version,payment_status:'unpaid'},admin),e=>e.statusCode===409);}finally{if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];if(oldStore)require.cache[storePath]=oldStore;else delete require.cache[storePath];}
    });
  });
});
