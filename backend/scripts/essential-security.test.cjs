'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { withCurrentDatabase } = require('./helpers/auth-test-database.cjs');
const { createTenantPool, withTenant } = require('../src/db/tenant-pool');
const { verifyRuntime } = require('../src/db/runtime-policy');
const { setupRuntimeRoles } = require('./setup-runtime-roles.cjs');

test('essential security with separate restricted PostgreSQL logins', async t => withCurrentDatabase(async ({ db, pool, name }) => {
  const suffix = randomBytes(6).toString('hex');
  const roles = [
    { user: `essential_t_${suffix}`, password: randomBytes(32).toString('hex'), group: 'ankelba_tenant', other: 'ankelba_control' },
    { user: `essential_c_${suffix}`, password: randomBytes(32).toString('hex'), group: 'ankelba_control', other: 'ankelba_tenant' },
  ];
  let tenantRaw, control, server;
  try {
    await t.test('flow migration can roll back and reapply without dropping stored columns', async () => {
      const migration=require('../src/db/migrations/025_flow_reliability');
      const orders=require('../src/db/migrations/026_order_edit_versions');
      await orders.down(db);
      await migration.down(db); await migration.up(db); await migration.up(db);
      assert.equal((await db.raw("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='edit_version' AND NOT tgisinternal")).rows[0].n,3);
      assert.equal(await db.schema.hasColumn('orders','note'),true);
      assert.equal(await db.schema.hasColumn('users','ui_preferences'),true);
      await orders.up(db); await orders.up(db);
      assert.equal(await db.schema.hasColumn('orders','version'),true);
      // 025.down drops the shared trigger function CASCADE. Restore every
      // later trigger before exercising the current schema's HTTP workflows.
      await require('../src/db/migrations/033_child_and_classroom_edit_versions').up(db);
      for (const table of ['pickup_guardians','subscription_packages']) {
        await db.raw('CREATE TRIGGER edit_version BEFORE UPDATE ON ?? FOR EACH ROW EXECUTE FUNCTION bump_edit_version()', [table]);
      }
    });
    await setupRuntimeRoles(pool, roles);
    const connection = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), database: name, max: 3 };
    tenantRaw = new Pool({ ...connection, user: roles[0].user, password: roles[0].password });
    control = new Pool({ ...connection, user: roles[1].user, password: roles[1].password });
    const tenant = createTenantPool(tenantRaw);
    tenant.control = control;
    await t.test('startup rejects privileged logins and verifies restricted roles', async () => {
      await assert.rejects(verifyRuntime(pool, control), /Unsafe/);
      await verifyRuntime(tenantRaw, control);
      await assert.rejects(control.query('SELECT * FROM children'), { code: '42501' });
      await control.query('SELECT id FROM mfa_factors LIMIT 1');
      await assert.rejects(tenantRaw.query('TRUNCATE children'), { code: '42501' });
      await assert.rejects(tenantRaw.query('SELECT * FROM platform_accounts'), { code: '42501' });
    });
    await db('roles').insert([{ id: 0, name: 'super_admin' }, { id: 1, name: 'admin' }, { id: 2, name: 'caregiver' }, { id: 3, name: 'parent' }]).onConflict('id').ignore();
    const daycares = await db('daycares').insert(['a', 'b'].map(x => ({ name: `Center ${x}`, slug: `essential-${x}`, contact_email: `${x}@example.invalid`, status: 'active' }))).returning('*');
    const password = 'Synthetic-essential-password!';
    const hash = await bcrypt.hash(password, 4);
    const [admin, caregiver, parent, otherParent, owner] = await db('users').insert([
      { name: 'Admin', email: 'admin@example.invalid', role_id: 1, daycare_id: daycares[0].id },
      { name: 'Caregiver', email: 'caregiver@example.invalid', role_id: 2, daycare_id: daycares[0].id },
      { name: 'Parent', email: 'parent@example.invalid', role_id: 3, daycare_id: daycares[0].id },
      { name: 'Other parent', email: 'other@example.invalid', role_id: 3, daycare_id: daycares[1].id },
      { name: 'Owner', email: 'owner@example.invalid', role_id: 0, daycare_id: null },
    ].map(row => ({ ...row, password_hash: hash, status: 'active' }))).returning('*');
    const children = await db('children').insert(daycares.map((d, i) => ({ full_name: `Child ${i}`, dob: '2023-01-01', enrollment_status: 'active', daycare_id: d.id, caregiver_id: i === 0 ? caregiver.id : null }))).returning('*');
    await db('guardian_links').insert(children.map((c, i) => ({ child_id: c.id, user_id: i ? otherParent.id : parent.id, created_by: i ? otherParent.id : admin.id, relationship: 'Parent', pickup_authorized: true })));

    await t.test('unscoped reads fail closed and concurrent tenants stay isolated', async () => {
      assert.equal((await tenant.query('SELECT * FROM children')).rows.length, 0);
      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => withTenant(daycares[i % 2].id, () => tenant.query('SELECT id FROM children'))));
      results.forEach((result, i) => assert.deepEqual(result.rows.map(r => r.id), [children[i % 2].id]));
      assert.equal((await tenant.query('SELECT * FROM children')).rows.length, 0);
      await withTenant(daycares[0].id, async () => {
        assert.equal((await tenant.query('UPDATE children SET full_name=$1 WHERE id=$2', ['Forbidden', children[1].id])).rowCount, 0);
        // Inactive enrollment bypasses the quota trigger so this isolates the
        // RLS WITH CHECK rejection; active enrollment also fails at quota lookup.
        await assert.rejects(tenant.query("INSERT INTO children(full_name,dob,daycare_id,enrollment_status) VALUES($1,$2,$3,'inactive')", ['Forbidden', '2023-01-01', daycares[1].id]), { code: '42501' });
        assert.equal((await tenant.query('SELECT * FROM users WHERE daycare_id=$1', [daycares[1].id])).rows.length, 0);
      });
    });
    await t.test('one physical connection clears scope after commits, failures and background jobs', async () => {
      const raw = new Pool({ ...connection, max: 1, user: roles[0].user, password: roles[0].password });
      const scoped = createTenantPool(raw);
      try {
        await withTenant(daycares[0].id, async () => {
          const client = await scoped.connect();
          try {
            const parallel = await Promise.all([client.query('SELECT id FROM children'), client.query('SELECT id FROM children')]);
            parallel.forEach(result => assert.deepEqual(result.rows.map(row => row.id), [children[0].id]));
            await client.query('BEGIN');
            await assert.rejects(client.query('SELECT 1/0'), {code:'22012'});
            await client.query('ROLLBACK');
          } finally { client.release(); }
          await assert.rejects(scoped.query('SELECT 1/0'), {code:'22012'});
        });
        assert.deepEqual((await scoped.query('SELECT id FROM children')).rows, []);
        const settings = (await raw.query("SELECT NULLIF(current_setting('app.daycare_id',true),'') AS a,NULLIF(current_setting('app.current_daycare_id',true),'') AS b")).rows[0];
        assert.deepEqual(settings, {a:null,b:null});
        const job = await new Promise((resolve,reject) => setImmediate(() =>
          withTenant(daycares[1].id, () => scoped.query('SELECT id FROM children')).then(resolve,reject)));
        assert.deepEqual(job.rows.map(row => row.id), [children[1].id]);
        assert.deepEqual((await scoped.query('SELECT id FROM children')).rows, []);
        await withTenant(daycares[0].id, async () => {
          const client = await scoped.connect();
          await client.query('BEGIN');
          client.release(); // Forgotten rollback must destroy, not reuse, this session.
        });
        assert.deepEqual((await scoped.query('SELECT id FROM children')).rows, []);
      } finally { await raw.end(); }
    });
    await t.test('startup catches policy and control-grant regressions beyond core tables', async () => {
      await db.raw('ALTER TABLE health_records DISABLE ROW LEVEL SECURITY');
      try { await assert.rejects(verifyRuntime(tenantRaw,control), /health_records/); }
      finally { await db.raw('ALTER TABLE health_records ENABLE ROW LEVEL SECURITY'); }
      await db.raw('GRANT SELECT ON care_instructions TO ??', [roles[1].user]);
      try { await assert.rejects(verifyRuntime(tenantRaw,control), /care_instructions/); }
      finally { await db.raw('REVOKE SELECT ON care_instructions FROM ??', [roles[1].user]); }
      await verifyRuntime(tenantRaw,control);
    });
    await t.test('evidence migration refuses inconsistent history and can roll back and reapply', async () => {
      const migration = require('../src/db/migrations/035_tenant_evidence_integrity');
      const link = await db('guardian_links').where({child_id:children[0].id}).first();
      await db.transaction(tx => migration.down(tx));
      const [bad] = await db('biometric_references').insert({guardian_link_id:link.id,user_id:otherParent.id,enrolled_by:admin.id,reference_data:'synthetic-test-reference'}).returning('id');
      await assert.rejects(db.transaction(tx => migration.up(tx)), /preflight failed/);
      assert.equal(await db.schema.hasColumn('biometric_references','daycare_id'), false);
      await db('biometric_references').where({id:bad.id}).delete();
      await db.transaction(tx => migration.up(tx));
      assert.equal(await db.schema.hasColumn('biometric_references','daycare_id'), true);
    });
    await t.test('database constrains biometric, pickup and audit actors even for maintenance SQL', async () => {
      const link = await db('guardian_links').where({child_id:children[0].id}).first();
      const bio = {guardian_link_id:link.id,user_id:parent.id,enrolled_by:admin.id,reference_data:'synthetic-test-reference'};
      await assert.rejects(db('biometric_references').insert({...bio,user_id:otherParent.id}), {code:'23503'});
      await assert.rejects(db('biometric_references').insert({...bio,enrolled_by:otherParent.id}), {code:'23503'});
      const [saved] = await db('biometric_references').insert(bio).returning('*');
      assert.equal(saved.daycare_id, daycares[0].id);
      await assert.rejects(db('guardian_links').where({id:link.id}).update({created_by:otherParent.id}), {code:'23503'});
      const [foreignAttendance] = await db('attendance').insert({child_id:children[1].id,recorded_by:otherParent.id,event_type:'checkin',daycare_id:daycares[1].id}).returning('*');
      const event = {child_id:children[0].id,guardian_user_id:parent.id,verified_by:admin.id,result:'failed',method:'manual'};
      for (const patch of [{guardian_user_id:otherParent.id},{verified_by:otherParent.id},{attendance_id:foreignAttendance.id}]) {
        await assert.rejects(db('guardian_verification_events').insert({...event,...patch}), {code:'23503'});
      }
      await assert.rejects(db('audit_logs').insert({actor_id:otherParent.id,daycare_id:daycares[0].id,action:'INVALID',target_table:'children'}), {code:'23503'});
      await withTenant(daycares[0].id, async () => {
        assert.equal((await tenant.query('SELECT id FROM biometric_references')).rows.length,1);
        await assert.rejects(tenant.query("INSERT INTO audit_logs(actor_id,daycare_id,action,target_table) VALUES($1,$2,'INVALID','children')",[otherParent.id,daycares[0].id]),{code:'23503'});
        await assert.rejects(tenant.query("SELECT setval('users_id_seq',999999)"),{code:'42501'});
      });
      await withTenant(daycares[1].id, async () => assert.deepEqual((await tenant.query('SELECT id FROM biometric_references')).rows,[]));
    });
    await t.test('control can update and audit package terms without accessing child evidence', async () => {
      const service = require('../src/modules/saas/subscriptions.service').createSubscriptions(control);
      const offer = (await service.catalog(true)).find(row => row.code==='standard');
      const {code,updated_at,...input} = offer;
      const saved = await service.updatePackage(code,{...input,reason:'Synthetic package audit regression'},owner.id);
      assert.equal(saved.version,offer.version+1);
      assert.equal((await control.query("SELECT id FROM audit_logs WHERE action='PACKAGE_UPDATED'")).rows.length,1);
      await assert.rejects(control.query('SELECT id FROM guardian_verification_events'),{code:'42501'});
    });
    process.env.NODE_ENV = 'test';
    process.env.DAYCARE_AUTH_ENABLED = 'false';
    process.env.JWT_SECRET = 'synthetic-essential-security-jwt-secret';
    const dbFile = require.resolve('../src/config/db');
    require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: tenant };
    server = require('../src/app').listen(0, '127.0.0.1');
    await require('node:events').once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (method, path, token, body) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const login = user => request('POST', '/auth/login', null, { email: user.email, password });
    const tokens = {};
    await t.test('restricted HTTP login and parent profile loading work', async () => {
      for (const user of [parent, otherParent, admin, caregiver, owner]) {
        const result = await login(user);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        tokens[user.id] = result.body.token;
      }
      const me = await request('GET', '/auth/me', tokens[parent.id]);
      assert.equal(me.status, 200);
      assert.deepEqual(me.body.user.linked_children.map(c => c.id), [children[0].id]);
      const profile = await request('GET', `/parent/children/${children[0].id}/care-profile`, tokens[parent.id]);
      assert.equal(profile.status, 200, JSON.stringify(profile.body));
      const save = await request('PATCH', `/parent/children/${children[0].id}/care-profile`, tokens[parent.id], { version: profile.body.version, profile: { full_name: 'Saved safely' } });
      assert.equal(save.status, 200, JSON.stringify(save.body));
      assert.ok([403, 404].includes((await request('GET', `/parent/children/${children[1].id}`, tokens[parent.id])).status));
    });
    await t.test('staff can operate within their daycare and parents cannot open staff APIs', async () => {
      assert.equal((await request('GET', '/portal/workspace', tokens[caregiver.id])).status, 200);
      const snapshot = await request('GET', '/portal/snapshot', tokens[admin.id]);
      assert.equal(snapshot.status, 200, JSON.stringify(snapshot.body));
      assert.deepEqual(snapshot.body.children.map(c => c.id), [children[0].id]);
      assert.equal((await request('GET', '/portal/workspace', tokens[parent.id])).status, 403);
      const report = await request('POST', '/reports/daily', tokens[caregiver.id], { child_id: children[0].id, mood: 'happy' });
      assert.equal(report.status, 201, JSON.stringify(report.body));
      assert.ok([403, 404].includes((await request('POST', '/reports/daily', tokens[caregiver.id], { child_id: children[1].id, mood: 'happy' })).status));
    });
    await t.test('parent and admin care writers invalidate each other and serialize concurrent edits', async () => {
      const oldChild = await db('children').where({id:children[0].id}).first();
      const current = await request('GET',`/parent/children/${children[0].id}/care-profile`,tokens[parent.id]);
      const saved = await request('PATCH',`/parent/children/${children[0].id}/care-profile`,tokens[parent.id],{
        version:current.body.version,care_instructions:[{category:'allergy',instruction_text:'Synthetic safety note'}],
      });
      assert.equal(saved.status,200,JSON.stringify(saved.body));
      const body = {child_version:oldChild.version,name:'Synthetic contact',relationship:'Aunt',phone:'0900000000'};
      assert.equal((await request('POST',`/children/${children[0].id}/contacts`,tokens[admin.id],body)).status,409);
      const freshChild = await db('children').where({id:children[0].id}).first();
      const parallel = await Promise.all(['One','Two'].map(name => request('POST',`/children/${children[0].id}/contacts`,tokens[admin.id],{...body,name,child_version:freshChild.version})));
      assert.deepEqual(parallel.map(row=>row.status).sort(),[201,409]);
      assert.equal((await request('PATCH',`/parent/children/${children[0].id}/care-profile`,tokens[parent.id],{version:saved.body.version,emergency_contacts:[]})).status,409);
      assert.equal((await db('care_instructions').where({child_id:children[0].id})).length,1);
    });
    await t.test('assigned caregiver check-in and verified manual pickup commit with scoped evidence', async () => {
      const checkin = await request('POST','/portal/attendance',tokens[caregiver.id],{child_id:children[0].id,event_type:'checkin'});
      assert.equal(checkin.status,200,JSON.stringify(checkin.body));
      const body = {child_id:children[0].id,guardian_user_id:parent.id,method:'manual',identity_confirmed:true,reason:'Synthetic identity confirmation'};
      assert.equal((await request('POST','/portal/checkout',tokens[caregiver.id],body)).status,403);
      const results = await Promise.all([request('POST','/portal/checkout',tokens[admin.id],body),request('POST','/portal/checkout',tokens[admin.id],body)]);
      assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
      const evidence = await db('guardian_verification_events').where({child_id:children[0].id});
      assert.equal(evidence.length,1);assert.equal(evidence[0].daycare_id,daycares[0].id);
      assert.equal((await db('attendance').where({id:evidence[0].attendance_id}).first()).child_id,children[0].id);
      await withTenant(daycares[1].id,async()=>assert.deepEqual((await tenant.query('SELECT id FROM guardian_verification_events')).rows,[]));
    });
    await t.test('announcement details enforce audience, expiry and tenant boundaries',async()=>{
      const create=async audience=>(await request('POST','/communication/announcements',tokens[admin.id],{title:'Center update',body:'Shared update',audience})).body;
      const general=await create('all');const staff=await create('caregivers');
      assert.equal((await request('GET',`/communication/announcements/${general.id}`,tokens[parent.id])).status,200);
      assert.equal((await request('GET',`/communication/announcements/${staff.id}`,tokens[parent.id])).status,404);
      assert.equal((await request('GET',`/communication/announcements/${staff.id}`,tokens[caregiver.id])).status,200);
      assert.equal((await request('GET',`/communication/announcements/${general.id}`,tokens[otherParent.id])).status,404);
      await db('announcements').where({id:general.id}).update({expires_at:'2020-01-01'});
      assert.equal((await request('GET',`/communication/announcements/${general.id}`,tokens[parent.id])).status,404);
    });
    await t.test('checkout retries preserve one order, notes and inventory; changed payload conflicts',async()=>{
      const product=(await request('POST','/store/products',tokens[admin.id],{name:'Classroom book',price:10,stock_qty:10})).body;
      const body={items:[{product_id:product.id,quantity:2}],note:'Keep at reception',idempotency_key:'synthetic-retry-key-0001'};
      const results=await Promise.all([request('POST','/store/orders',tokens[parent.id],body),request('POST','/store/orders',tokens[parent.id],body)]);
      results.forEach(r=>assert.equal(r.status,201,JSON.stringify(r.body)));
      assert.equal(results[0].body.id,results[1].body.id);assert.equal(results[0].body.note,body.note);
      assert.equal((await db('products').where({id:product.id}).first()).stock_qty,8);
      assert.equal((await request('POST','/store/orders',tokens[parent.id],{...body,note:'Changed'})).status,409);
      const other=(await request('POST','/store/orders',tokens[otherParent.id],body));assert.equal(other.status,404);
      const updated=await db('products').where({id:product.id}).first();
      const edits=await Promise.all([20,30].map(price=>request('PATCH',`/store/products/${product.id}`,tokens[admin.id],{version:updated.version,price})));
      assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
    });
    await t.test('event and center settings edits reject stale versions',async()=>{
      const event=(await request('POST','/events',tokens[admin.id],{title:'Family day',event_date:'2040-01-01',event_type:'meeting'})).body;
      const results=await Promise.all(['One','Two'].map(title=>request('PATCH',`/events/${event.id}`,tokens[admin.id],{title,version:event.version})));
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      const center=await db('daycares').where({id:daycares[0].id}).first();
      const settings=await Promise.all(['One','Two'].map(name=>request('PATCH','/portal/settings',tokens[admin.id],{name,version:center.version})));
      assert.deepEqual(settings.map(r=>r.status).sort(),[200,409]);
    });
    await t.test('order edits reject stale writes and cancellation returns stock once',async()=>{
      const product=(await request('POST','/store/products',tokens[admin.id],{name:'Reservation test',price:10,stock_qty:10})).body;
      const create=async key=>(await request('POST','/store/orders',tokens[parent.id],{items:[{product_id:product.id,quantity:2}],idempotency_key:key})).body;
      const order=await create('synthetic-order-status-0001');
      const update=body=>request('PATCH',`/store/orders/${order.id}/status`,tokens[admin.id],body);
      const results=await Promise.all([update({version:order.version,order_status:'confirmed'}),update({version:order.version,order_status:'cancelled'})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      const current=await db('orders').where({id:order.id}).first();
      const cancelled=await update({version:current.version,order_status:'cancelled'});assert.equal(cancelled.status,200,JSON.stringify(cancelled.body));
      const stock=async()=>Number((await db('products').where({id:product.id}).first()).stock_qty);
      assert.equal(await stock(),10);
      assert.equal(Number((await db('audit_logs').where({target_table:'orders',target_id:order.id,action:'ORDER_STATUS_UPDATED'}).whereRaw("metadata->>'stock_restored'='true'").count('* as n').first()).n),1);
      const retry=await update({version:cancelled.body.version,order_status:'cancelled'});assert.equal(retry.status,200);assert.equal(await stock(),10);
      assert.equal((await update({version:retry.body.version,order_status:'confirmed'})).status,409);
      assert.equal((await update({version:retry.body.version,payment_status:'paid'})).status,409);
      assert.equal((await update({order_status:'cancelled'})).status,422);
      const second=await create('synthetic-order-status-0002');
      let res=await request('PATCH',`/store/orders/${second.id}/status`,tokens[admin.id],{version:second.version,order_status:'confirmed',payment_status:'paid'});assert.equal(res.status,200,JSON.stringify(res.body));
      assert.equal((await request('PATCH',`/store/orders/${second.id}/status`,tokens[admin.id],{version:res.body.version,order_status:'cancelled'})).status,409);
      assert.equal((await request('PATCH',`/store/orders/${second.id}/status`,tokens[admin.id],{version:res.body.version,payment_status:'unpaid'})).status,409);
      const orderVersion=res.body.version;
      assert.equal((await request('PATCH',`/store/orders/${second.id}/status`,tokens[admin.id],{version:orderVersion,order_status:'collected'})).status,409);
      res=await request('PATCH',`/store/orders/${second.id}/status`,tokens[admin.id],{version:orderVersion,order_status:'ready_for_pickup'});assert.equal(res.status,200);
      res=await request('PATCH',`/store/orders/${second.id}/status`,tokens[admin.id],{version:res.body.version,order_status:'collected'});assert.equal(res.status,200);
      assert.equal(await stock(),8);
      assert.equal((await db('payments').where({order_id:second.id}).first()).status,'paid');
      assert.equal((await request('PATCH',`/store/orders/${second.id}/status`,tokens[otherParent.id],{version:res.body.version,order_status:'cancelled'})).status,403);
    });
    await t.test('event cancellation conflicts with stale edits and stays tenant scoped',async()=>{
      const event=(await request('POST','/events',tokens[admin.id],{title:'Cancellation test',event_date:'2040-01-01',event_type:'meeting'})).body;
      const results=await Promise.all([
        request('PATCH',`/events/${event.id}`,tokens[admin.id],{version:event.version,title:'New title'}),
        request('DELETE',`/events/${event.id}`,tokens[admin.id],{version:event.version})
      ]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal((await request('DELETE',`/events/${event.id}`,tokens[otherParent.id],{version:event.version})).status,403);
      assert.equal((await request('DELETE',`/events/${event.id}`,tokens[admin.id],{})).status,422);
    });
    await t.test('preferences and reminders persist per account; health notify sends one parent message',async()=>{
      const event=(await db('events').where({daycare_id:daycares[0].id}).first());
      const prefs=await request('PATCH','/notifications/preferences',tokens[parent.id],{notifications:{announcements:true},reminder:{event_id:event.id,enabled:true}});
      assert.equal(prefs.status,200,JSON.stringify(prefs.body));
      assert.deepEqual((await request('GET','/notifications/preferences',tokens[parent.id])).body.reminders,[event.id]);
      assert.deepEqual((await request('GET','/notifications/preferences',tokens[otherParent.id])).body,{});
      assert.equal((await request('PATCH','/notifications/preferences',tokens[otherParent.id],{reminder:{event_id:event.id,enabled:true}})).status,404);
      const record=(await request('POST','/health',tokens[caregiver.id],{child_id:children[0].id,record_type:'health',description:'Observation for parent'})).body;
      const before=await db('messages').where({recipient_id:parent.id}).count('* as count').first();
      for(let i=0;i<2;i++)assert.equal((await request('PATCH',`/health/${record.id}/notify`,tokens[caregiver.id],{})).status,200);
      const after=await db('messages').where({recipient_id:parent.id}).count('* as count').first();assert.equal(Number(after.count)-Number(before.count),1);
      const inbox=await request('GET','/notifications',tokens[parent.id]);assert.ok(inbox.body.unread_messages.count>=1);
      const workspace=await request('GET','/portal/workspace',tokens[caregiver.id]);assert.ok(workspace.body.health.some(h=>h.id===record.id));
    });
    await t.test('self-renewal and impersonation fail without changing subscription', async () => {
      const before = await db('daycares').where({ id: daycares[0].id }).first();
      assert.equal((await request('POST', '/portal/renew-plan', tokens[admin.id], { plan: 'premium', days: 99999 })).status, 403);
      assert.deepEqual(await db('daycares').where({ id: daycares[0].id }).first(), before);
      assert.equal((await request('POST', `/saas/super-admin/daycares/${daycares[0].id}/impersonate`, tokens[owner.id], {})).status, 403);
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(tokens[owner.id]);
      const oldToken = jwt.sign({ ...decoded, isImpersonating: true, daycareId: daycares[0].id }, process.env.JWT_SECRET);
      assert.equal((await request('GET', '/portal/snapshot', oldToken)).status, 401);
    });
    await t.test('platform governance works using aggregates while private APIs stay denied', async () => {
      for (const path of ['/saas/super-admin/stats', '/saas/super-admin/daycares', `/saas/super-admin/daycares/${daycares[0].id}`, '/saas/super-admin/system-health']) {
        const result = await request('GET', path, tokens[owner.id]);
        assert.equal(result.status, 200, `${path}: ${JSON.stringify(result.body)}`);
      }
      for (const path of ['/portal/snapshot', '/children', '/announcements', '/users']) assert.equal((await request('GET', path, tokens[owner.id])).status, 403);
      assert.equal((await request('GET', '/saas/super-admin/daycares', tokens[admin.id])).status, 403);
      await db('daycares').where({ id: daycares[0].id }).update({ status: 'suspended' });
      assert.equal((await request('GET', '/auth/me', tokens[parent.id])).status, 401);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (tenantRaw) await tenantRaw.end();
    if (control) await control.end();
    // Exact generated names only; grants in this generated database are removed.
    for (const role of roles) {
      if ((await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role.user])).rows.length) {
        await pool.query(`DROP OWNED BY "${role.user}"`);
        await pool.query(`DROP ROLE "${role.user}"`);
      }
    }
  }
}));
