import React from 'react';
import type {Dataset} from './model';
import './journey.css';
export default function SetupChecklist({data}:{data:Dataset}){
 const active=data.children.filter(c=>c.enrollment_status==='active');
 const steps=[
  {title:'Confirm your center details',hint:'Add the contact phone and address families will use.',done:!!(data.daycare?.contact_phone&&data.daycare?.address),path:'settings'},
  {title:'Create your classrooms',hint:'Organize children into the groups your team manages.',done:data.groups.length>0,path:'groups'},
  {title:'Add your caregivers',hint:'Create named staff accounts for attributable care records.',done:data.users.some(u=>u.role==='caregiver'&&u.status==='active'),path:'caregivers'},
  {title:'Enroll children and link their families',hint:'Each active child needs a registered parent or guardian link.',done:active.length>0&&active.every(c=>data.guardians.some(g=>g.child_id===c.id)),path:'children'},
  {title:'Assign children to classrooms and caregivers',hint:'Assignments determine which children staff can care for.',done:active.length>0&&active.every(c=>c.group_id&&c.caregiver_id),path:'children'},
  {title:'Schedule attendance and pickup duty',hint:'Create a current shift with both permissions before recording arrivals.',done:data.duties.some(d=>d.active!==false&&d.can_attendance&&d.can_pickup&&new Date(d.starts_at).getTime()<=Date.now()&&new Date(d.ends_at).getTime()>Date.now()),path:'front-desk'},
 ];
 const count=steps.filter(s=>s.done).length;
 return <section className="journey j-panel"><span className="j-tag">YOUR CENTER SETUP · {count} OF {steps.length}</span><h2>{count===steps.length?'Your center is set up for today.':'Prepare your center for its first day.'}</h2><p>Progress comes from saved records. You can leave and return without losing completed setup.</p><progress aria-label="Daycare setup progress" value={count} max={steps.length} style={{width:'100%',accentColor:'#417b61'}}/><ol className="j-checklist">{steps.map(s=><li key={s.path+s.title}><a href={'/admin/'+s.path}><span><strong>{s.title}</strong><small>{s.hint}</small></span><span>{s.done?'Complete ✓':'Continue →'}</span></a></li>)}</ol><a href="/admin/attendance">Open today’s attendance and pickups →</a><p className="j-muted">This checklist confirms setup records, not complete MVP acceptance. Review child care instructions and verify every authorized adult before pickup.</p></section>;
}
