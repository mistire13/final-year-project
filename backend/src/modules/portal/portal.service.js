'use strict';
const db = require('../../config/db');
const { failure, shiftError, transitionError } = require('./policy');
const zoneDay = "(event_time AT TIME ZONE 'Africa/Addis_Ababa')::date";
const queryRows = async (client, sql, values=[]) => (await client.query(sql,values)).rows;
async function transaction(work) {
 const client=await db.connect();
 try {await client.query('BEGIN'); const result=await work(client); await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();}
}
async function audit(client, actor, action, table, id, metadata={}, explicitDaycareId=null) {
 const actorId = typeof actor === 'object' && actor !== null ? actor.id : actor;
 const dcId = explicitDaycareId !== null ? explicitDaycareId : (typeof actor === 'object' && actor !== null ? (actor.daycare_id || null) : null);
 await client.query('INSERT INTO audit_logs(actor_id,action,target_table,target_id,metadata,daycare_id) VALUES($1,$2,$3,$4,$5,$6)',[actorId,action,table,id,JSON.stringify(metadata),dcId]);
}
async function activeActor(client,user,adminOnly=false) {
 const [actor]=await queryRows(client,'SELECT u.id,u.status,u.daycare_id,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR SHARE OF u',[user.id]);
 if(actor?.role==='super_admin'||user.role==='super_admin'||user.is_impersonating)throw failure('Platform operators cannot access private daycare workspaces.',403);
 if(!actor||actor.status!=='active')throw failure('Your account is inactive.',403);
 if(!actor.daycare_id)throw failure('No daycare assigned to your account.',403);

 if(adminOnly?actor.role!=='admin':!['admin','caregiver'].includes(actor.role))throw failure('Staff access required.',403);
 return actor;
}
async function assertScope(client,user,child,action,regular=false) {
 const actor=await activeActor(client,user);
 if(child.daycare_id !== actor.daycare_id) {
   throw failure('Child does not belong to your daycare center.', 403);
 }
 if(actor.role==='admin')return actor;
 if(action==='attendance'&&child.caregiver_id===actor.id)return actor;
 const rows=await queryRows(client,`SELECT id FROM front_desk_assignments WHERE staff_id=$1 AND daycare_id=$3 AND status='active' AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp() AND (group_id IS NULL OR group_id=$2) AND ${action==='pickup'?'can_pickup':'can_attendance'}=TRUE FOR SHARE`,[actor.id,child.group_id,actor.daycare_id]);
 if(!rows.length)throw failure('No active front-desk assignment for this child and action.',403);
 return actor;
}
async function saveDuty(body,user) {
 if(!body.can_attendance&&!body.can_pickup)throw failure('Choose at least one responsibility.');
 const problem=shiftError(body.starts_at,body.ends_at); if(problem)throw failure(problem);
 return transaction(async client=>{
  const actor = await activeActor(client,user,true);
  const [staff]=await queryRows(client,"SELECT u.id,u.status,u.daycare_id,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE OF u",[body.staff_id]);
  if(!staff||staff.status!=='active'||staff.role!=='caregiver')throw failure('Choose an active caregiver.');
  if(staff.daycare_id !== actor.daycare_id)throw failure('Caregiver must belong to your daycare center.', 403);
  if(body.group_id) {
    const [grp]=await queryRows(client,"SELECT id,daycare_id FROM groups WHERE id=$1",[body.group_id]);
    if(!grp||grp.daycare_id!==actor.daycare_id)throw failure('Group must belong to your daycare center.', 403);
  }
  const overlap=await queryRows(client,"SELECT id FROM front_desk_assignments WHERE staff_id=$1 AND status='active' AND starts_at<$3 AND ends_at>$2",[body.staff_id,body.starts_at,body.ends_at]);
  if(overlap.length)throw failure('This staff member already has an overlapping shift.',409);
  const dutyDaycareId = actor.daycare_id;
  const [duty]=await queryRows(client,'INSERT INTO front_desk_assignments(staff_id,group_id,starts_at,ends_at,can_attendance,can_pickup,assigned_by,daycare_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[body.staff_id,body.group_id||null,body.starts_at,body.ends_at,body.can_attendance,body.can_pickup,user.id,dutyDaycareId]);
  await audit(client,actor,'FRONT_DESK_ASSIGNED','front_desk_assignments',duty.id,{staff_id:body.staff_id},dutyDaycareId);return duty;
 });
}
async function revokeDuty(id,user) {return transaction(async client=>{
 const actor = await activeActor(client,user,true);
 const [dutyCheck]=await queryRows(client,"SELECT id,daycare_id FROM front_desk_assignments WHERE id=$1",[id]);
 if(!dutyCheck)throw failure('Assignment is missing or already revoked.',409);
 if(dutyCheck.daycare_id!==actor.daycare_id)throw failure('Forbidden.',403);
 const [row]=await queryRows(client,"UPDATE front_desk_assignments SET status='revoked',revoked_at=NOW() WHERE id=$1 AND status='active' RETURNING *",[id]);
 if(!row)throw failure('Assignment is missing or already revoked.',409);
 await audit(client,actor,'FRONT_DESK_REVOKED','front_desk_assignments',row.id,{},dutyCheck.daycare_id);return row;
});}
async function recordAttendance(body,user,regular=false) {return transaction(async client=>{
 const [child]=await queryRows(client,'SELECT * FROM children WHERE id=$1 FOR UPDATE',[body.child_id]);
 if(!child||child.enrollment_status!=='active')throw failure('Active child not found.',404);
 const actor = await assertScope(client,user,child,'attendance',regular);
 if(body.event_type==='checkout')throw failure('Use the verified front-desk pickup flow to check out a child.',409);
 const [previous]=await queryRows(client,`SELECT event_type FROM attendance WHERE child_id=$1 AND ${zoneDay}=(clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date ORDER BY event_time DESC,id DESC LIMIT 1`,[child.id]);
 const error=transitionError(previous?.event_type,body.event_type);if(error)throw failure(error,409);
 const [record]=await queryRows(client,'INSERT INTO attendance(child_id,recorded_by,event_type,notes,daycare_id) VALUES($1,$2,$3,$4,$5) RETURNING *',[child.id,user.id,body.event_type,body.notes||null,child.daycare_id]);
 await audit(client,actor,'ATTENDANCE_RECORDED','attendance',record.id,{child_id:child.id,event_type:record.event_type},child.daycare_id);return record;
});}
async function checkout(body,user) {return transaction(async client=>{
 const [child]=await queryRows(client,'SELECT * FROM children WHERE id=$1 FOR UPDATE',[body.child_id]);
 if(!child||child.enrollment_status!=='active')throw failure('Active child not found.',404);
 const actor = await assertScope(client,user,child,'pickup');
 const [guardian]=body.pickup_guardian_id
  ? await queryRows(client,"SELECT id,daycare_id,name FROM pickup_guardians WHERE child_id=$1 AND id=$2 AND daycare_id=$3 AND status='approved' FOR SHARE",[child.id,body.pickup_guardian_id,child.daycare_id])
  : await queryRows(client,"SELECT gl.id,u.daycare_id,u.name FROM guardian_links gl JOIN users u ON u.id=gl.user_id WHERE gl.child_id=$1 AND gl.user_id=$2 AND gl.pickup_authorized=TRUE AND u.status='active' FOR SHARE OF gl,u",[child.id,body.guardian_user_id]);
 if(!guardian)throw failure('This adult is not currently authorized for pickup.',403);
 if(guardian.daycare_id !== child.daycare_id)throw failure('Guardian does not belong to child daycare.',403);
 const [previous]=await queryRows(client,`SELECT event_type FROM attendance WHERE child_id=$1 AND ${zoneDay}=(clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date ORDER BY event_time DESC,id DESC LIMIT 1`,[child.id]);
 const error=transitionError(previous?.event_type,'checkout');if(error)throw failure(error,409);
 if(body.method!=='manual')throw failure('Biometric device integration is not configured. Use the approved manual check.',503);
 if(body.identity_confirmed!==true||!body.reason||body.reason.trim().length<12)throw failure('Record the identity check performed and confirm the adult identity.');
 // Verify and release within one locked transaction; no reusable client-supplied success token.
 const [attendance]=await queryRows(client,"INSERT INTO attendance(child_id,recorded_by,event_type,daycare_id) VALUES($1,$2,'checkout',$3) RETURNING *",[child.id,user.id,child.daycare_id]);
 const [verification]=await queryRows(client,"INSERT INTO guardian_verification_events(child_id,guardian_user_id,pickup_guardian_id,verified_by,result,method,attendance_id,manual_reason) VALUES($1,$2,$3,$4,'manual_fallback','manual',$5,$6) RETURNING id,verified_at,result,method",[child.id,body.guardian_user_id||null,body.pickup_guardian_id||null,user.id,attendance.id,body.reason.trim()]);
 await audit(client,actor,'PICKUP_COMPLETED','attendance',attendance.id,{child_id:child.id,guardian_user_id:body.guardian_user_id||null,pickup_guardian_id:body.pickup_guardian_id||null,guardian_name:guardian.name,verification_id:verification.id,method:'manual'},child.daycare_id);
 return {attendance,verification};
});}
async function snapshot(date,days,user,staffOnly=false) {
 return transaction(async client=>{
  const actor=await activeActor(client,user,!staffOnly);
  const daycareId = actor.daycare_id;
  if(staffOnly){date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());days=1;}
  const isAdmin = actor.role === 'admin';
  const duties=await queryRows(client,`SELECT * FROM front_desk_assignments WHERE ($1::integer IS NULL OR staff_id=$1) AND ($2::integer IS NULL OR daycare_id=$2) ORDER BY starts_at DESC`,[(staffOnly && !isAdmin)?actor.id:null,daycareId]);
  const children=await queryRows(client,(staffOnly && !isAdmin)?`SELECT c.* FROM children c WHERE c.enrollment_status='active' AND ($2::integer IS NULL OR c.daycare_id=$2) AND (c.caregiver_id=$1 OR EXISTS (SELECT 1 FROM front_desk_assignments d WHERE d.staff_id=$1 AND d.daycare_id=c.daycare_id AND d.status='active' AND d.starts_at<=clock_timestamp() AND d.ends_at>clock_timestamp() AND (d.can_attendance OR d.can_pickup) AND (d.group_id IS NULL OR d.group_id=c.group_id))) ORDER BY c.full_name`:`SELECT * FROM children WHERE ($1::integer IS NULL OR daycare_id=$1) ORDER BY full_name`,(staffOnly && !isAdmin)?[actor.id,daycareId]:[daycareId]);
  const ids=children.map(c=>c.id);
  const userCols = await queryRows(client, "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('phone', 'title', 'qualifications', 'emergency_contact', 'shift')");
  const hasExtraCols = userCols.length > 0;
  const extraColsSql = hasExtraCols ? ', u.phone, u.title, u.qualifications, u.emergency_contact, u.shift' : '';
  const parentPhoneSql = userCols.some(c => c.column_name === 'phone') ? ', u.phone AS parent_phone' : '';
  if(ids.length > 0) {
   const contacts=await queryRows(client,'SELECT * FROM emergency_contacts WHERE child_id=ANY($1::int[]) ORDER BY id',[ids]);
   const instructions=await queryRows(client,'SELECT * FROM care_instructions WHERE child_id=ANY($1::int[]) ORDER BY id',[ids]);
   const links=await queryRows(client,`SELECT gl.child_id, gl.relationship, gl.pickup_authorized, u.id AS parent_id, u.name AS parent_name, u.email AS parent_email${parentPhoneSql} FROM guardian_links gl JOIN users u ON u.id=gl.user_id WHERE gl.child_id=ANY($1::int[])`,[ids]);
   children.forEach(child=>{
     child.emergency_contacts=contacts.filter(r=>r.child_id===child.id);
     child.care_instructions=instructions.filter(r=>r.child_id===child.id);
     child.guardians=links.filter(r=>r.child_id===child.id);
     const primary=child.guardians[0];
     child.parent_name=primary?.parent_name||null;
     child.parent_email=primary?.parent_email||null;
     child.parent_relationship=primary?.relationship||null;
     child.parent_phone=primary?.parent_phone||null;
   });
  }
  const base={children,duties,groups:await queryRows(client,'SELECT g.*, u.name AS lead_caregiver_name FROM groups g LEFT JOIN users u ON u.id = g.lead_caregiver_id WHERE ($1::integer IS NULL OR g.daycare_id=$1) ORDER BY g.name',[daycareId])};
  const attendance=await queryRows(client,`SELECT * FROM attendance WHERE child_id=ANY($1::int[]) AND ${zoneDay} BETWEEN $2::date-($3::int-1) AND $2::date ORDER BY event_time DESC`,[ids,date,days]);
  const guardians=await queryRows(client,'SELECT gl.*,EXISTS(SELECT 1 FROM biometric_references br WHERE br.guardian_link_id=gl.id AND br.active) AS enrolled FROM guardian_links gl WHERE child_id=ANY($1::int[])',[ids]);
  const users=await queryRows(client,(staffOnly && !isAdmin)?`SELECT u.id,u.name,u.email,u.status,r.name AS role${extraColsSql} FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 OR u.id=ANY($2::int[])`:`SELECT u.id,u.name,u.email,u.status,r.name AS role,u.created_at${extraColsSql} FROM users u JOIN roles r ON r.id=u.role_id WHERE ($1::integer IS NULL OR u.daycare_id=$1) ORDER BY u.name`,(staffOnly && !isAdmin)?[actor.id,guardians.map(g=>g.user_id)]:[daycareId]);
  const guardianRequests=await queryRows(client,"SELECT * FROM pickup_guardians WHERE child_id=ANY($1::int[]) ORDER BY created_at DESC",[ids]);
  const verifications=await queryRows(client,"SELECT v.id,v.child_id,v.guardian_user_id,v.pickup_guardian_id,COALESCE(p.name,u.name) AS guardian_name,v.verified_by,v.result,v.method,v.verified_at,v.attendance_id FROM guardian_verification_events v LEFT JOIN pickup_guardians p ON p.id=v.pickup_guardian_id LEFT JOIN users u ON u.id=v.guardian_user_id WHERE v.child_id=ANY($1::int[]) AND (v.verified_at AT TIME ZONE 'Africa/Addis_Ababa')::date BETWEEN $2::date-($3::int-1) AND $2::date",[ids,date,days]);
  const [daycare] = daycareId ? await queryRows(client, 'SELECT id, name, slug, contact_email, contact_phone, address, license_number, status, subscription_plan, trial_ends_at, max_children, version, created_at FROM daycares WHERE id=$1', [daycareId]) : [null];
  async function attachReportDetails(rList) {
    if (!rList || !rList.length) return rList;
    const rIds = rList.map(r => r.id);
    const mRows = await queryRows(client, 'SELECT * FROM report_meals WHERE report_id = ANY($1::int[]) ORDER BY id', [rIds]);
    const aRows = await queryRows(client, 'SELECT * FROM report_activities WHERE report_id = ANY($1::int[]) ORDER BY id', [rIds]);
    rList.forEach(r => {
      r.meals = mRows.filter(m => m.report_id === r.id);
      r.activities = aRows.filter(a => a.report_id === r.id);
    });
    return rList;
  }
  if(staffOnly && !isAdmin){
    const assigned=children.filter(c=>c.caregiver_id===actor.id).map(c=>c.id);
    return {...base,daycare,attendance,guardians,guardianRequests:guardianRequests.filter(g=>g.status==='approved'),users,verifications,
      reports:await attachReportDetails(await queryRows(client,'SELECT * FROM daily_reports WHERE child_id=ANY($1::int[]) ORDER BY report_date DESC LIMIT 100',[assigned])),
      health:await queryRows(client,'SELECT * FROM health_records WHERE child_id=ANY($1::int[]) ORDER BY recorded_at DESC LIMIT 100',[assigned]),
      events:await queryRows(client,'SELECT * FROM events WHERE daycare_id=$1 AND NOT cancelled AND event_date>=CURRENT_DATE ORDER BY event_date',[daycareId]),
      announcements:[],products:[],orders:[],audit:[],
      messages:await queryRows(client,'SELECT * FROM messages WHERE daycare_id=$1 AND (sender_id=$2 OR recipient_id=$2) ORDER BY created_at DESC LIMIT 100',[daycareId,actor.id])};
  }
  return {...base,daycare,attendance,guardians,guardianRequests,users,verifications,
    reports:await attachReportDetails(await queryRows(client,'SELECT * FROM daily_reports WHERE ($3::integer IS NULL OR daycare_id=$3) AND report_date BETWEEN $1::date-($2::int-1) AND $1::date',[date,days,daycareId])),
    health:await queryRows(client,"SELECT * FROM health_records WHERE ($3::integer IS NULL OR daycare_id=$3) AND (recorded_at AT TIME ZONE 'Africa/Addis_Ababa')::date BETWEEN $1::date-($2::int-1) AND $1::date",[date,days,daycareId]),
    events:await queryRows(client,'SELECT * FROM events WHERE ($2::integer IS NULL OR daycare_id=$2) AND event_date >= $1::date-30 ORDER BY event_date',[date,daycareId]),
    announcements:await queryRows(client,'SELECT * FROM announcements WHERE ($1::integer IS NULL OR daycare_id=$1) ORDER BY created_at DESC LIMIT 100',[daycareId]),
    products:await queryRows(client,'SELECT * FROM products WHERE ($1::integer IS NULL OR daycare_id=$1) ORDER BY name',[daycareId]),
    orders:await queryRows(client,"SELECT o.*,p.method AS payment_method,p.gateway_ref AS payment_reference FROM orders o LEFT JOIN payments p ON p.order_id=o.id WHERE o.daycare_id=$3 AND (o.created_at AT TIME ZONE 'Africa/Addis_Ababa')::date BETWEEN $1::date-($2::int-1) AND $1::date ORDER BY o.created_at DESC",[date,days,daycareId]),
    audit:await queryRows(client,'SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.daycare_id=$1 ORDER BY a.created_at DESC LIMIT 200',[daycareId]),
    messages:await queryRows(client,'SELECT m.id,m.subject,m.body,m.sender_id,m.recipient_id,m.read_at,m.created_at FROM messages m WHERE sender_id=$1 OR recipient_id=$1 ORDER BY created_at DESC LIMIT 100',[actor.id])};
 }).then(async data=>staffOnly?{...data,announcements:(await require('../communication/communication.service').listAnnouncements({},user)).data}:data);
}

