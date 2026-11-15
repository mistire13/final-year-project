import React, { useEffect, useState } from 'react';
import { portalClient, apiError } from './api';
import { Badge, Button, Card, Table } from './ui.web';
import './plus-analytics.css';

type Money=string;
type AttendanceBucket={from:string;to:string;present:number;absent:number;recorded_child_days:number;present_percent:number|null};
type Attendance={present:number;absent:number;recorded_child_days:number;present_percent:number|null;daily:{date:string;present:number;absent:number}[];grouped?:AttendanceBucket[];classrooms:{group_id:number|null;classroom:string;present:number;absent:number}[]};
type Period={from:string;to:string;attendance:Attendance;care_fees:{invoice_count:number;billed:Money;collected:Money;outstanding_now:Money;overdue_now:Money};shop:{enabled:boolean;orders_placed:number;paid_orders_placed?:number;unpaid_orders?:number;placed_total:Money;paid_orders:number;collected:Money;gross_collected?:Money;refunds?:Money}};
export type PlusAnalyticsReport={generated_at:string;timezone:string;daycare:{id:number;name:string};filters:{from:string;to:string;group_id:number|null;attendance_grouping?:string};groups:{id:number;name:string}[];current:Period;previous:Period;
  comparisons:{care_collected:{difference:Money;percent:number|null};care_billed:{difference:Money;percent:number|null};shop_collected:{difference:Money;percent:number|null};attendance:{difference:number;percent:number|null}};
  occupancy:{current_active_children:number;current_capacity:number|null;current_utilization_percent:number|null;coverage_started_at:string|null;observations:{observed_at:string;active_children:number;capacity:number|null;reason:string}[];truncated:boolean};
  best_sellers:{product_id:number;name:string;units:number;collected:Money}[];low_stock:{id:number;name:string;stock_qty:number}[];
  stock_movements?:{id:number;product_name:string;before_qty:number;after_qty:number;quantity_change:number;reason:string;recorded_at:string}[];stock_movements_truncated?:boolean;notes:string[]};

