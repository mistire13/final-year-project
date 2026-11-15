'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');

test('push events are transactionally queued for intended guardians and never cross daycares',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('roles').insert([{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const [a,b]=await db('daycares').insert([{name:'Push A',slug:'push-a',contact_email:'a@example.invalid',status:'active'},
      {name:'Push B',slug:'push-b',contact_email:'b@example.invalid',status:'active'}]).returning('*');
    const [admin,caregiver,parent,other]=await db('users').insert([
      {name:'Admin',email:'admin@example.invalid',role_id:1,daycare_id:a.id,password_hash:'synthetic',status:'active'},
      {name:'Caregiver',email:'care@example.invalid',role_id:2,daycare_id:a.id,password_hash:'synthetic',status:'active'},
      {name:'Parent',email:'parent@example.invalid',role_id:3,daycare_id:a.id,password_hash:'synthetic',status:'active'},
      {name:'Other',email:'other@example.invalid',role_id:3,daycare_id:b.id,password_hash:'synthetic',status:'active'},
    ]).returning('*');
    const [child]=await db('children').insert({full_name:'Child',dob:'2022-01-01',gender:'female',caregiver_id:caregiver.id,enrollment_status:'active',daycare_id:a.id}).returning('*');
    await db('guardian_links').insert({child_id:child.id,user_id:parent.id,relationship:'Mother',created_by:admin.id});
    await db('push_devices').insert([{daycare_id:a.id,user_id:parent.id,token:'ExpoPushToken[parenttoken123]'},
      {daycare_id:b.id,user_id:other.id,token:'ExpoPushToken[othertoken123]'}]);
    process.env.JWT_SECRET='synthetic-push-test-secret';
    const security=require('../src/modules/auth/legacy-security');
    const account=await security.findAccount(pool,{id:parent.id});
    await db('push_devices').where({user_id:parent.id}).update({session_kind:'legacy',session_state:security.authState(account),session_expires_at:new Date(Date.now()+3600000)});
    const runtime=await pool.connect();const controlRuntime=await pool.connect();
    await runtime.query('SET ROLE ankelba_tenant');await controlRuntime.query('SET ROLE ankelba_control');
    await runtime.query("SELECT set_config('app.daycare_id',$1,false),set_config('app.current_daycare_id',$1,false)",[String(a.id)]);
    await runtime.query("INSERT INTO daily_reports(child_id,caregiver_id,report_date,daycare_id) VALUES($1,$2,'2026-11-14',$3)",[child.id,caregiver.id,a.id]);
    await runtime.query("INSERT INTO attendance(child_id,recorded_by,event_type,daycare_id) VALUES($1,$2,'checkin',$3),($1,$2,'checkout',$3)",[child.id,caregiver.id,a.id]);
    await runtime.query("INSERT INTO announcements(author_id,title,body,audience,daycare_id) VALUES($1,'Test','Test','parents',$2),($1,'Staff','Test','caregivers',$2)",[admin.id,a.id]);
    await runtime.query("INSERT INTO messages(sender_id,recipient_id,body,daycare_id) VALUES($1,$2,'Hello',$3)",[caregiver.id,parent.id,a.id]);
    const events=await db('push_activity_deliveries').select('event_type','user_id','daycare_id').orderBy('id');
    assert.deepEqual(events.map(e=>e.event_type),['report','checkin','pickup','announcement']);
    assert.ok(events.every(e=>e.user_id===parent.id && e.daycare_id===a.id));
    assert.equal((await db('push_message_deliveries')).length,1);
    await assert.rejects(db.transaction(async tx=>{await tx('attendance').insert({child_id:child.id,recorded_by:caregiver.id,event_type:'checkin',daycare_id:a.id});throw new Error('rollback');}),/rollback/);
    assert.equal((await db('push_activity_deliveries')).length,4);
    const delivered=[];
    try {
      const errors=[];
      const wrapped={control:controlRuntime,query:async(...args)=>{try{return await runtime.query(...args);}catch(error){errors.push(error.message);throw error;}}};
      const worker=require('../src/modules/notifications/push-worker').createPushWorker({pool:wrapped,logger:{error:()=>{}},
        fetchImpl:async(_url,options)=>{delivered.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:{status:'ok',id:'ticket'}})};}});
      await worker.run();
      assert.deepEqual(errors,[]);
      assert.equal(delivered.length,5);
      assert.deepEqual(delivered.map(d=>d.data.type).sort(),['announcement','checkin','message','pickup','report']);
      assert.ok(delivered.every(d=>!d.body.includes('Child')&&!d.body.includes('Hello')));
      // Removing a guardian link before delivery cancels queued child events.
      await runtime.query("INSERT INTO attendance(child_id,recorded_by,event_type,daycare_id) VALUES($1,$2,'checkin',$3)",[child.id,caregiver.id,a.id]);
      await db('guardian_links').where({child_id:child.id,user_id:parent.id}).del();
      await worker.deliver(a.id); assert.equal(delivered.length,5);
      await db('guardian_links').insert({child_id:child.id,user_id:parent.id,relationship:'Mother',created_by:admin.id});
      const [changed]=await db('announcements').insert({author_id:admin.id,title:'Changed',body:'Test',audience:'parents',daycare_id:a.id}).returning('*');
      await db('announcements').where({id:changed.id}).update({audience:'staff'});
      await worker.deliver(a.id);assert.equal(delivered.length,5);
      await db('users').where({id:parent.id}).update({ui_preferences:JSON.stringify({notifications:{activity:false,announcements:false,messages:false}})});
      await runtime.query("INSERT INTO attendance(child_id,recorded_by,event_type,daycare_id) VALUES($1,$2,'checkin',$3)",[child.id,caregiver.id,a.id]);
      await runtime.query("INSERT INTO announcements(author_id,title,body,audience,daycare_id) VALUES($1,'Opt out','Test','parents',$2)",[admin.id,a.id]);
      await runtime.query("INSERT INTO messages(sender_id,recipient_id,body,daycare_id) VALUES($1,$2,'Opt out',$3)",[caregiver.id,parent.id,a.id]);
      await worker.deliver(a.id);assert.equal(delivered.length,5,'preferences prevent message and activity push');
      await db('users').where({id:parent.id}).update({ui_preferences:JSON.stringify({notifications:{activity:true,messages:false}})});
      await runtime.query("INSERT INTO messages(sender_id,recipient_id,body,daycare_id,push_event_type) VALUES($1,$2,'Health',$3,'health')",[caregiver.id,parent.id,a.id]);
      await worker.deliver(a.id);assert.equal(delivered.length,6,'health notifications use the activity preference');
      assert.equal(delivered[5].body,'Your daycare shared a health update.');
      assert.equal(delivered[5].channelId,'activity');
      await db('users').where({id:parent.id}).update({ui_preferences:'{}'});
      await runtime.query("INSERT INTO messages(sender_id,recipient_id,body,daycare_id) VALUES($1,$2,'Expired',$3)",[caregiver.id,parent.id,a.id]);
      await db('push_devices').where({user_id:parent.id}).update({session_expires_at:new Date(Date.now()-1000)});
      await worker.deliver(a.id);assert.equal(delivered.length,6);
      await db('push_devices').where({user_id:parent.id}).update({session_expires_at:new Date(Date.now()+3600000)});
      // A revoked legacy login is rejected even when the device remains active.
      await runtime.query("INSERT INTO messages(sender_id,recipient_id,body,daycare_id) VALUES($1,$2,'Revoked',$3)",[caregiver.id,parent.id,a.id]);
      await db('users').where({id:parent.id}).update({security_revision:db.raw('gen_random_uuid()')});
      await worker.deliver(a.id);assert.equal(delivered.length,6);
      // Modern sessions are checked through the restricted control role too.
      const [session]=await db('auth_sessions').insert({daycare_id:a.id,user_id:parent.id,token_hash:'a'.repeat(64),expires_at:new Date(Date.now()+3600000)}).returning('*');
      await db('push_devices').where({user_id:parent.id}).update({session_kind:'modern',session_state:session.id,session_expires_at:session.expires_at});
      await runtime.query("INSERT INTO messages(sender_id,recipient_id,body,daycare_id) VALUES($1,$2,'Modern',$3)",[caregiver.id,parent.id,a.id]);
      await worker.deliver(a.id);assert.equal(delivered.length,7);
      await runtime.query("INSERT INTO messages(sender_id,recipient_id,body,daycare_id) VALUES($1,$2,'Revoked modern',$3)",[caregiver.id,parent.id,a.id]);
      await db('auth_sessions').where({id:session.id}).update({revoked_at:new Date()});
      await worker.deliver(a.id);assert.equal(delivered.length,7);
      const [adminSession]=await db('auth_sessions').insert({daycare_id:a.id,user_id:admin.id,token_hash:'b'.repeat(64),expires_at:new Date(Date.now()+3600000)}).returning('*');
      await db('push_devices').insert({daycare_id:a.id,user_id:admin.id,token:'ExpoPushToken[admintoken123]',session_kind:'modern',session_state:adminSession.id,session_expires_at:adminSession.expires_at});
      await runtime.query("INSERT INTO announcements(author_id,title,body,audience,daycare_id) VALUES($1,'Admin','Test','staff',$2)",[caregiver.id,a.id]);
      await worker.deliver(a.id);assert.equal(delivered.length,7,'admin session without MFA must not receive pushes');
      assert.deepEqual(errors,[]);
    } finally {await runtime.query('RESET ROLE');runtime.release();await controlRuntime.query('RESET ROLE');controlRuntime.release();}
    // Exercise the tenant runtime role and token reassignment, not only owner bypass.
    const client=await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE ankelba_tenant');
      await client.query("SELECT set_config('app.daycare_id',$1,true),set_config('app.current_daycare_id',$1,true)",[String(a.id)]);
      await client.query('SELECT public.register_push_token($1,$2,$3,$4,$5)',['ExpoPushToken[othertoken123]',parent.id,'legacy',security.authState(account),new Date(Date.now()+3600000)]);
      await client.query('COMMIT');
    } finally { client.release(); }
    const owners=await db('push_devices').where({token:'ExpoPushToken[othertoken123]',active:true});
    assert.equal(owners.length,1);assert.equal(owners[0].user_id,parent.id);
  });
});

test('059 adds health classification when 058 was already installed and is safe to reapply',async()=>{
  await withCurrentDatabase(async({db})=>{
    // This is a generated throwaway database. Recreate the earlier installed
    // 058 schema and apply the forward migration twice.
    await db.raw('ALTER TABLE messages DROP COLUMN push_event_type');
    const migration=require('../src/db/migrations/059_health_push_classification');
    await migration.up(db);await migration.up(db);
    const {rows}=await db.raw("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='push_event_type'");
    assert.equal(rows.length,1);
    await assert.rejects(migration.down(),/cannot be rolled back/);
  });
});
