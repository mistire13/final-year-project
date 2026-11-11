'use strict';
const Joi=require('joi');
const crypto=require('node:crypto');
const fail=(message,statusCode=422)=>Object.assign(new Error(message),{statusCode});
const valid=(schema,body)=>{const {value,error}=schema.validate(body,{abortEarly:false});if(error)throw fail(error.details.map(d=>d.message).join('. '));return value;};
const time=Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const date=Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value,helpers)=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:helpers.error('any.invalid'));
const id=Joi.number().integer().positive();
const rule=Joi.object({staff_id:id.required(),group_id:id.allow(null).default(null),weekday:Joi.number().integer().min(0).max(6).required(),start_time:time.required(),end_time:time.required(),can_attendance:Joi.boolean().required(),can_pickup:Joi.boolean().required()});
const templateSchema=Joi.object({name:Joi.string().trim().min(2).max(80).required(),rules:Joi.array().items(rule).min(1).max(100).required()});
const rangeSchema=Joi.object({template_id:id.required(),week_start:date.required(),weeks:Joi.number().integer().min(1).max(8).default(1)});
const publishSchema=rangeSchema.keys({preview_token:Joi.string().hex().length(64).required(),request_key:Joi.string().pattern(/^[A-Za-z0-9_-]{16,100}$/).required(),confirmed:Joi.boolean().valid(true).required()});
const availabilitySchema=Joi.object({staff_id:id.required(),weekday:Joi.number().integer().min(0).max(6).required(),available:Joi.boolean().required(),start_time:time.required(),end_time:time.required()});
const leaveSchema=Joi.object({staff_id:id.required(),starts_at:Joi.date().iso().raw().required(),ends_at:Joi.date().iso().raw().required(),reason:Joi.string().trim().min(4).max(1000).required()});
const reviewSchema=Joi.object({version:id.required(),decision:Joi.string().valid('approve','reject').required(),reason:Joi.string().trim().min(4).max(1000).required()});
const substituteSchema=Joi.object({staff_id:id.required(),reason:Joi.string().trim().min(12).max(1000).required(),confirmed:Joi.boolean().valid(true).required()});
const dayPlus=(value,n)=>new Date(Date.parse(value+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const overlaps=(a,b)=>Date.parse(a.starts_at)<Date.parse(b.ends_at)&&Date.parse(a.ends_at)>Date.parse(b.starts_at);
function expandRules(rules,weekStart,weeks){
  if(new Date(weekStart+'T00:00:00Z').getUTCDay()!==1)throw fail('Choose a Monday as the first week date.');
  const shifts=[];
  for(let week=0;week<weeks;week++)for(const r of rules){
    if(!r.can_attendance&&!r.can_pickup)throw fail('Each shift needs at least one duty responsibility.');
    const localDate=dayPlus(weekStart,week*7+(r.weekday+6)%7);
    const starts_at=new Date(`${localDate}T${r.start_time}:00+03:00`).toISOString();
    const ends_at=new Date(`${r.end_time<=r.start_time?dayPlus(localDate,1):localDate}T${r.end_time}:00+03:00`).toISOString();
    if(Date.parse(ends_at)-Date.parse(starts_at)>16*3600000)throw fail('Each shift must be at most 16 hours.');
    shifts.push({staff_id:r.staff_id,group_id:r.group_id||null,starts_at,ends_at,can_attendance:r.can_attendance,can_pickup:r.can_pickup,weekday:r.weekday,local_date:localDate,start_time:r.start_time,end_time:r.end_time});
  }
  return shifts.sort((a,b)=>a.starts_at.localeCompare(b.starts_at)||a.staff_id-b.staff_id);
}
function shiftProblems(shifts,assignments,leaves,availability){
  const problems=[];
  shifts.forEach((shift,index)=>{
    if(shifts.slice(0,index).some(other=>other.staff_id===shift.staff_id&&overlaps(other,shift)))problems.push({staff_id:shift.staff_id,date:shift.local_date,reason:'Template shifts overlap.'});
    if(assignments.some(other=>other.staff_id===shift.staff_id&&other.status==='active'&&overlaps(other,shift)))problems.push({staff_id:shift.staff_id,date:shift.local_date,reason:'An existing duty overlaps.'});
    if(leaves.some(other=>other.staff_id===shift.staff_id&&other.status==='approved'&&overlaps(other,shift)))problems.push({staff_id:shift.staff_id,date:shift.local_date,reason:'Approved leave overlaps.'});
    const own=availability.filter(row=>row.staff_id===shift.staff_id);
    if(own.length&&!own.some(row=>row.available&&row.weekday===shift.weekday&&row.start_time<=shift.start_time&&row.end_time>=shift.end_time&&shift.end_time>shift.start_time))problems.push({staff_id:shift.staff_id,date:shift.local_date,reason:'The shift is outside recorded weekly availability.'});
  });
  return problems;
}
function createStaffScheduling(pool,options={}){
  const requireFeature=options.requireFeature||((...args)=>require('../saas/package-features').requireFeature(...args));
  const now=options.now||(()=>new Date());
  async function transaction(work){const c=await pool.connect();try{await c.query('BEGIN');const value=await work(c);await c.query('COMMIT');return value;}catch(error){await c.query('ROLLBACK');if(error.code==='23505')throw fail('This scheduling request has already been recorded. Refresh before retrying.',409);throw error;}finally{c.release();}}
  async function actor(c,user,admin=false){
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`staff-scheduling-actor:${user.id}`]);
    const a=(await c.query('SELECT u.id,u.daycare_id,u.status,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR SHARE OF u',[user.id])).rows[0];
    if(!a||a.status!=='active'||!a.daycare_id||a.daycare_id!==user.daycare_id||user.is_impersonating||!['admin','caregiver'].includes(a.role)||admin&&a.role!=='admin')throw fail('An authorized daycare staff account is required.',403);
    await requireFeature(c,a.daycare_id,'staff_scheduling');
    // Stable lock ordering for scheduling mutations and package transitions.
    await c.query('SELECT id FROM daycares WHERE id=$1 FOR SHARE',[a.daycare_id]);
    return a;
  }
  async function lockStaff(c,daycareId,staffIds,allowInactive=[]){
    const ids=[...new Set(staffIds)].sort((a,b)=>a-b);
    const rows=(await c.query("SELECT u.id,u.name,u.status,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.daycare_id=$1 AND u.id=ANY($2::int[]) ORDER BY u.id FOR UPDATE OF u",[daycareId,ids])).rows;
    if(rows.length!==ids.length||rows.some(row=>row.role!=='caregiver'||row.status!=='active'&&!allowInactive.includes(row.id)))throw fail('Choose active caregivers from this daycare.');
    return rows;
  }
  async function audit(c,a,action,table,target,details){await c.query('INSERT INTO audit_logs(actor_id,daycare_id,action,target_table,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6)',[a.id,a.daycare_id,action,table,target,JSON.stringify(details)]);}
  async function notify(c,a,staffIds,subject,body){
    for(const staffId of new Set(staffIds)){if(staffId===a.id)continue;await c.query('INSERT INTO messages(sender_id,recipient_id,subject,body,daycare_id) VALUES($1,$2,$3,$4,$5)',[a.id,staffId,subject,body,a.daycare_id]);}
  }
  async function overview(user,body={}){return transaction(async c=>{
    const a=await actor(c,user);const input=valid(Joi.object({from:date.default(today()),to:date.optional()}),body);input.to=input.to||dayPlus(input.from,41);
    if(input.to<input.from||Date.parse(input.to)-Date.parse(input.from)>92*86400000)throw fail('Choose a date range of at most 93 days.');
    const own=a.role==='admin'?null:a.id;
    const staff=(await c.query("SELECT u.id,u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.daycare_id=$1 AND u.status='active' AND r.name='caregiver' AND ($2::int IS NULL OR u.id=$2) ORDER BY u.name",[a.daycare_id,own])).rows;
    const groups=(await c.query('SELECT id,name FROM groups WHERE daycare_id=$1 ORDER BY name',[a.daycare_id])).rows;
    const templates=a.role==='admin'?(await c.query('SELECT * FROM staff_schedule_templates WHERE daycare_id=$1 ORDER BY created_at DESC',[a.daycare_id])).rows:[];
    const rules=a.role==='admin'?(await c.query('SELECT * FROM staff_schedule_rules WHERE daycare_id=$1 ORDER BY template_id,weekday,start_time',[a.daycare_id])).rows:[];
    return {role:a.role,from:input.from,to:input.to,staff,groups,templates:templates.map(t=>({...t,rules:rules.filter(r=>String(r.template_id)===String(t.id))})),
      availability:(await c.query('SELECT * FROM staff_schedule_availability WHERE daycare_id=$1 AND ($2::int IS NULL OR staff_id=$2) ORDER BY staff_id,weekday',[a.daycare_id,own])).rows,
      leave:(await c.query('SELECT * FROM staff_leave_requests WHERE daycare_id=$1 AND ($2::int IS NULL OR staff_id=$2) AND starts_at<($4::date+1)::timestamp AT TIME ZONE \'Africa/Addis_Ababa\' AND ends_at>$3::date::timestamp AT TIME ZONE \'Africa/Addis_Ababa\' ORDER BY starts_at DESC',[a.daycare_id,own,input.from,input.to])).rows,
      assignments:(await c.query("SELECT d.*,u.name AS staff_name,g.name AS group_name FROM front_desk_assignments d JOIN users u ON u.id=d.staff_id AND u.daycare_id=d.daycare_id LEFT JOIN groups g ON g.id=d.group_id AND g.daycare_id=d.daycare_id WHERE d.daycare_id=$1 AND ($2::int IS NULL OR d.staff_id=$2) AND d.starts_at<($4::date+1)::timestamp AT TIME ZONE 'Africa/Addis_Ababa' AND d.ends_at>$3::date::timestamp AT TIME ZONE 'Africa/Addis_Ababa' ORDER BY d.starts_at",[a.daycare_id,own,input.from,input.to])).rows};
  });}
  async function createTemplate(body,user){const input=valid(templateSchema,body);expandRules(input.rules,'2026-01-05',1);return transaction(async c=>{
    const a=await actor(c,user,true);await lockStaff(c,a.daycare_id,input.rules.map(r=>r.staff_id));
    const groups=[...new Set(input.rules.map(r=>r.group_id).filter(Boolean))];
    if(groups.length&&(await c.query('SELECT id FROM groups WHERE daycare_id=$1 AND id=ANY($2::int[])',[a.daycare_id,groups])).rows.length!==groups.length)throw fail('Choose classrooms from this daycare.');
    const template=(await c.query('INSERT INTO staff_schedule_templates(daycare_id,name,created_by) VALUES($1,$2,$3) RETURNING *',[a.daycare_id,input.name,a.id])).rows[0];
    for(const r of input.rules)await c.query('INSERT INTO staff_schedule_rules(daycare_id,template_id,staff_id,group_id,weekday,start_time,end_time,can_attendance,can_pickup) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[a.daycare_id,template.id,r.staff_id,r.group_id,r.weekday,r.start_time,r.end_time,r.can_attendance,r.can_pickup]);
    await audit(c,a,'STAFF_TEMPLATE_CREATED','staff_schedule_templates',template.id,{rules:input.rules.length});return template;
  });}
  async function setTemplateEnabled(templateId,body,user){const input=valid(Joi.object({enabled:Joi.boolean().required(),version:id.required()}),body);return transaction(async c=>{
    const a=await actor(c,user,true);const row=(await c.query('UPDATE staff_schedule_templates SET enabled=$3,version=version+1 WHERE daycare_id=$1 AND id=$2 AND version=$4 RETURNING *',[a.daycare_id,templateId,input.enabled,input.version])).rows[0];
    if(!row)throw fail('Template changed or was not found. Refresh before retrying.',409);await audit(c,a,'STAFF_TEMPLATE_UPDATED','staff_schedule_templates',row.id,{enabled:input.enabled});return row;
  });}
  async function plan(c,a,input){
    const template=(await c.query('SELECT * FROM staff_schedule_templates WHERE daycare_id=$1 AND id=$2 FOR SHARE',[a.daycare_id,input.template_id])).rows[0];
    if(!template||!template.enabled)throw fail('Choose an enabled schedule template.',404);
    const rules=(await c.query('SELECT * FROM staff_schedule_rules WHERE daycare_id=$1 AND template_id=$2 ORDER BY id',[a.daycare_id,template.id])).rows;
    if(!rules.length)throw fail('This template has no shifts.');
    const staff=await lockStaff(c,a.daycare_id,rules.map(r=>r.staff_id));
    const shifts=expandRules(rules,input.week_start,input.weeks);const staffIds=staff.map(s=>s.id);
    const from=shifts[0].starts_at,to=shifts.reduce((max,s)=>s.ends_at>max?s.ends_at:max,shifts[0].ends_at);
    const assignments=(await c.query("SELECT id,staff_id,starts_at,ends_at,status FROM front_desk_assignments WHERE daycare_id=$1 AND staff_id=ANY($2::int[]) AND status='active' AND starts_at<$4 AND ends_at>$3 ORDER BY id",[a.daycare_id,staffIds,from,to])).rows;
    const leaves=(await c.query("SELECT id,staff_id,starts_at,ends_at,status,version FROM staff_leave_requests WHERE daycare_id=$1 AND staff_id=ANY($2::int[]) AND status='approved' AND starts_at<$4 AND ends_at>$3 ORDER BY id",[a.daycare_id,staffIds,from,to])).rows;
    const availability=(await c.query('SELECT * FROM staff_schedule_availability WHERE daycare_id=$1 AND staff_id=ANY($2::int[]) ORDER BY id',[a.daycare_id,staffIds])).rows;
    const conflicts=shiftProblems(shifts,assignments,leaves,availability);
    if(shifts.some(s=>Date.parse(s.starts_at)<now().getTime()))conflicts.push({reason:'A proposed shift starts in the past.'});
    return {template,staff,shifts,conflicts,preview_token:hash({version:template.version,rules,shifts,assignments,leaves,availability})};
  }
  async function preview(body,user){const input=valid(rangeSchema,body);return transaction(async c=>plan(c,await actor(c,user,true),input));}
  async function publish(body,user){const input=valid(publishSchema,body);return transaction(async c=>{
    const a=await actor(c,user,true);const requestHash=hash(input);
    // Serializes template publications; manual duties serialize on caregiver rows.
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`staff-schedule:${a.daycare_id}`]);
    const previous=(await c.query('SELECT * FROM staff_schedule_publications WHERE daycare_id=$1 AND request_key=$2',[a.daycare_id,input.request_key])).rows[0];
    if(previous){if(previous.request_hash!==requestHash)throw fail('This publication key was used for different details.',409);return {publication:previous,replayed:true};}
    const p=await plan(c,a,input);
    const already=(await c.query('SELECT * FROM staff_schedule_publications WHERE daycare_id=$1 AND template_id=$2 AND template_version=$3 AND week_start=$4 AND weeks=$5',[a.daycare_id,p.template.id,p.template.version,input.week_start,input.weeks])).rows[0];
    if(already)return {publication:already,replayed:true};
    if(p.conflicts.length)throw fail('Resolve schedule conflicts before publishing.',409);
    if(p.preview_token!==input.preview_token)throw fail('The schedule changed after preview. Preview and review it again.',409);
    const publication=(await c.query('INSERT INTO staff_schedule_publications(daycare_id,template_id,template_version,week_start,weeks,request_key,request_hash,published_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[a.daycare_id,p.template.id,p.template.version,input.week_start,input.weeks,input.request_key,requestHash,a.id])).rows[0];
    for(const s of p.shifts)await c.query('INSERT INTO front_desk_assignments(daycare_id,staff_id,group_id,starts_at,ends_at,can_attendance,can_pickup,assigned_by,staff_schedule_publication_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[a.daycare_id,s.staff_id,s.group_id,s.starts_at,s.ends_at,s.can_attendance,s.can_pickup,a.id,publication.id]);
    await audit(c,a,'STAFF_SCHEDULE_PUBLISHED','staff_schedule_publications',publication.id,{shift_count:p.shifts.length,week_start:input.week_start,weeks:input.weeks});
    await notify(c,a,p.staff.map(s=>s.id),'Your staff schedule was published',`${p.template.name}: ${input.weeks} week(s) from ${input.week_start}. Open your staff schedule to review your dated duties.`);
    return {publication,shift_count:p.shifts.length,replayed:false};
  });}
  async function saveAvailability(body,user){const input=valid(availabilitySchema,body);if(input.end_time<=input.start_time)throw fail('Availability must finish later on the same day.');return transaction(async c=>{
    const a=await actor(c,user);if(a.role!=='admin'&&input.staff_id!==a.id)throw fail('You can update only your own availability.',403);await lockStaff(c,a.daycare_id,[input.staff_id]);
    const row=(await c.query('INSERT INTO staff_schedule_availability(daycare_id,staff_id,weekday,available,start_time,end_time) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(daycare_id,staff_id,weekday) DO UPDATE SET available=EXCLUDED.available,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,updated_at=NOW() RETURNING *',[a.daycare_id,input.staff_id,input.weekday,input.available,input.start_time,input.end_time])).rows[0];
    await audit(c,a,'STAFF_AVAILABILITY_SAVED','staff_schedule_availability',row.id,{staff_id:input.staff_id,weekday:input.weekday});return row;
  });}
  async function requestLeave(body,user){const input=valid(leaveSchema,body);if(Date.parse(input.ends_at)<=Date.parse(input.starts_at)||Date.parse(input.ends_at)-Date.parse(input.starts_at)>31*86400000||Date.parse(input.ends_at)<=now().getTime())throw fail('Choose future leave of at most 31 days.');return transaction(async c=>{
    const a=await actor(c,user);if(a.role!=='admin'&&input.staff_id!==a.id)throw fail('You can request only your own leave.',403);await lockStaff(c,a.daycare_id,[input.staff_id]);
    const existing=(await c.query("SELECT id FROM staff_leave_requests WHERE daycare_id=$1 AND staff_id=$2 AND status IN ('pending','approved') AND starts_at<$4 AND ends_at>$3",[a.daycare_id,input.staff_id,input.starts_at,input.ends_at])).rows;
    if(existing.length)throw fail('A pending or approved leave request already overlaps.',409);
    const row=(await c.query('INSERT INTO staff_leave_requests(daycare_id,staff_id,requested_by,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[a.daycare_id,input.staff_id,a.id,input.starts_at,input.ends_at,input.reason])).rows[0];
    await audit(c,a,'STAFF_LEAVE_REQUESTED','staff_leave_requests',row.id,{staff_id:input.staff_id});
    const admins=(await c.query('SELECT id FROM users WHERE daycare_id=$1 AND role_id=1 AND status=\'active\'',[a.daycare_id])).rows;
    await notify(c,a,admins.map(row=>row.id),'Staff leave awaiting review',`A staff leave request for ${input.starts_at} to ${input.ends_at} needs review in Staff scheduling.`);return row;
  });}
  async function reviewLeave(leaveId,body,user){const input=valid(reviewSchema,body);return transaction(async c=>{
    const a=await actor(c,user,true);const candidate=(await c.query('SELECT * FROM staff_leave_requests WHERE daycare_id=$1 AND id=$2',[a.daycare_id,leaveId])).rows[0];if(!candidate)throw fail('Leave request not found.',404);
    await lockStaff(c,a.daycare_id,[candidate.staff_id],[candidate.staff_id]);const row=(await c.query('SELECT * FROM staff_leave_requests WHERE daycare_id=$1 AND id=$2 FOR UPDATE',[a.daycare_id,leaveId])).rows[0];
    if(row.version!==input.version||row.status!=='pending')throw fail('Leave request changed. Refresh before reviewing.',409);
    if(input.decision==='approve'){
      const duties=(await c.query("SELECT id FROM front_desk_assignments WHERE daycare_id=$1 AND staff_id=$2 AND status='active' AND starts_at<$4 AND ends_at>$3",[a.daycare_id,row.staff_id,row.starts_at,row.ends_at])).rows;
      if(duties.length)throw fail('Substitute or explicitly resolve overlapping duties before approving leave. Existing care permissions were preserved.',409);
    }
    const saved=(await c.query('UPDATE staff_leave_requests SET status=$3,reviewed_by=$4,review_reason=$5,reviewed_at=NOW(),version=version+1 WHERE daycare_id=$1 AND id=$2 RETURNING *',[a.daycare_id,row.id,input.decision==='approve'?'approved':'rejected',a.id,input.reason])).rows[0];
    await audit(c,a,'STAFF_LEAVE_REVIEWED','staff_leave_requests',saved.id,{decision:input.decision,reason:input.reason});await notify(c,a,[row.staff_id],'Your leave request was reviewed',`Your leave request is ${saved.status}. ${input.reason}`);return saved;
  });}
  async function substitute(assignmentId,body,user){const input=valid(substituteSchema,body);return transaction(async c=>{
    const a=await actor(c,user,true);const candidate=(await c.query('SELECT * FROM front_desk_assignments WHERE daycare_id=$1 AND id=$2',[a.daycare_id,assignmentId])).rows[0];if(!candidate)throw fail('Duty not found.',404);
    if(candidate.staff_id===input.staff_id)throw fail('Choose a different caregiver.');await lockStaff(c,a.daycare_id,[candidate.staff_id,input.staff_id],[candidate.staff_id]);
    const old=(await c.query('SELECT * FROM front_desk_assignments WHERE daycare_id=$1 AND id=$2 FOR UPDATE',[a.daycare_id,assignmentId])).rows[0];if(old.status!=='active'||Date.parse(old.ends_at)<=now().getTime())throw fail('Only an active, unfinished duty can be substituted.',409);
    const starts_at=new Date(Math.max(Date.parse(old.starts_at),now().getTime())).toISOString(),ends_at=new Date(old.ends_at).toISOString();
    const localDate=new Date(Date.parse(starts_at)+3*3600000).toISOString().slice(0,10),start_time=new Date(Date.parse(starts_at)+3*3600000).toISOString().slice(11,16),end_time=new Date(Date.parse(ends_at)+3*3600000).toISOString().slice(11,16);
    const shift={staff_id:input.staff_id,starts_at,ends_at,local_date:localDate,weekday:new Date(localDate+'T00:00:00Z').getUTCDay(),start_time,end_time};
    const assignments=(await c.query("SELECT * FROM front_desk_assignments WHERE daycare_id=$1 AND staff_id=$2 AND status='active' AND starts_at<$4 AND ends_at>$3",[a.daycare_id,input.staff_id,starts_at,ends_at])).rows;
    const leaves=(await c.query("SELECT * FROM staff_leave_requests WHERE daycare_id=$1 AND staff_id=$2 AND status='approved' AND starts_at<$4 AND ends_at>$3",[a.daycare_id,input.staff_id,starts_at,ends_at])).rows;
    const availability=(await c.query('SELECT * FROM staff_schedule_availability WHERE daycare_id=$1 AND staff_id=$2',[a.daycare_id,input.staff_id])).rows;
    if(shiftProblems([shift],assignments,leaves,availability).length)throw fail('The substitute is unavailable or has an overlapping duty or approved leave.',409);
    const replacement=(await c.query('INSERT INTO front_desk_assignments(daycare_id,staff_id,group_id,starts_at,ends_at,can_attendance,can_pickup,assigned_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[a.daycare_id,input.staff_id,old.group_id,starts_at,ends_at,old.can_attendance,old.can_pickup,a.id])).rows[0];
    await c.query("UPDATE front_desk_assignments SET status='revoked',revoked_at=NOW() WHERE daycare_id=$1 AND id=$2",[a.daycare_id,old.id]);
    await audit(c,a,'STAFF_DUTY_SUBSTITUTED','front_desk_assignments',old.id,{replacement_id:replacement.id,previous_staff_id:old.staff_id,staff_id:input.staff_id,reason:input.reason});
    await notify(c,a,[old.staff_id,input.staff_id],'A staff duty was reassigned',`Duty ${old.id} has been reassigned for ${starts_at} to ${ends_at}. Check your current duties before attendance or pickup.`);return {previous_id:old.id,replacement};
  });}
  return {overview,createTemplate,setTemplateEnabled,preview,publish,saveAvailability,requestLeave,reviewLeave,substitute};
}
module.exports={createStaffScheduling,expandRules,shiftProblems,overlaps};