const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const shiftDay=(day:string,days:number)=>new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function reportPreset(code:string,today=localDay()){
  if(code==='today')return {from:today,to:today};
  if(code==='week')return {from:shiftDay(today,-((new Date(today+'T00:00:00Z').getUTCDay()+6)%7)),to:today};
  if(code==='last_week'){const monday=shiftDay(today,-((new Date(today+'T00:00:00Z').getUTCDay()+6)%7));return {from:shiftDay(monday,-7),to:shiftDay(monday,-1)};}
  if(code==='last_month'){const to=shiftDay(today.slice(0,8)+'01',-1);return {from:to.slice(0,8)+'01',to};}
  return {from:today.slice(0,8)+'01',to:today};
}
const attendanceRows=(attendance:Attendance)=>attendance.grouped??attendance.daily.map(row=>({...row,from:row.date,to:row.date,recorded_child_days:row.present+row.absent,present_percent:row.present+row.absent?Math.round(row.present*10000/(row.present+row.absent))/100:null}));
export function reportMoney(value:string){const text=String(value);if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))return '—';const [whole,fraction='']=text.replace(/^-/,'').split('.');return `${text.startsWith('-')?'-':''}${BigInt(whole).toLocaleString('en-ET')}.${fraction.padEnd(2,'0')} ETB`;}
const timestamp=(value:string|null)=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa',dateStyle:'medium',timeStyle:'short'}):'Not recorded';
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function printableAnalytics(report:PlusAnalyticsReport){
  const table=(head:string[],rows:unknown[][])=>`<table><thead><tr>${head.map(value=>`<th>${escapeHtml(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const current=report.current,previous=report.previous;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ankelba management report</title><style>body{font:14px Quicksand,Arial,sans-serif;color:#0f2438;margin:32px;line-height:1.5}h1{font-size:26px}h2{font-size:19px;margin-top:28px}table{border-collapse:collapse;width:100%;margin:12px 0 24px}th,td{border:1px solid #eae6dc;padding:8px;text-align:left}th{background:#fbf9f4}small{color:#64748b}@page{size:A4;margin:16mm}@media print{body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>
    <h1>${escapeHtml(report.daycare.name)} — management report</h1><p>${escapeHtml(report.filters.from)} to ${escapeHtml(report.filters.to)} · Addis Ababa</p><small>Generated ${escapeHtml(timestamp(report.generated_at))}. Previous period: ${escapeHtml(previous.from)} to ${escapeHtml(previous.to)}.</small>
    <h2>Fees and shop collections</h2>${table(['Measure','Selected period','Previous equal-length period'],[['Fees billed',reportMoney(current.care_fees.billed),reportMoney(previous.care_fees.billed)],['Fees collected',reportMoney(current.care_fees.collected),reportMoney(previous.care_fees.collected)],['Outstanding now, invoice cohort',reportMoney(current.care_fees.outstanding_now),reportMoney(previous.care_fees.outstanding_now)],['Overdue now, invoice cohort',reportMoney(current.care_fees.overdue_now),reportMoney(previous.care_fees.overdue_now)],['Shop gross collections',reportMoney(current.shop.gross_collected??current.shop.collected),reportMoney(previous.shop.gross_collected??previous.shop.collected)],['Recorded cash returns (no app transfer)',reportMoney(current.shop.refunds??'0.00'),reportMoney(previous.shop.refunds??'0.00')],['Shop net collections',reportMoney(current.shop.collected),reportMoney(previous.shop.collected)]])}
    <h2>Recorded attendance · ${escapeHtml(report.filters.attendance_grouping??'day')}</h2>${table(['Period','From','Through','Present child-days','Absent child-days','Recorded child-days','Present percent'],[...attendanceRows(current.attendance).map(row=>['Selected',row.from,row.to,row.present,row.absent,row.recorded_child_days,row.present_percent??'—']),...attendanceRows(previous.attendance).map(row=>['Previous',row.from,row.to,row.present,row.absent,row.recorded_child_days,row.present_percent??'—'])])}
    <h2>Classrooms (current assignment)</h2>${table(['Classroom','Present child-days','Absent child-days'],current.attendance.classrooms.map(row=>[row.classroom,row.present,row.absent]))}
    <h2>Current capacity and occupancy observations</h2><p>Active children: ${report.occupancy.current_active_children}. Current capacity: ${escapeHtml(report.occupancy.current_capacity??'Unconfigured')}. Observations begin: ${escapeHtml(timestamp(report.occupancy.coverage_started_at))}.</p>${table(['Observed at','Active children','Capacity','Reason'],report.occupancy.observations.map(row=>[timestamp(row.observed_at),row.active_children,row.capacity??'Unconfigured',row.reason.replaceAll('_',' ')]))}
    <h2>Best-selling paid products</h2>${table(['Product','Units','Collected'],report.best_sellers.map(row=>[row.name,row.units,reportMoney(row.collected)]))}
    <h2>Current low stock</h2>${table(['Product','Units'],report.low_stock.map(row=>[row.name,row.stock_qty]))}
    <h2>Orders placed in the selected period</h2>${table(['Measure','Count'],[['Placed',current.shop.orders_placed],['Marked paid now',current.shop.paid_orders_placed??0],['Unpaid now',current.shop.unpaid_orders??0]])}<p>These are current payment statuses for non-cancelled orders placed during the report period. They are separate from collections dated in that period.</p>
    <h2>Stock movements</h2>${table(['Recorded at','Product','Before','After','Change','Record'],(report.stock_movements??[]).map(row=>[timestamp(row.recorded_at),row.product_name,row.before_qty,row.after_qty,row.quantity_change,row.reason]))}${report.stock_movements_truncated?'<p>Only the first 1,000 stock changes are included. Choose a shorter report period for later changes.</p>':''}
    <h2>How to read this report</h2><ul>${report.notes.map(note=>`<li>${escapeHtml(note)}</li>`).join('')}</ul>${report.occupancy.truncated?'<p>Occupancy output is limited to the first 1,000 observations in the selected period. Select a shorter period for the remaining changes.</p>':''}
    </body></html>`;
}
function comparison(value:{difference:unknown;percent:number|null}){return value.percent===null?'No previous-period baseline':`${value.percent>0?'+':''}${value.percent}% versus previous period`;}

export default function PlusAnalytics(){
  const currentDay=localDay();
  const [draft,setDraft]=useState({from:currentDay.slice(0,8)+'01',to:currentDay,group_id:'',attendance_grouping:'day'});
  const [filters,setFilters]=useState(draft),[groups,setGroups]=useState<{id:number;name:string}[]>([]);
  const [report,setReport]=useState<PlusAnalyticsReport|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[restricted,setRestricted]=useState(false),[downloading,setDownloading]=useState(false);
  useEffect(()=>{
    let active=true;const controller=new AbortController();setBusy(true);setError('');setRestricted(false);setReport(null);
    portalClient.get('/plus/analytics',{params:{from:filters.from,to:filters.to,attendance_grouping:filters.attendance_grouping,...(filters.group_id?{group_id:filters.group_id}:{})},signal:controller.signal}).then(({data})=>{if(active){setReport(data);setGroups(data.groups);}})
      .catch(reason=>{if(active){setRestricted(reason?.response?.data?.code==='FEATURE_NOT_INCLUDED'||reason?.response?.data?.code==='SUBSCRIPTION_EXPIRED');setError(apiError(reason));}}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;controller.abort();};
  },[filters]);
  const download=async()=>{if(!report||downloading)return;setDownloading(true);try{
    const response=await portalClient.get('/plus/analytics/export.csv',{params:{from:report.filters.from,to:report.filters.to,attendance_grouping:report.filters.attendance_grouping??'day',...(report.filters.group_id?{group_id:report.filters.group_id}:{})},responseType:'blob'});
    const url=URL.createObjectURL(response.data);const link=document.createElement('a');link.href=url;link.download=`ankelba-management-${report.filters.from}-${report.filters.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(reason){setError(apiError(reason));}finally{setDownloading(false);}};
  const print=()=>{if(!report)return;const popup=window.open('','_blank');if(!popup){setError('Allow the report window to open, or download the CSV report.');return;}popup.opener=null;popup.document.open();popup.document.write(printableAnalytics(report));popup.document.close();popup.focus();popup.print();};
  return <div className="plus-analytics">
    <Card title="Business reports" action={<Badge value="Plus" tone="success"/>}>
      <p>Compare attendance, care-fee collections and shop activity over equal-length periods.</p>
      <div className="plus-report-presets" aria-label="Report date presets">{[['today','Today'],['week','This week to date'],['last_week','Last week'],['month','This month to date'],['last_month','Last month']].map(([code,label])=><Button key={code} variant="secondary" disabled={busy} onClick={()=>{const next={...draft,...reportPreset(code,currentDay)};setDraft(next);setFilters(next);}}>{label}</Button>)}</div>
      <form className="plus-report-filters j-form" onSubmit={event=>{event.preventDefault();setFilters({...draft});}}>
        <label>From<input type="date" required max={draft.to} value={draft.from} disabled={busy} onChange={event=>setDraft(previous=>({...previous,from:event.target.value}))}/></label>
        <label>Through<input type="date" required min={draft.from} max={currentDay} value={draft.to} disabled={busy} onChange={event=>setDraft(previous=>({...previous,to:event.target.value}))}/></label>
        <label>Classroom<select value={draft.group_id} disabled={busy} onChange={event=>setDraft(previous=>({...previous,group_id:event.target.value}))}><option value="">All classrooms</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label>Attendance grouping<select value={draft.attendance_grouping} disabled={busy} onChange={event=>setDraft(previous=>({...previous,attendance_grouping:event.target.value}))}><option value="day">Daily</option><option value="week">Weekly · Monday–Sunday</option><option value="month">Monthly</option></select></label>
        <Button type="submit" disabled={busy}>Update report</Button>
      </form>
      {busy&&<p role="status">Preparing your report…</p>}
      {error&&<div role="alert" className="j-error"><p>{error}</p>{restricted?<a href="/admin/subscription">View your subscription</a>:<Button variant="secondary" disabled={busy} onClick={()=>setFilters(previous=>({...previous}))}>Retry report</Button>}</div>}
    </Card>
    {report&&<>
      <div className="plus-report-summary" aria-label="Selected period summary">
        {[['Care fees collected',reportMoney(report.current.care_fees.collected),comparison(report.comparisons.care_collected)],['Fees billed',reportMoney(report.current.care_fees.billed),comparison(report.comparisons.care_billed)],['Outstanding now',reportMoney(report.current.care_fees.outstanding_now),'On invoices issued in this period'],['Overdue now',reportMoney(report.current.care_fees.overdue_now),'Current overdue balance of that cohort'],['Shop collected',reportMoney(report.current.shop.collected),comparison(report.comparisons.shop_collected)],['Present child-days',String(report.current.attendance.present),comparison(report.comparisons.attendance)],['Current active children',String(report.occupancy.current_active_children),'Whole daycare, at report generation'],['Current capacity',String(report.occupancy.current_capacity??'Unconfigured'),report.occupancy.current_utilization_percent===null?'No configured limit':`${report.occupancy.current_utilization_percent}% currently used`]].map(([label,value,note])=><Card key={label}><small>{label}</small><strong>{value}</strong><p>{note}</p></Card>)}
      </div>
      <Card title="Recorded attendance">
        <p>Showing {report.filters.from} through {report.filters.to}. Previous comparison: {report.previous.from} through {report.previous.to}.</p>
        <p>Grouped by {report.filters.attendance_grouping??'day'} · weeks run Monday–Sunday. Edge groups include only dates in the report period. Unmarked days do not count as absences.</p>
        {report.current.attendance.recorded_child_days?<>
          <div className="plus-attendance-chart" role="img" aria-label="Grouped present and absent child-days. Exact figures appear in the attendance table below.">{attendanceRows(report.current.attendance).map(row=>{const maximum=Math.max(1,...attendanceRows(report.current.attendance).map(day=>day.present+day.absent));return <div key={row.from} className="plus-attendance-column" title={`${row.from} to ${row.to}: ${row.present} present, ${row.absent} absent`}><span className="plus-attendance-present" style={{height:`${row.present*100/maximum}%`}}/><span className="plus-attendance-absent" style={{height:`${row.absent*100/maximum}%`}}/></div>;})}</div>
          <p className="plus-chart-key"><span>Present</span><span>Absent</span> Recorded attendance rate: {report.current.attendance.present_percent}%</p>
        </>:<p>No attendance was recorded during this period.</p>}
        <h3>Selected period</h3><Table rows={attendanceRows(report.current.attendance).map((row,index)=>({...row,id:index,rate:row.present_percent===null?'No records':`${row.present_percent}%`}))} columns={[{key:'from',title:'From'},{key:'to',title:'Through'},{key:'present',title:'Present child-days'},{key:'absent',title:'Absent child-days'},{key:'rate',title:'Attendance rate'}]} pageSize={10}/>
        <h3>Previous equal-length period</h3><Table rows={attendanceRows(report.previous.attendance).map((row,index)=>({...row,id:index,rate:row.present_percent===null?'No records':`${row.present_percent}%`}))} columns={[{key:'from',title:'From'},{key:'to',title:'Through'},{key:'present',title:'Present child-days'},{key:'absent',title:'Absent child-days'},{key:'rate',title:'Attendance rate'}]} pageSize={10}/>
      </Card>
      <Card title="Classroom attendance"><Table rows={report.current.attendance.classrooms.map(row=>({...row,id:row.group_id??0}))} columns={[{key:'classroom',title:'Current classroom'},{key:'present',title:'Present child-days'},{key:'absent',title:'Absent child-days'}]}/></Card>
      <Card title="Occupancy observations"><p>Historical coverage begins {timestamp(report.occupancy.coverage_started_at)}. These are recorded changes, not reconstructed daily averages.</p>
        <Table rows={report.occupancy.observations.map((row,index)=>({...row,id:index,observed:timestamp(row.observed_at),capacity:row.capacity??'Unconfigured',reason:row.reason.replaceAll('_',' ')}))} columns={[{key:'observed',title:'Observed at · Addis Ababa'},{key:'active_children',title:'Active children'},{key:'capacity',title:'Capacity'},{key:'reason',title:'Change'}]}/>
        {report.occupancy.truncated&&<p>Only the first 1,000 observations are shown. Choose a shorter report period for later changes.</p>}
      </Card>
      {report.current.shop.enabled&&<div className="plus-shop-report-grid"><Card title="Best-selling paid products"><Table rows={report.best_sellers.map(row=>({...row,id:row.product_id,collected:reportMoney(row.collected)}))} columns={[{key:'name',title:'Product'},{key:'units',title:'Units'},{key:'collected',title:'Collected'}]}/></Card><Card title="Current low stock"><Table rows={report.low_stock} columns={[{key:'name',title:'Product'},{key:'stock_qty',title:'Units remaining'}]}/></Card></div>}
      {report.current.shop.enabled&&<Card title="Shop orders placed in this period"><p>{report.current.shop.orders_placed} placed · {report.current.shop.paid_orders_placed??0} marked paid now · {report.current.shop.unpaid_orders??0} unpaid now</p><p>Cancelled orders are excluded. These are current payment statuses for orders placed in the selected period; collections above use payment dates.</p></Card>}
      {report.current.shop.enabled&&<Card title="Shop cash flow"><Table rows={[{id:1,measure:'Gross verified collections',current:reportMoney(report.current.shop.gross_collected??report.current.shop.collected),previous:reportMoney(report.previous.shop.gross_collected??report.previous.shop.collected)},{id:2,measure:'Recorded cash returns · no app transfer',current:reportMoney(report.current.shop.refunds??'0.00'),previous:reportMoney(report.previous.shop.refunds??'0.00')},{id:3,measure:'Net collections',current:reportMoney(report.current.shop.collected),previous:reportMoney(report.previous.shop.collected)}]} columns={[{key:'measure',title:'Measure'},{key:'current',title:'Selected period'},{key:'previous',title:'Previous period'}]}/><p>Gross collections retain their original verified payment date after a refund. Cash returns use the attested return time; the app records the return and does not transfer money. Best sellers exclude fully refunded orders.</p></Card>}
      {report.current.shop.enabled&&<Card title="Stock movements"><p>Recorded inventory changes begin when inventory history is enabled. Baselines show the opening quantity; earlier changes are not reconstructed.</p><Table rows={(report.stock_movements??[]).map(row=>({...row,id:Number(row.id),recorded:timestamp(row.recorded_at),reason:row.reason.replaceAll('_',' ')}))} columns={[{key:'recorded',title:'Recorded · Addis Ababa'},{key:'product_name',title:'Product'},{key:'before_qty',title:'Before'},{key:'after_qty',title:'After'},{key:'quantity_change',title:'Change'},{key:'reason',title:'Record'}]}/>{report.stock_movements_truncated&&<p>Showing the first 1,000 changes. Choose a shorter period to see later changes.</p>}</Card>}
      <Card title="Export and report definitions" action={<div className="plus-report-actions"><Button variant="secondary" icon="download" disabled={downloading} onClick={()=>void download()}>{downloading?'Downloading…':'Download CSV'}</Button><Button variant="secondary" onClick={print}>Print / save PDF</Button></div>}>
        <p>Generated {timestamp(report.generated_at)} · Addis Ababa.</p><ul>{report.notes.map(note=><li key={note}>{note}</li>)}</ul>
      </Card>
    </>}
  </div>;
}
