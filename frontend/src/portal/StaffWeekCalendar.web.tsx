import React from 'react';
import { Badge, Button } from './ui.web';
import './plus-staff-calendar.css';

export const shiftCalendarDay=(day:string,count:number)=>new Date(Date.parse(day+'T00:00:00Z')+count*86400000).toISOString().slice(0,10);
export const mondayOf=(day:string)=>shiftCalendarDay(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7));
const dateLabel=(day:string)=>new Date(day+'T00:00:00+03:00').toLocaleDateString('en-GB',{timeZone:'Africa/Addis_Ababa',weekday:'long',day:'numeric',month:'short'});
const timeLabel=(value:string)=>new Date(value).toLocaleTimeString('en-GB',{timeZone:'Africa/Addis_Ababa',hour:'2-digit',minute:'2-digit'});
export function dutiesOnDay(assignments:any[],day:string){
  const start=Date.parse(day+'T00:00:00+03:00'),end=start+86400000;
  return assignments.filter(row=>Date.parse(row.starts_at)<end&&Date.parse(row.ends_at)>start)
    .sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||Number(a.id)-Number(b.id));
}

export default function StaffWeekCalendar({from,assignments,busy,loading=false,onWeekChange}:{from:string;assignments:any[];busy:boolean;loading?:boolean;onWeekChange:(monday:string)=>void}){
  const monday=mondayOf(from),days=Array.from({length:7},(_,i)=>shiftCalendarDay(monday,i));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return <section className="plus-staff-calendar" aria-labelledby="staff-calendar-title">
    <div className="plus-calendar-toolbar">
      <h3 id="staff-calendar-title" aria-live="polite">Week of {dateLabel(monday)}</h3>
      <div className="plus-calendar-controls" aria-label="Calendar navigation">
        <Button variant="secondary" disabled={busy} onClick={()=>onWeekChange(shiftCalendarDay(monday,-7))}>Previous week</Button>
        <Button variant="secondary" disabled={busy} onClick={()=>onWeekChange(mondayOf(today))}>This week</Button>
        <Button variant="secondary" disabled={busy} onClick={()=>onWeekChange(shiftCalendarDay(monday,7))}>Next week</Button>
      </div>
      <label>Go to week containing<input type="date" value={from} disabled={busy} onChange={event=>{if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))onWeekChange(mondayOf(event.target.value));}}/></label>
    </div>
    <p>Monday–Sunday · Addis Ababa time. Open a duty to see the child groups it covers and its attendance/pickup responsibilities.</p>
    {loading?<p role="status">Loading duties for this week…</p>:<div className="plus-calendar-week">
      {days.map(day=>{const duties=dutiesOnDay(assignments,day);return <section className={`plus-calendar-day ${day===today?'is-today':''}`} key={day} aria-label={dateLabel(day)}>
        <h4><time dateTime={day}>{dateLabel(day)}</time>{day===today&&<span>Today</span>}</h4>
        {duties.length?duties.map(row=><details className="plus-calendar-duty" key={row.id}>
          <summary><strong>{row.staff_name}</strong><span>{Date.parse(row.starts_at)<Date.parse(day+'T00:00:00+03:00')?'Continues':timeLabel(row.starts_at)} – {Date.parse(row.ends_at)>Date.parse(shiftCalendarDay(day,1)+'T00:00:00+03:00')?'continues':timeLabel(row.ends_at)}</span><Badge value={row.status}/></summary>
          <p>Coverage: {row.group_name||'All classrooms — front desk'}</p><p>{[row.can_attendance?'Attendance':'',row.can_pickup?'Authorized pickup':''].filter(Boolean).join(' · ')||'No operational responsibilities'}</p>
          <p>Starts {new Date(row.starts_at).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa'})}<br/>Ends {new Date(row.ends_at).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa'})}</p>
        </details>):<p className="plus-calendar-empty">No duties</p>}
      </section>;})}
    </div>}
  </section>;
}
