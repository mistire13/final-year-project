'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');
const { once } = require('node:events');
const { withCurrentDatabase } = require('./helpers/auth-test-database.cjs');

test('operator deletion retains history, denies tenant actors and prevents resurrection', async () => {
  await withCurrentDatabase(async ({ db, pool }) => {
    await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const [center] = await db('daycares').insert({name:'Deletion test center',slug:'deletion-test',contact_email:'office@deletion.invalid',status:'active'}).returning('*');
    const password = 'Synthetic-deletion-password-123!';
    const hash = await bcrypt.hash(password,4);
    const [owner, admin] = await db('users').insert([
      {name:'Operator',email:'owner@deletion.invalid',password_hash:hash,role_id:0,status:'active'},
      {name:'Admin',email:'admin@deletion.invalid',password_hash:hash,role_id:1,status:'active',daycare_id:center.id},
    ]).returning('*');
    await db('children').insert({full_name:'Synthetic child',dob:'2023-01-01',daycare_id:center.id});
    const dbFile = require.resolve('../src/config/db'), previous = require.cache[dbFile];
    require.cache[dbFile] = {id:dbFile,filename:dbFile,loaded:true,exports:pool};
    const files = ['../src/modules/saas/saas.service','../src/modules/saas/saas.controller','../src/modules/saas/saas.routes','../src/modules/auth/auth.service','../src/middleware/auth'];
    files.forEach(f => delete require.cache[require.resolve(f)]);
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'synthetic-deletion-isolated-database-secret';
    const svc = require('../src/modules/saas/saas.service');
    const auth = require('../src/modules/auth/auth.service');
    const app = express(); app.use(express.json());
    app.use('/api/saas',require('../src/modules/saas/saas.routes'));
    app.use(require('../src/middleware/errorHandler'));
    const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
    const token = (await auth.login(owner.email,password)).token;
    const adminToken = (await auth.login(admin.email,password)).token;
    const body = {version:center.version,confirmation:center.name,reason:'Center requested closure for this test'};
    const request = async (bearer, payload=body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/saas/super-admin/daycares/${center.id}`, {
        method:'DELETE',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(payload),
      });
      await response.json(); return response.status;
    };
    try {
      const beforeCount = (await svc.getPlatformStats()).total_daycares;
      assert.equal(await request(),401);
      assert.equal(await request(adminToken),403);
      assert.equal(await request(token,{...body,confirmation:'Wrong name'}),422);
      assert.equal(await request(token,{...body,version:center.version+1}),409);
      // A failed audit must roll the entire removal back.
      await assert.rejects(svc.deleteDaycare(center.id,body,-999));
      assert.equal((await db('daycares').where('id',center.id).first()).deleted_at,null);
      assert.equal(await request(token),200);
      assert.equal(await request(token),200);
      assert.equal(await request(adminToken),401); // Previously valid session is no longer accepted.
      assert.equal((await db('audit_logs').where({action:'DAYCARE_DELETED',target_id:center.id})).length,1);
      assert.equal((await db('children').where('daycare_id',center.id)).length,1);
      assert.equal((await svc.listDaycares()).some(d=>d.id===center.id),false);
      assert.equal((await svc.getPlatformStats()).total_daycares,beforeCount-1);
      await assert.rejects(auth.login(admin.email,password),e=>(e.statusCode||e.status)===403);
      await assert.rejects(svc.activateDaycare(center.id,owner.id),e=>e.statusCode===409);
      await assert.rejects(db('daycares').where('id',center.id).update({status:'active'}));
    } finally {
      await new Promise(resolve=>server.close(resolve));
      files.forEach(f=>delete require.cache[require.resolve(f)]);
      if(previous) require.cache[dbFile]=previous; else delete require.cache[dbFile];
      if(oldSecret===undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET=oldSecret;
    }
  });
});
