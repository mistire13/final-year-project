const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
require('dotenv').config();
process.env.NODE_ENV='test';
process.env.JWT_SECRET='isolated-portal-test-key-not-for-deployment';
const knexFactory=require('knex');
const db=require('../src/config/db');
const schema='portal_test_'+Date.now();
const connection={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME||'ankelba_dev',user:process.env.DB_USER||'postgres',password:process.env.DB_PASSWORD};
const admin={id:1,role:'admin',daycare_id:1,daycareId:1},staff={id:2,role:'caregiver',daycare_id:1,daycareId:1};
let knex,service,server,origin;
before(async()=>{
 assert.ok(['localhost','127.0.0.1'].includes(connection.host),'Tests require a local database');
 assert.match(connection.database,/dev|test/i,'Tests require a development/test database');
 knex=knexFactory({client:'pg',connection,pool:{min:0,max:2}});
 await knex.raw('CREATE SCHEMA ??',[schema]);
 db.on('connect',client=>client.query('SET search_path TO '+schema));
 const migrationKnex=knexFactory({client:'pg',connection,searchPath:[schema],pool:{min:0,max:2}});
 await migrationKnex.migrate.latest({directory:require('node:path').resolve(__dirname,'../src/db/migrations'),schemaName:schema});
 await migrationKnex.destroy();
 await db.query("INSERT INTO roles(id,name) VALUES(1,'admin'),(2,'caregiver'),(3,'parent') ON CONFLICT DO NOTHING");
 await db.query("INSERT INTO daycares(id,name,slug,contact_email,status,subscription_plan) VALUES(1,'Test Daycare','test-daycare','test@daycare.invalid','active','premium') ON CONFLICT DO NOTHING");
 await db.query("DELETE FROM users");
 await db.query("INSERT INTO users(id,name,email,password_hash,role_id,daycare_id) VALUES(1,'Admin','admin@test.invalid','test-only',1,1),(2,'Staff','staff@test.invalid','test-only',2,1),(3,'Guardian','guardian@test.invalid','test-only',3,1),(4,'Other staff','other@test.invalid','test-only',2,1)");
 await db.query("INSERT INTO groups(id,name,daycare_id) VALUES(1,'Group One',1),(2,'Group Two',1)");
 service=require('../src/modules/portal/portal.service');
 const app=require('../src/app');server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 await db.end();
 if(knex){assert.match(schema,/^portal_test_\d+$/);await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE',[schema]);await knex.destroy();}
});
let childCounter=0;
async function child(group=1,authorized=true){const id=++childCounter;await db.query("INSERT INTO children(id,full_name,dob,group_id,caregiver_id,daycare_id) VALUES($1,'Test child','2022-05-12',$2,2,1)",[id,group]);await db.query("INSERT INTO guardian_links(child_id,user_id,relationship,pickup_authorized,created_by,daycare_id) VALUES($1,3,'Parent',$2,1,1)",[id,authorized]);return id;}
const shift=(staff_id=2,group_id=1)=>({staff_id,group_id,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),can_attendance:true,can_pickup:true});
test('duty assignment rejects overlap, invalid duration and inactive staff',async()=>{
 await service.saveDuty(shift(),admin);
 await assert.rejects(service.saveDuty(shift(),admin),e=>e.statusCode===409);
 await assert.rejects(service.saveDuty({...shift(),ends_at:new Date(Date.now()+20*3600000).toISOString()},admin),e=>e.statusCode===422);
 await db.query("UPDATE users SET status='inactive' WHERE id=4");await assert.rejects(service.saveDuty(shift(4),admin),e=>e.statusCode===422);await db.query("UPDATE users SET status='active' WHERE id=4");
});
test('staff is limited to active shift scope and simultaneous check-in is serialized',async()=>{
 const wrong=await child(2);await assert.rejects(service.recordAttendance({child_id:wrong,event_type:'checkin'},staff),e=>e.statusCode===403);
 const id=await child();const results=await Promise.allSettled([service.recordAttendance({child_id:id,event_type:'checkin'},staff),service.recordAttendance({child_id:id,event_type:'checkin'},staff)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(service.recordAttendance({child_id:id,event_type:'checkout'},staff),e=>e.statusCode===409);
});
test('checkout requires authorization and actual manual identity confirmation',async()=>{
 const id=await child(1,false);await service.recordAttendance({child_id:id,event_type:'checkin'},staff);
 const body={child_id:id,guardian_user_id:3,method:'manual',identity_confirmed:true,reason:'Identity checked against approved record.'};
 await assert.rejects(service.checkout(body,staff),e=>e.statusCode===403);
 await db.query('UPDATE guardian_links SET pickup_authorized=TRUE WHERE child_id=$1',[id]);
 await assert.rejects(service.checkout({...body,identity_confirmed:false},staff),e=>e.statusCode===422);
 await assert.rejects(service.checkout({...body,method:'biometric'},staff),e=>e.statusCode===503);
 const completed=await service.checkout(body,staff);assert.equal(completed.attendance.event_type,'checkout');assert.equal(completed.verification.result,'manual_fallback');
 const {rows}=await db.query('SELECT attendance_id FROM guardian_verification_events WHERE child_id=$1',[id]);assert.equal(rows[0].attendance_id,completed.attendance.id);
 await assert.rejects(service.checkout(body,staff),e=>e.statusCode===409);
});
test('concurrent pickups create one checkout, verification and audit record',async()=>{
 const id=await child();await service.recordAttendance({child_id:id,event_type:'checkin'},staff);
 const body={child_id:id,guardian_user_id:3,method:'manual',identity_confirmed:true,reason:'Approved adult identity checked at the desk.'};
 const results=await Promise.allSettled([service.checkout(body,staff),service.checkout(body,staff)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM attendance WHERE child_id=$1 AND event_type='checkout'",[id])).rows[0].count,1);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM guardian_verification_events WHERE child_id=$1',[id])).rows[0].count,1);
});
test('snapshot forbids parents and does not expose password or biometric reference data',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await assert.rejects(service.snapshot(date,7,{id:3,role:'parent'}),e=>e.statusCode===403);
 const data=await service.snapshot(date,7,admin);assert.ok(data.children.length);assert.equal(JSON.stringify(data).includes('password_hash'),false);assert.equal(JSON.stringify(data).includes('reference_data'),false);
 const scoped=await service.snapshot(date,7,staff,true);assert.ok(scoped.children.every(c=>c.group_id===1));assert.equal(scoped.orders.length,0);
});
test('revocation and expired shifts immediately prevent desk operations',async()=>{
 const {rows}=await db.query("SELECT id FROM front_desk_assignments WHERE staff_id=2 AND status='active'");await service.revokeDuty(rows[0].id,admin);
 const id=await child();await assert.rejects(service.recordAttendance({child_id:id,event_type:'checkin'},staff),e=>e.statusCode===403);
 await service.saveDuty({...shift(),starts_at:new Date(Date.now()-7200000).toISOString(),ends_at:new Date(Date.now()-3600000).toISOString()},admin);
 await assert.rejects(service.recordAttendance({child_id:id,event_type:'checkin'},staff),e=>e.statusCode===403);
});
test('HTTP routes reject unauthenticated, parent and deactivated accounts',async()=>{
 const jwt=require('jsonwebtoken');
 const legacySecurity=require('../src/modules/auth/legacy-security');
 const token=async id=>{
  const account=await legacySecurity.findAccount(db,{id});
  return jwt.sign({userId:id,role:account.role,daycareId:account.daycare_id,auth_state:legacySecurity.authState(account)},process.env.JWT_SECRET,{expiresIn:'10m',audience:'ankelba-legacy'});
 };
 assert.equal((await fetch(origin+'/api/portal/snapshot')).status,401);
 assert.equal((await fetch(origin+'/api/portal/snapshot',{headers:{Authorization:'Bearer '+(await token(3))}})).status,403);
 const tok2=await token(2);
 await db.query("UPDATE users SET status='inactive' WHERE id=2");
 assert.equal((await fetch(origin+'/api/portal/workspace',{headers:{Authorization:'Bearer '+tok2}})).status,401);
 assert.equal((await fetch(origin+'/api/portal/snapshot',{headers:{Authorization:'Bearer '+(await token(1))}})).status,200);
});
