const {test}=require('node:test');const assert=require('node:assert/strict');
const {makePreview,metrics,attendanceStatus,dutyError,allowedDuty,exportCsv}=require('../src/portal/model.ts');
test('attendance totals are mutually exclusive and collected children are not present',()=>{const d=makePreview('2026-10-03');const m=metrics(d,'2026-10-03');assert.equal(m.present+m.absent+m.collected+m.pending,m.total);const checkedOut=m.rows.find(r=>r.status?.event_type==='checkout');assert.ok(checkedOut);assert.equal(attendanceStatus(d,checkedOut.child.id,'2026-10-03').event_type,'checkout');});
test('latest attendance uses absolute time across timestamp offsets',()=>{const d=makePreview('2026-10-03');d.attendance=[{id:1,child_id:1,event_type:'checkin',event_time:'2026-10-03T09:00:00+03:00'},{id:2,child_id:1,event_type:'checkout',event_time:'2026-10-03T07:00:00Z'}];assert.equal(attendanceStatus(d,1,'2026-10-03').event_type,'checkout');});
test('desk duty honors time, revocation, group and capabilities',()=>{const duty={id:1,staff_id:2,group_id:3,status:'active',starts_at:'2026-10-03T07:00:00+03:00',ends_at:'2026-10-03T12:00:00+03:00',can_attendance:true,can_pickup:false};const now=new Date('2026-10-03T08:00:00+03:00');assert.equal(allowedDuty([duty],2,3,'attendance',now),true);assert.equal(allowedDuty([duty],2,2,'attendance',now),false);assert.equal(allowedDuty([duty],2,3,'pickup',now),false);assert.equal(allowedDuty([{...duty,status:'revoked'}],2,3,'attendance',now),false);assert.equal(allowedDuty([duty],2,3,'attendance',new Date(duty.ends_at)),false);assert.ok(dutyError({id:2,role:'caregiver',status:'active'},duty.starts_at,duty.ends_at,[duty]));});
test('CSV escapes quotes and prevents spreadsheet formula execution',()=>{const csv=exportCsv(['Name'],[['=HYPERLINK("evil")'],['A,B']]);assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));assert.ok(csv.includes('"A,B"'));});

test('assigned caregiver can check in without a desk shift; pickup remains separate', () => {
 const {allowedAttendance}=require('../src/portal/model.ts');
 const actor={id:2,role:'caregiver',status:'active',daycare_id:1};
 const child={id:1,caregiver_id:2,group_id:3,daycare_id:1};
 assert.equal(allowedAttendance([],actor,child),true);
 assert.equal(allowedDuty([],actor.id,child.group_id,'pickup'),false);
 assert.equal(allowedAttendance([],actor,{...child,caregiver_id:4}),false);
 assert.equal(allowedAttendance([],actor,{...child,daycare_id:2}),false);
 assert.equal(allowedAttendance([],{...actor,status:'inactive'},child),false);
});
