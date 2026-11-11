'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');
const {createStaffScheduling,expandRules,shiftProblems}=require('../src/modules/staff-scheduling/staff-scheduling.service');

test('weekly shifts use Addis Ababa time, bound overnight duration and detect conflicts',()=>{
  const rule={staff_id:4,weekday:1,group_id:null,start_time:'09:00',end_time:'17:00',can_attendance:true,can_pickup:false};
  const shifts=expandRules([rule],'2027-01-04',2);
  assert.equal(shifts[0].starts_at,'2027-01-04T06:00:00.000Z');assert.equal(shifts[1].local_date,'2027-01-11');
  assert.throws(()=>expandRules([rule],'2027-01-05',1),/Monday/);
  assert.throws(()=>expandRules([{...rule,end_time:'08:00'}],'2027-01-04',1),/16 hours/);
  const overnight=expandRules([{...rule,start_time:'20:00',end_time:'04:00'}],'2027-01-04',1)[0];
  assert.equal(overnight.ends_at,'2027-01-05T01:00:00.000Z');
  assert.equal(shiftProblems(shifts,[{...shifts[0],status:'active'}],[],[]).length,1);
  assert.equal(shiftProblems(shifts,[],[{...shifts[0],status:'approved'}],[]).length,1);
  assert.equal(shiftProblems([shifts[0]],[],[],[{staff_id:4,weekday:1,available:true,start_time:'10:00',end_time:'18:00'}]).length,1);
});

