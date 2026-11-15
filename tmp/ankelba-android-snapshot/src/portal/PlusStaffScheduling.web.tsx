import React, {useEffect, useRef, useState} from 'react';
import {portalClient, apiError} from './api';
import {Badge, Button, Card} from './ui.web';
import './journey.css';
import StaffWeekCalendar, {mondayOf} from './StaffWeekCalendar.web';

type Staff={id:number;name:string};
type Rule={staff_id:number;group_id:number|null;weekday:number;start_time:string;end_time:string;can_attendance:boolean;can_pickup:boolean};
type ScheduleData={role:'admin'|'caregiver';staff:Staff[];groups:{id:number;name:string}[];templates:any[];assignments:any[];leave:any[];availability:any[]};
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const plusDays=(day:string,count:number)=>new Date(Date.parse(day+'T00:00:00Z')+count*86400000).toISOString().slice(0,10);
const nextMonday=()=>{const day=localDay(),weekday=new Date(day+'T00:00:00Z').getUTCDay();return plusDays(day,(8-weekday)%7||7);};
const stamp=(value:string)=>new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa',dateStyle:'medium',timeStyle:'short'});
const key=()=>`schedule_${globalThis.crypto?.randomUUID?.().replaceAll('-','')||`${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

export default function PlusStaffScheduling(){
  const [data,setData]=useState<ScheduleData|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[working,setBusy]=useState(false);
  const [from,setFrom]=useState(()=>mondayOf(localDay())),[to,setTo]=useState(()=>plusDays(mondayOf(localDay()),6));
  const [templateName,setTemplateName]=useState(''),[rules,setRules]=useState<Rule[]>([]);
  const [draft,setDraft]=useState<Rule>({staff_id:0,group_id:null,weekday:1,start_time:'09:00',end_time:'17:00',can_attendance:true,can_pickup:false});
  const [template,setTemplate]=useState(''),[weekStart,setWeekStart]=useState(nextMonday),[weeks,setWeeks]=useState(1),[preview,setPreview]=useState<any>(null),[reviewed,setReviewed]=useState(false);
  const [availability,setAvailability]=useState({staff_id:0,weekday:1,available:true,start_time:'08:00',end_time:'18:00'});
  const [leave,setLeave]=useState({staff_id:0,starts_at:'',ends_at:'',reason:''}),[reviewReasons,setReviewReasons]=useState<Record<string,string>>({});
  const [substitute,setSubstitute]=useState({assignment_id:'',staff_id:0,reason:'',confirmed:false});
  const inFlight=useRef(false),publicationKey=useRef('');
  const busy=working||loading;
  const load=async()=>{const result=(await portalClient.get('/staff-scheduling',{params:{from,to}})).data;setData(result);
    const first=result.staff[0]?.id||0;setDraft(previous=>({...previous,staff_id:previous.staff_id||first}));setAvailability(previous=>({...previous,staff_id:previous.staff_id||first}));setLeave(previous=>({...previous,staff_id:previous.staff_id||first}));};
  useEffect(()=>{let live=true;setLoading(true);setError('');portalClient.get('/staff-scheduling',{params:{from,to}}).then(response=>{if(live){setData(response.data);const first=response.data.staff[0]?.id||0;setDraft(previous=>({...previous,staff_id:previous.staff_id||first}));setAvailability(previous=>({...previous,staff_id:previous.staff_id||first}));setLeave(previous=>({...previous,staff_id:previous.staff_id||first}));}}).catch(reason=>{if(live){setData(null);setError(apiError(reason));}}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[from,to]);
  const perform=async(work:()=>Promise<unknown>,message:string)=>{if(inFlight.current||loading)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await work();await load();setNotice(message);}catch(reason){setError(apiError(reason));}finally{inFlight.current=false;setBusy(false);}};
  const clearPreview=()=>{setPreview(null);setReviewed(false);publicationKey.current='';};
  const previewSchedule=()=>perform(async()=>{const value=(await portalClient.post('/staff-scheduling/preview',{template_id:Number(template),week_start:weekStart,weeks})).data;setPreview(value);setReviewed(false);publicationKey.current=key();},'Preview ready. Review every proposed duty and resolve any conflicts before publishing.');
  const publishSchedule=()=>perform(async()=>{if(!preview||!reviewed)return;await portalClient.post('/staff-scheduling/publish',{template_id:Number(template),week_start:weekStart,weeks,preview_token:preview.preview_token,request_key:publicationKey.current,confirmed:true});clearPreview();},'Schedule published. Caregivers received an in-app schedule message.');
  const staffName=(id:number)=>data?.staff.find(row=>row.id===id)?.name||`Staff #${id}`;
  if(loading&&!data)return <Card title="Front-desk shifts"><p role="status">Loading front-desk shifts…</p></Card>;
  if(!data)return <Card title="Front-desk shifts"><p role="alert" className="j-error">{error||'Recurring front-desk shifts require an active Plus subscription.'}</p><Button disabled={busy} onClick={()=>void perform(load,'Schedules loaded.')}>Retry</Button></Card>;
  const admin=data.role==='admin';
  const staffSelect=(value:number,change:(id:number)=>void)=><select required value={value||''} onChange={event=>change(Number(event.target.value))}><option value="">Choose caregiver</option>{data.staff.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select>;
  return <div className="journey">
    <Card title={admin?'Front-desk attendance and pickup shifts':'Your attendance and pickup shifts'}><p>Plan rotating check-in and pickup coverage. Caregivers keep their regular classroom assignments; these shifts add only the selected front-desk responsibilities during the published times. All times use Addis Ababa time.</p>
      {error&&<p role="alert" className="j-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <StaffWeekCalendar from={from} assignments={data.assignments} busy={busy||loading} loading={loading} onWeekChange={monday=>{setFrom(monday);setTo(plusDays(monday,6));}}/>
    </Card>

    {admin&&<Card title="Weekly front-desk templates"><p>Save a repeating attendance/pickup coverage pattern, then preview the dated duties. A template alone grants no attendance or pickup permissions.</p>
      <form className="j-form" onSubmit={event=>{event.preventDefault();void perform(async()=>{await portalClient.post('/staff-scheduling/templates',{name:templateName,rules});setTemplateName('');setRules([]);clearPreview();},'Weekly template saved. Preview it before publication.');}}>
        <fieldset disabled={busy}><legend>New front-desk coverage template</legend><label>Template name<input required minLength={2} maxLength={80} value={templateName} onChange={event=>setTemplateName(event.target.value)}/></label>
          <label>Caregiver{staffSelect(draft.staff_id,value=>setDraft(previous=>({...previous,staff_id:value})))}</label>
          <label>Children covered by this duty<select value={draft.group_id||''} onChange={event=>setDraft(previous=>({...previous,group_id:event.target.value?Number(event.target.value):null}))}><option value="">All classrooms — front desk</option>{data.groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label>Day<select value={draft.weekday} onChange={event=>setDraft(previous=>({...previous,weekday:Number(event.target.value)}))}>{weekdays.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label>
          <label>Start<input type="time" required value={draft.start_time} onChange={event=>setDraft(previous=>({...previous,start_time:event.target.value}))}/></label><label>End<input type="time" required value={draft.end_time} onChange={event=>setDraft(previous=>({...previous,end_time:event.target.value}))}/></label>
          <label><input type="checkbox" checked={draft.can_attendance} onChange={event=>setDraft(previous=>({...previous,can_attendance:event.target.checked}))}/> Attendance / check-in responsibility</label><label><input type="checkbox" checked={draft.can_pickup} onChange={event=>setDraft(previous=>({...previous,can_pickup:event.target.checked}))}/> Authorized pickup responsibility</label>
          <Button type="button" variant="secondary" disabled={busy||!draft.staff_id||(!draft.can_attendance&&!draft.can_pickup)||rules.length>=100} onClick={()=>setRules(previous=>[...previous,{...draft}])}>Add shift to template</Button>
          <ol>{rules.map((row,index)=><li key={index}>{staffName(row.staff_id)} · {weekdays[row.weekday]} {row.start_time}–{row.end_time} <Button type="button" variant="ghost" disabled={busy} onClick={()=>setRules(previous=>previous.filter((_,i)=>i!==index))}>Remove shift {index+1}</Button></li>)}</ol>
        </fieldset><Button type="submit" disabled={busy||!rules.length}>Save weekly template</Button>
      </form>
      <ul>{data.templates.map(row=><li key={row.id}><strong>{row.name}</strong> · {row.rules.length} weekly shifts · {row.enabled?'Enabled':'Archived'} <Button variant="ghost" disabled={busy} onClick={()=>void perform(async()=>{await portalClient.patch(`/staff-scheduling/templates/${row.id}`,{version:row.version,enabled:!row.enabled});clearPreview();},'Template availability updated.')}>{row.enabled?'Archive template':'Enable template'}</Button></li>)}</ul>
    </Card>}

    {admin&&<Card title="Review and publish front-desk shifts"><form className="j-form" onSubmit={event=>{event.preventDefault();void previewSchedule();}}><fieldset disabled={busy}><legend>Generate dated duties</legend>
      <label>Template<select required value={template} onChange={event=>{setTemplate(event.target.value);clearPreview();}}><option value="">Choose template</option>{data.templates.filter(row=>row.enabled).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>First Monday<input type="date" required value={weekStart} onChange={event=>{setWeekStart(event.target.value);clearPreview();}}/></label><label>Weeks<input type="number" required min={1} max={8} value={weeks} onChange={event=>{setWeeks(Number(event.target.value));clearPreview();}}/></label>
    </fieldset><Button type="submit" disabled={busy||!template}>Preview schedule</Button></form>
      {preview&&<section><h3>{preview.shifts.length} proposed duties</h3><ul>{preview.shifts.map((row:any,index:number)=><li key={index}>{staffName(row.staff_id)} · {stamp(row.starts_at)} to {stamp(row.ends_at)} · {[row.can_attendance?'Attendance':'',row.can_pickup?'Pickup':''].filter(Boolean).join(' / ')}</li>)}</ul>
        {preview.conflicts.length>0?<div role="alert"><h3>Resolve these conflicts</h3><ul>{preview.conflicts.map((row:any,index:number)=><li key={index}>{row.staff_id?staffName(row.staff_id)+' · ':''}{row.date||''} {row.reason}</li>)}</ul></div>:<p>No conflicts were found in this preview.</p>}
        <label><input type="checkbox" checked={reviewed} disabled={busy||!!preview.conflicts.length} onChange={event=>setReviewed(event.target.checked)}/> I reviewed the dated shifts, covered child groups and attendance/pickup responsibilities.</label><Button disabled={busy||!reviewed||!!preview.conflicts.length} onClick={()=>void publishSchedule()}>Publish reviewed schedule</Button>
      </section>}
    </Card>}

    <Card title="Weekly availability"><p>Availability is checked before new schedules or substitutions. Once availability is recorded, only listed available days/times can be used. Existing duties remain unchanged until an administrator reviews them.</p>
      <form className="j-form" onSubmit={event=>{event.preventDefault();void perform(async()=>{await portalClient.put('/staff-scheduling/availability',availability);clearPreview();},'Availability saved for future schedule checks.');}}><fieldset disabled={busy}><legend>Availability</legend>
        <label>Caregiver{staffSelect(availability.staff_id,value=>setAvailability(previous=>({...previous,staff_id:value})))}</label><label>Day<select value={availability.weekday} onChange={event=>setAvailability(previous=>({...previous,weekday:Number(event.target.value)}))}>{weekdays.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label>
        <label><input type="checkbox" checked={availability.available} onChange={event=>setAvailability(previous=>({...previous,available:event.target.checked}))}/> Available on this day</label><label>Available from<input type="time" required value={availability.start_time} onChange={event=>setAvailability(previous=>({...previous,start_time:event.target.value}))}/></label><label>Available until<input type="time" required value={availability.end_time} onChange={event=>setAvailability(previous=>({...previous,end_time:event.target.value}))}/></label>
      </fieldset><Button type="submit" disabled={busy||!availability.staff_id}>Save availability</Button></form>
      <ul>{data.availability.map(row=><li key={row.id}>{staffName(row.staff_id)} · {weekdays[row.weekday]} · {row.available?`${row.start_time}–${row.end_time}`:'Unavailable'}</li>)}</ul>
    </Card>

    <Card title="Leave requests"><form className="j-form" onSubmit={event=>{event.preventDefault();void perform(async()=>{await portalClient.post('/staff-scheduling/leave',{...leave,starts_at:leave.starts_at+':00+03:00',ends_at:leave.ends_at+':00+03:00'});setLeave(previous=>({...previous,starts_at:'',ends_at:'',reason:''}));clearPreview();},'Leave request submitted for administrator review.');}}><fieldset disabled={busy}><legend>Request leave</legend>
      <label>Caregiver{staffSelect(leave.staff_id,value=>setLeave(previous=>({...previous,staff_id:value})))}</label><label>Start · Addis Ababa<input type="datetime-local" required value={leave.starts_at} onChange={event=>setLeave(previous=>({...previous,starts_at:event.target.value}))}/></label><label>End · Addis Ababa<input type="datetime-local" required value={leave.ends_at} onChange={event=>setLeave(previous=>({...previous,ends_at:event.target.value}))}/></label><label>Reason<textarea required minLength={4} maxLength={1000} value={leave.reason} onChange={event=>setLeave(previous=>({...previous,reason:event.target.value}))}/></label>
    </fieldset><Button type="submit" disabled={busy||!leave.staff_id}>Request leave</Button></form>
      {data.leave.map(row=><section className="j-panel" key={row.id}><h3>{staffName(row.staff_id)}</h3><p>{stamp(row.starts_at)} to {stamp(row.ends_at)}</p><p>{row.reason}</p><Badge value={row.status}/>{row.review_reason&&<p>Review: {row.review_reason}</p>}
        {admin&&row.status==='pending'&&<div><label>Review note<textarea minLength={4} maxLength={1000} disabled={busy} value={reviewReasons[row.id]||''} onChange={event=>setReviewReasons(previous=>({...previous,[row.id]:event.target.value}))}/></label><p>Resolve overlapping duties with a substitute before approving leave.</p>{(['approve','reject'] as const).map(decision=><Button key={decision} variant={decision==='approve'?'primary':'secondary'} disabled={busy||(reviewReasons[row.id]||'').trim().length<4} onClick={()=>void perform(async()=>{await portalClient.post(`/staff-scheduling/leave/${row.id}/review`,{version:row.version,decision,reason:reviewReasons[row.id]});clearPreview();},'Leave review recorded.')}>{decision==='approve'?'Approve leave':'Reject leave'}</Button>)}</div>}
      </section>)}{!data.leave.length&&<p>No leave requests overlap this date range.</p>}
    </Card>

    {admin&&<Card title="Arrange a front-desk substitute"><p>The replacement keeps the original child-group coverage and duty responsibilities. The old duty is revoked only when the replacement is saved in the same transaction.</p><form className="j-form" onSubmit={event=>{event.preventDefault();void perform(async()=>{await portalClient.post(`/staff-scheduling/assignments/${substitute.assignment_id}/substitute`,{staff_id:substitute.staff_id,reason:substitute.reason,confirmed:substitute.confirmed});setSubstitute({assignment_id:'',staff_id:0,reason:'',confirmed:false});clearPreview();},'Substitute assigned and both caregivers notified in-app.');}}><fieldset disabled={busy}><legend>Duty handover</legend>
      <label>Existing duty<select required value={substitute.assignment_id} onChange={event=>setSubstitute(previous=>({...previous,assignment_id:event.target.value}))}><option value="">Choose an active duty</option>{data.assignments.filter(row=>row.status==='active'&&Date.parse(row.ends_at)>Date.now()).map(row=><option key={row.id} value={row.id}>{row.staff_name} · {stamp(row.starts_at)}–{stamp(row.ends_at)}</option>)}</select></label><label>Replacement caregiver{staffSelect(substitute.staff_id,value=>setSubstitute(previous=>({...previous,staff_id:value})))}</label><label>Reason<textarea required minLength={12} maxLength={1000} value={substitute.reason} onChange={event=>setSubstitute(previous=>({...previous,reason:event.target.value}))}/></label><label><input type="checkbox" required checked={substitute.confirmed} onChange={event=>setSubstitute(previous=>({...previous,confirmed:event.target.checked}))}/> I reviewed the handover and the replacement caregiver’s responsibilities.</label>
    </fieldset><Button type="submit" disabled={busy||!substitute.assignment_id||!substitute.staff_id||!substitute.confirmed}>Confirm substitute</Button></form></Card>}
  </div>;
}
