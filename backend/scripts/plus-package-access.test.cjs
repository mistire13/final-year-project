'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {catalogFeatures,effectiveFeatures,requireFeature}=require('../src/modules/saas/package-features');
const {termsFor,matchesRenewalTerms,createSubscriptions}=require('../src/modules/saas/subscriptions.service');
const future=()=>new Date(Date.now()+86400000),past=()=>new Date(Date.now()-1000);
test('Plus capabilities are explicit, paid-period aware and cannot be added to Standard terms',()=>{
  const base={status:'active',subscription_plan:'premium',subscription_ends_at:future(),subscription_terms:{code:'premium',features:catalogFeatures('premium')}};
  assert.equal(effectiveFeatures(base).features.shop,true);
  assert.equal(effectiveFeatures({...base,subscription_ends_at:past()}).features.shop,false);
  assert.equal(effectiveFeatures({...base,status:'suspended'}).features.shop,false);
  assert.equal(effectiveFeatures({...base,subscription_status:'cancelled'}).features.shop,true,'cancellation retains the paid period');
  assert.equal(effectiveFeatures({...base,subscription_terms:{code:'standard',features:catalogFeatures('premium')}}).features.shop,false);
  assert.equal(effectiveFeatures({...base,subscription_terms:{code:'premium',features:{shop:false}}}).features.shop,false);
  const legacy={...base,subscription_plan:'standard',subscription_terms:{code:'standard'},legacy_shop_access_until:future()};
  assert.equal(effectiveFeatures(legacy).features.shop,true);
  assert.equal(effectiveFeatures({...legacy,legacy_shop_access_until:past()}).features.shop,false);
  const terms=termsFor({code:'premium',name:'Plus',version:1,max_children:150,monthly_price:'200.00'},'monthly');
  assert.equal(terms.features.shop,true);assert.equal(terms.feature_policy_version,1);
  assert.equal(matchesRenewalTerms(terms,{...terms,features:{...terms.features,shop:false}}),false);
});