test('reviewed schedules, leave and substitutions preserve scoped duties and reject duplicate or cross-tenant changes',async()=>{
  await withCurrentDatabase(async({db,pool})=>{
    await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
    const [center,other,standard]=await db('daycares').insert([
      {name:'Scheduling Plus',slug:'scheduling-plus',contact_email:'scheduling-plus@example.invalid',status:'active',subscription_plan:'premium',subscription_terms:{code:'premium',features:{staff_scheduling:true}},subscription_ends_at:new Date(Date.now()+86400000*90)},
      {name:'Other Plus',slug:'scheduling-other',contact_email:'scheduling-other@example.invalid',status:'active',subscription_plan:'premium',subscription_terms:{code:'premium',features:{staff_scheduling:true}},subscription_ends_at:new Date(Date.now()+86400000*90)},
      {name:'Scheduling Standard',slug:'scheduling-standard',contact_email:'scheduling-standard@example.invalid',status:'active',subscription_plan:'standard'},
    ]).returning('*');
    const rows=await db('users').insert([
      {name:'Schedule Admin',email:'schedule-admin@example.invalid',role_id:1,daycare_id:center.id,status:'active',password_hash:'synthetic'},
      {name:'First Caregiver',email:'schedule-first@example.invalid',role_id:2,daycare_id:center.id,status:'active',password_hash:'synthetic'},
      {name:'Substitute Caregiver',email:'schedule-second@example.invalid',role_id:2,daycare_id:center.id,status:'active',password_hash:'synthetic'},
      {name:'Other Caregiver',email:'schedule-other@example.invalid',role_id:2,daycare_id:other.id,status:'active',password_hash:'synthetic'},
      {name:'Standard Admin',email:'schedule-standard@example.invalid',role_id:1,daycare_id:standard.id,status:'active',password_hash:'synthetic'},
    ]).returning('*');
    const [admin,first,second,outsider,standardAdmin]=rows.map(row=>({...row,role:row.role_id===1?'admin':'caregiver'}));
    const [group]=await db('groups').insert({name:'Schedule classroom',daycare_id:center.id}).returning('*');
    const service=createStaffScheduling(pool);
    const date=new Date(Date.now()+14*86400000);date.setUTCDate(date.getUTCDate()+(8-date.getUTCDay())%7);const week=date.toISOString().slice(0,10);
    const templateBody={name:'Reviewed weekly rota',rules:[{staff_id:first.id,group_id:group.id,weekday:1,start_time:'09:00',end_time:'17:00',can_attendance:true,can_pickup:true}]};
    await assert.rejects(service.createTemplate(templateBody,standardAdmin),error=>error.statusCode===403);
    await assert.rejects(service.createTemplate({...templateBody,rules:[{...templateBody.rules[0],staff_id:outsider.id}]},admin),error=>error.statusCode===422);
    await assert.rejects(service.createTemplate(templateBody,first),error=>error.statusCode===403);
    const template=await service.createTemplate(templateBody,admin);assert.equal((await db('front_desk_assignments')).length,0,'drafts grant no duties');
    const range={template_id:Number(template.id),week_start:week,weeks:1};
    const stale=await service.preview(range,admin);
    await service.saveAvailability({staff_id:first.id,weekday:1,available:true,start_time:'08:00',end_time:'18:00'},first);
    await assert.rejects(service.publish({...range,preview_token:stale.preview_token,request_key:'publish-stale-request-01',confirmed:true},admin),error=>error.statusCode===409);
    const preview=await service.preview(range,admin);assert.equal(preview.conflicts.length,0);
    const input={...range,preview_token:preview.preview_token,request_key:'publish-reviewed-request-01',confirmed:true};
    await assert.rejects(service.publish({...input,confirmed:false},admin),error=>error.statusCode===422);
    const published=await service.publish(input,admin);assert.equal(published.shift_count,1);
    assert.equal((await service.publish(input,admin)).replayed,true);
    assert.equal((await service.publish({...input,request_key:'publish-other-key-same-week'},admin)).replayed,true);
    const assignments=await db('front_desk_assignments').where({daycare_id:center.id});assert.equal(assignments.length,1);
    const duty=assignments[0];assert.equal(duty.can_pickup,true);assert.equal(duty.group_id,group.id);
    const own=await service.overview(first,{from:week,to:week});assert.equal(own.assignments.length,1);assert.equal(own.staff.length,1);assert.equal(own.templates.length,0);
    const leave=await service.requestLeave({staff_id:first.id,starts_at:new Date(duty.starts_at).toISOString(),ends_at:new Date(duty.ends_at).toISOString(),reason:'Planned personal leave'},first);
    await assert.rejects(service.reviewLeave(leave.id,{version:leave.version,decision:'approve',reason:'Schedule needs coverage'},admin),error=>error.statusCode===409);
    assert.equal((await db('front_desk_assignments').where({id:duty.id}).first()).status,'active','failed review must preserve care permissions');
    await assert.rejects(service.substitute(duty.id,{staff_id:outsider.id,reason:'Replace with another caregiver',confirmed:true},admin),error=>error.statusCode===422);
    await db('users').where({id:first.id}).update({status:'inactive'});
    const replacement=await service.substitute(duty.id,{staff_id:second.id,reason:'Replace with available caregiver',confirmed:true},admin);
    assert.equal(replacement.replacement.can_pickup,true);assert.equal(replacement.replacement.group_id,group.id);
    assert.equal((await db('front_desk_assignments').where({id:duty.id}).first()).status,'revoked');
    const approved=await service.reviewLeave(leave.id,{version:leave.version,decision:'approve',reason:'Replacement duty is now recorded'},admin);assert.equal(approved.status,'approved');
    await db('users').where({id:first.id}).update({status:'active'});
    // Legacy manual duties must respect the same approved-leave invariant.
    // Bind the production service to this disposable database only.
    const dbPath=require.resolve('../src/config/db');
    const portalPath=require.resolve('../src/modules/portal/portal.service');
    const previousDb=require.cache[dbPath],previousPortal=require.cache[portalPath];
    try{
      require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:pool};delete require.cache[portalPath];
      const portal=require(portalPath);
      const before=await db('front_desk_assignments').where({daycare_id:center.id}).count('* AS count').first();
      await assert.rejects(portal.saveDuty({staff_id:first.id,group_id:group.id,starts_at:new Date(duty.starts_at).toISOString(),ends_at:new Date(duty.ends_at).toISOString(),can_attendance:true,can_pickup:true},admin),error=>error.statusCode===409&&/approved leave/.test(error.message));
      const after=await db('front_desk_assignments').where({daycare_id:center.id}).count('* AS count').first();
      assert.equal(after.count,before.count,'rejected manual duties must not grant care permissions');
      const adjacent=await portal.saveDuty({staff_id:first.id,group_id:group.id,starts_at:new Date(duty.ends_at).toISOString(),ends_at:new Date(Date.parse(duty.ends_at)+3600000).toISOString(),can_attendance:true,can_pickup:false},admin);
      assert.equal(adjacent.status,'active','a duty beginning exactly after approved leave remains valid');
    }finally{
      if(previousDb)require.cache[dbPath]=previousDb;else delete require.cache[dbPath];
      if(previousPortal)require.cache[portalPath]=previousPortal;else delete require.cache[portalPath];
    }
    const conflicts=await service.preview(range,admin);assert.ok(conflicts.conflicts.some(row=>row.reason.includes('leave')));
    await assert.rejects(service.saveAvailability({staff_id:second.id,weekday:1,available:true,start_time:'08:00',end_time:'18:00'},first),error=>error.statusCode===403);
    const otherActor={...outsider,role:'caregiver'};await assert.rejects(service.overview({...otherActor,daycare_id:center.id}),error=>error.statusCode===403);
    assert.ok((await db('messages').where({daycare_id:center.id})).length>=4,'publication/review/substitution create in-app change messages');
    const c=await pool.connect();try{
      await c.query('BEGIN');await c.query('SET LOCAL ROLE ankelba_tenant');await c.query("SELECT set_config('app.daycare_id',$1,true)",[String(other.id)]);
      assert.equal((await c.query('SELECT id FROM staff_schedule_templates')).rows.length,0);
      assert.equal((await c.query('SELECT id FROM staff_leave_requests')).rows.length,0);await c.query('ROLLBACK');
      await c.query('SET ROLE ankelba_tenant');await c.query("SELECT set_config('app.daycare_id',$1,false)",[String(center.id)]);
      const runtime=createStaffScheduling({connect:async()=>({query:(...args)=>c.query(...args),release(){}})});
      const runtimeTemplate=await runtime.createTemplate({...templateBody,name:'Runtime permission check',rules:[{...templateBody.rules[0],staff_id:second.id}]},admin);
      assert.ok(runtimeTemplate.id);assert.ok((await runtime.overview(admin,{from:week,to:week})).templates.some(row=>row.id===runtimeTemplate.id));
    }finally{await c.query('RESET ROLE');await c.query('RESET app.daycare_id');c.release();}
  });
});
