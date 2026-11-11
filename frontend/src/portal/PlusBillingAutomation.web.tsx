import React, { useEffect, useRef, useState } from 'react';
import { apiError, portalClient } from './api';
import { Badge, Button, Card } from './ui.web';

type Settings = {
  enabled: boolean; generate_day: number; due_day: number; default_fee: number | string | null;
  discount_percent: number | string; discount_reason: string; reminder_before_days: number; reminder_after_days: number;
  in_app_reminders: boolean; email_reminders: boolean; version: number;
};
type Preview = {preview_id:string;billing_period:string;due_date:string;generated_count:number;skipped_count:number;total_amount:string;children:{id:number;name:string;amount:string;already_invoiced:boolean;has_parent:boolean}[]};
const initial:Settings={enabled:false,generate_day:1,due_day:10,default_fee:null,discount_percent:0,discount_reason:'',reminder_before_days:3,reminder_after_days:3,in_app_reminders:false,email_reminders:false,version:0};
const fields=Object.keys(initial) as (keyof Settings)[];
const money=(value:unknown)=>`${Number(value||0).toLocaleString('en-ET',{minimumFractionDigits:2,maximumFractionDigits:2})} ETB`;
const time=(value:string|null)=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa'}):'—';

export default function PlusBillingAutomation(){
  const [settings,setSettings]=useState<Settings>(initial),[reason,setReason]=useState('');
  const [preview,setPreview]=useState<Preview|null>(null),[history,setHistory]=useState<any>({runs:[],deliveries:[],aging:{}});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [runtime,setRuntime]=useState<{scheduler_enabled:boolean;email_delivery_enabled:boolean}|null>(null);
  const requesting=useRef(false);
  const load=async()=>{const [configuration,records]=await Promise.all([portalClient.get('/billing-automation/settings'),portalClient.get('/billing-automation/history')]);setSettings(configuration.data);setRuntime(configuration.data.runtime);setHistory(records.data);};
  useEffect(()=>{let active=true;Promise.all([portalClient.get('/billing-automation/settings'),portalClient.get('/billing-automation/history')]).then(([configuration,records])=>{if(active){setSettings(configuration.data);setRuntime(configuration.data.runtime);setHistory(records.data);}}).catch(value=>{if(active)setError(apiError(value));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const update=(patch:Partial<Settings>)=>{setSettings(previous=>({...previous,...patch}));if(Object.keys(patch).some(key=>key!=='enabled'))setPreview(null);setNotice('');};
  const body=()=>({...Object.fromEntries(fields.map(key=>[key,settings[key]])),reason,...(preview?{preview_id:preview.preview_id}:{})});
  const action=async(work:()=>Promise<void>)=>{if(requesting.current)return;requesting.current=true;setBusy(true);setError('');setNotice('');try{await work();}catch(value){setError(apiError(value));}finally{requesting.current=false;setBusy(false);}};
  const check=()=>action(async()=>{const result=await portalClient.post('/billing-automation/preview',body());setPreview(result.data);setNotice('Preview ready. Check the fees and children, then save to activate the schedule.');});
  const save=()=>action(async()=>{const result=await portalClient.put('/billing-automation/settings',body());setSettings(result.data);setPreview(null);setReason('');setNotice(result.data.enabled?'Billing schedule saved. Existing invoices remain unchanged.':'Billing automation paused. Manual invoicing remains available.');setHistory((await portalClient.get('/billing-automation/history')).data);});
  const run=()=>action(async()=>{const result=await portalClient.post('/billing-automation/run',{});await load();const invoices=result.data.invoices;setNotice(invoices.blocked?'Automation is unavailable for this subscription.':invoices.skipped?'No invoice generation is due. Any eligible reminders have been queued.':`Created ${invoices.generated_count} invoices; skipped ${invoices.skipped_count} already invoiced children. ${result.data.queued} reminders queued.`);});
  const number=(key:'generate_day'|'due_day'|'default_fee'|'discount_percent'|'reminder_before_days'|'reminder_after_days',label:string,min:number,max:number,step=1)=><label>{label}<input type="number" min={min} max={max} step={step} required={key!=='default_fee'||settings.enabled} disabled={busy} value={settings[key]??''} onChange={event=>update({[key]:event.target.value===''?null:Number(event.target.value)})}/></label>;
  return <div className="journey">
    <Card title="Billing automation"><p>Set a monthly care-fee schedule, preview invoices, and remind families about outstanding balances. All schedule dates use Addis Ababa time.</p>
      {runtime&&!runtime.scheduler_enabled&&<p role="status" className="j-muted">The platform scheduler is paused. You can preview and save settings, but automatic invoice creation and reminder delivery wait until the platform administrator enables the scheduler.</p>}
      {runtime&&!runtime.email_delivery_enabled&&<p className="j-muted">Email delivery is disabled on this platform. Email preferences can be saved; queued emails wait until delivery is configured and enabled.</p>}
      {error&&<p role="alert" className="j-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {loading?<p role="status">Loading billing settings…</p>:<form className="j-form" onSubmit={event=>{event.preventDefault();void save();}}>
        <label><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={event=>update({enabled:event.target.checked})}/> Enable scheduled monthly care-fee invoices</label>
        <div className="j-summary">{number('generate_day','Generate on day of month',1,28)}{number('due_day','Payment due on day of month',settings.generate_day,28)}{number('default_fee','Default monthly fee when a child has no configured fee',0.01,99999999,0.01)}</div>
        <p className="j-muted">The child’s configured care fee takes precedence. New schedules process the current month once the generation day is reached; they do not create historical debts.</p>
        <div className="j-summary">{number('discount_percent','Recurring discount (%)',0,99.99,0.01)}<label>Discount reason<textarea minLength={Number(settings.discount_percent)>0?12:undefined} maxLength={500} required={Number(settings.discount_percent)>0} value={settings.discount_reason} disabled={busy} onChange={event=>update({discount_reason:event.target.value})}/></label></div>
        <fieldset disabled={busy}><legend>Payment reminders</legend>
          <label><input type="checkbox" checked={settings.in_app_reminders} onChange={event=>update({in_app_reminders:event.target.checked})}/> Send an in-app message to the linked billing parent</label>
          <label><input type="checkbox" checked={settings.email_reminders} onChange={event=>update({email_reminders:event.target.checked})}/> Queue email reminders for parents who explicitly opt in</label>
          <div className="j-summary">{number('reminder_before_days','Days before due date',0,30)}{number('reminder_after_days','Days after due date',0,60)}</div>
          <p className="j-muted">At most one reminder before and one after the due date are sent per invoice and channel. Paid balances, disabled preferences, paused schedules and unavailable subscriptions are rechecked before delivery. Email delivery also requires the platform’s email worker to be enabled.</p>
        </fieldset>
        <label>Reason for changing this schedule<textarea required minLength={12} maxLength={1000} disabled={busy} value={reason} onChange={event=>setReason(event.target.value)}/></label>
        <div className="j-actions"><Button type="button" variant="secondary" disabled={busy||reason.trim().length<12||!settings.default_fee} onClick={()=>void check()}>Preview current month</Button><Button type="submit" disabled={busy||reason.trim().length<12||(settings.enabled&&!preview)}>Save schedule</Button></div>
        <p className="j-muted">Enabling or changing an active schedule requires a fresh preview. Previewing creates no invoices and collects no money.</p>
      </form>}
    </Card>
    {preview&&<Card title={`Invoice preview · ${preview.billing_period}`}><p>{preview.generated_count} new invoices · {preview.skipped_count} already invoiced · {money(preview.total_amount)} total · due {preview.due_date}</p>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Child</th><th>Amount</th><th>Billing parent</th><th>Invoice</th></tr></thead><tbody>{preview.children.map(child=><tr key={child.id}><td>{child.name}</td><td>{money(child.amount)}</td><td>{child.has_parent?'Linked':'No linked parent; reminders unavailable'}</td><td>{child.already_invoiced?'Already exists':'Will be created'}</td></tr>)}</tbody></table></div>
      <p className="j-muted">The preview expires after ten minutes. Changes to child fees, parent links or existing invoices require another preview.</p>
    </Card>}
    <Card title="Outstanding balances"><div className="j-summary">{[['Not overdue',history.aging.current_balance],['1–30 days overdue',history.aging.days_1_30],['31–60 days overdue',history.aging.days_31_60],['Over 60 days overdue',history.aging.days_over_60]].map(([label,value])=><div key={String(label)}><small>{label}</small><strong>{money(value)}</strong></div>)}</div>
      <Button variant="secondary" disabled={busy||!settings.enabled} onClick={()=>void run()}>Run scheduled work now</Button><p className="j-muted">This processes due invoice work and queues reminders. It never debits a parent or initiates a bank transfer.</p>
    </Card>
    <Card title="Invoice run history">{!history.runs.length?<p>No scheduled invoice runs yet.</p>:<div style={{overflowX:'auto'}}><table><thead><tr><th>Period</th><th>Status</th><th>Created</th><th>Skipped</th><th>Total</th><th>Completed</th></tr></thead><tbody>{history.runs.map((row:any)=><tr key={row.id}><td>{row.billing_period}</td><td><Badge tone={row.status==='completed'?'success':'warning'} value={row.status}/>{row.last_error&&<p>{row.last_error}</p>}</td><td>{row.generated_count}</td><td>{row.skipped_count}</td><td>{money(row.total_amount)}</td><td>{time(row.completed_at)}</td></tr>)}</tbody></table></div>}</Card>
    <Card title="Reminder delivery history">{!history.deliveries.length?<p>No reminders queued yet.</p>:<div style={{overflowX:'auto'}}><table><thead><tr><th>Invoice</th><th>Parent</th><th>Channel</th><th>Status</th><th>Attempts</th><th>Sent</th></tr></thead><tbody>{history.deliveries.map((row:any)=><tr key={row.id}><td>#{row.invoice_id}</td><td>{row.parent_name}</td><td>{row.channel==='in_app'?'In-app':row.channel}</td><td>{row.status}{row.last_error&&<p>{row.last_error}</p>}</td><td>{row.attempts}</td><td>{time(row.sent_at)}</td></tr>)}</tbody></table></div>}</Card>
  </div>;
}