async function updateSettings(body, user) {
  return transaction(async client => {
    const actor = await activeActor(client, user, true);
    const dcId = actor.daycare_id;
    if (!dcId) throw failure('No daycare associated with your account.', 400);

    if (!Number.isSafeInteger(body.version) || body.version<1) throw failure("Reload center settings before saving.",422);
    const { name, contact_email, contact_phone, address, license_number } = body;
    const [updated] = await queryRows(
      client,
      `UPDATE daycares
       SET name = COALESCE($1, name),
           contact_email = COALESCE($2, contact_email),
           contact_phone = COALESCE($3, contact_phone),
           address = COALESCE($4, address),
           license_number = COALESCE($5, license_number),
           updated_at = NOW()
       WHERE id = $6 AND version = $7
       RETURNING *`,
      [name, contact_email, contact_phone, address, license_number, dcId, body.version]
    );

    if (!updated) throw failure('Center settings changed. Reload before saving.',409);
    await audit(client, actor, 'DAYCARE_SETTINGS_UPDATED', 'daycares', dcId, body, dcId);
    return updated;
  });
}

async function renewPlan(body, user) {
  throw failure('Subscription changes require platform approval. Contact platform support.', 403);
}

module.exports={saveDuty,revokeDuty,recordAttendance,checkout,snapshot,updateSettings,renewPlan};