test('Standard cannot create shop sales; existing orders retain audited cash settlement after downgrade',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('roles').insert([{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const offers=await db('subscription_packages');assert.equal(offers.find(p=>p.code==='premium').name,'Plus');
    const makeCenter=async(code,slug)=>{const offer=offers.find(p=>p.code===code);return (await db('daycares').insert({name:slug,slug,contact_email:slug+'@example.invalid',status:'active',subscription_plan:code,subscription_status:'active',subscription_started_at:new Date(),subscription_ends_at:future(),subscription_terms:JSON.stringify(termsFor(offer,'monthly')),max_children:offer.max_children}).returning('*'))[0];};
    const standard=await makeCenter('standard','standard-shop-check'),plus=await makeCenter('premium','plus-shop-check');
    const makeUser=async(center,role_id,role,label)=>(await db('users').insert({name:label,email:label+'@example.invalid',role_id,status:'active',password_hash:'synthetic',daycare_id:center.id}).returning('*'))[0];
    const standardAdmin={...await makeUser(standard,1,'admin','standard-shop-admin'),role:'admin'};
    const admin={...await makeUser(plus,1,'admin','plus-shop-admin'),role:'admin'},parent={...await makeUser(plus,3,'parent','plus-shop-parent'),role:'parent'};
    await assert.rejects(requireFeature(pool,standard.id,'shop'),error=>error.code==='FEATURE_NOT_INCLUDED');
    const catalog=await createSubscriptions(pool).catalog();assert.equal(catalog.find(p=>p.code==='standard').features.shop,false);assert.equal(catalog.find(p=>p.code==='premium').features.shop,true);
    const dbPath=require.resolve('../src/config/db'),storePath=require.resolve('../src/modules/store/store.service');
    let paused=null;
    const pauseBefore=async sql=>{if(paused?.pattern.test(sql)){const gate=paused;paused=null;gate.arrived();await gate.wait;}};
    const servicePool={query:async(sql,args)=>{await pauseBefore(sql);return pool.query(sql,args);},connect:async()=>{const c=await pool.connect();return {query:async(sql,args)=>{await pauseBefore(sql);return c.query(sql,args);},release:()=>c.release()};}};
    const oldDb=require.cache[dbPath],oldStore=require.cache[storePath];require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:servicePool};delete require.cache[storePath];
    const store=require(storePath);
    // Pause immediately before the catalogue write and prove that a competing
    // package change cannot acquire its daycare lock until that write commits.
    const protectedMutation=async(pattern,run)=>{
      let arrived,release;const reached=new Promise(resolve=>{arrived=resolve;}),wait=new Promise(resolve=>{release=resolve;});paused={pattern,arrived,wait};
      const pending=run();let failure;
      try{
        await Promise.race([reached,pending.then(()=>{throw Error('Expected catalogue mutation was not observed');})]);
        const contender=await pool.connect();try{
          await contender.query('BEGIN');
          await assert.rejects(contender.query('SELECT id FROM daycares WHERE id=$1 FOR UPDATE NOWAIT',[plus.id]),error=>error.code==='55P03');
        }finally{await contender.query('ROLLBACK');contender.release();}
      }catch(error){failure=error;}finally{release();}
      const result=await pending;if(failure)throw failure;return result;
    };
    try{
      await assert.rejects(store.listProducts({},standardAdmin),error=>error.statusCode===403);
      await assert.rejects(store.createProduct({name:'Blocked',price:10,stock_qty:1},standardAdmin),error=>error.statusCode===403);
      let product=await store.createProduct({name:'Synthetic supplies',price:120,stock_qty:3,available:true},admin);
      product=await protectedMutation(/^UPDATE products SET/,()=>store.updateProduct(product.id,{version:product.version,name:'Synthetic reviewed supplies'},admin));
      let category=await protectedMutation(/^INSERT INTO product_categories/,()=>store.createCategory({name:'Synthetic lock category'},admin));
      category=await protectedMutation(/^UPDATE product_categories/,()=>store.updateCategory(category.id,{name:'Synthetic renamed category'},admin));
      await protectedMutation(/^DELETE FROM product_categories/,()=>store.deleteCategory(category.id,admin));
      const body={idempotency_key:'synthetic-plus-order-001',items:[{product_id:product.id,quantity:2}],note:'Test order'};
      const order=await store.placeOrder(body,parent);assert.equal(Number(order.total),240);
      assert.equal((await store.placeOrder(body,parent)).id,order.id);
      assert.equal((await db('products').where({id:product.id}).first()).stock_qty,1);
      const cancelled=await store.placeOrder({idempotency_key:'synthetic-plus-order-cancel',items:[{product_id:product.id,quantity:1}]},parent);
      await store.updateOrderStatus(cancelled.id,{version:cancelled.version,order_status:'cancelled'},admin);
      const movements=await db('shop_stock_movements').where({product_id:product.id,daycare_id:plus.id}).orderBy('id');
      assert.deepEqual(movements.map(row=>row.quantity_change),[3,-2,-1,1],'inventory creation, checkout and cancellation are recorded once');
      assert.equal((await db('products').where({id:product.id}).first()).stock_qty,1);
      await db('daycares').where({id:plus.id}).update({subscription_plan:'standard',subscription_terms:JSON.stringify(termsFor(offers.find(p=>p.code==='standard'),'monthly')),subscription_ends_at:past()});
      await assert.rejects(store.placeOrder({...body,idempotency_key:'synthetic-plus-order-002'},parent),error=>error.statusCode===403);
      await assert.rejects(store.updateProduct(product.id,{version:product.version,name:'Blocked edit'},admin),error=>error.statusCode===403);
      await assert.rejects(store.createCategory({name:'Blocked category'},admin),error=>error.statusCode===403);
      await assert.rejects(store.updateCategory(category.id,{name:'Blocked category edit'},admin),error=>error.statusCode===403);
      await assert.rejects(store.deleteCategory(category.id,admin),error=>error.statusCode===403);
      assert.equal((await store.listMyOrders(parent)).data.length,2);
      await assert.rejects(store.updateOrderStatus(order.id,{version:order.version,payment_status:'paid'},admin),error=>error.statusCode===422);
      await assert.rejects(store.updateOrderStatus(order.id,{version:order.version,payment_status:'paid',amount_received:239,payment_confirmed:true,payment_reason:'Synthetic payment amount check'},admin),error=>error.statusCode===422);
      const paid=await store.updateOrderStatus(order.id,{version:order.version,order_status:'confirmed',payment_status:'paid',amount_received:240,payment_confirmed:true,payment_reason:'Synthetic cash physically received'},admin);
      assert.equal(paid.payment_status,'paid');const payment=await db('payments').where({order_id:order.id}).first();assert.equal(payment.method,'pay_at_daycare');assert.equal(payment.gateway_ref,`CASH-${plus.id}-${order.id}`);assert.equal(payment.verification_source,'cash_confirmed');assert.equal(payment.daycare_payment_request_id,null);
      const ready=await store.updateOrderStatus(order.id,{version:paid.version,order_status:'ready_for_pickup'},admin);
      assert.equal((await store.updateOrderStatus(order.id,{version:ready.version,order_status:'collected'},admin)).order_status,'collected');
      const unrelatedParent={...parent,id:standardAdmin.id,daycare_id:standard.id};assert.equal((await store.listMyOrders(unrelatedParent)).data.length,0);
    }finally{if(oldDb)require.cache[dbPath]=oldDb;else delete require.cache[dbPath];if(oldStore)require.cache[storePath]=oldStore;else delete require.cache[storePath];}
  });
});
