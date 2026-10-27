import React,{useEffect,useRef,useState} from 'react';
import {operatorApi,portalApi,apiError} from './api';
import {PackageOffer,Cycle,priceLabel,dateLabel} from './subscriptions';
import './journey.css';

function History({rows=[]}:{rows?:any[]}){
 return <section><h3>Subscription history</h3>{!rows.length?<p className="j-muted">No subscription changes recorded yet.</p>:<ol className="j-history">{rows.map(e=><li key={e.id}><strong>{e.action.replaceAll('_',' ')}</strong><p>{e.reason}</p>{e.details?.amount!==undefined&&<p>{Number(e.details.amount).toLocaleString()} ETB · Reference: {e.details.payment_reference}</p>}<small>{dateLabel(e.created_at)} · {e.actor_name || `Account #${e.actor_id}`}</small></li>)}</ol>}</section>;
}
function SubscriptionSummary({value}:{value:any}){
 const terms=value.subscription_terms;
 return <><div className="j-summary">
  <div><small>Package and capacity</small><strong>{terms?.name || value.subscription_plan} · {value.max_children} children</strong></div>
  <div><small>Subscription status</small><strong>{value.effective_status.replaceAll('_',' ')}</strong></div>
  <div><small>Accepted renewal price</small><strong>{priceLabel(terms?.price,value.billing_cycle)}</strong></div>
  <div><small>Trial ends · Addis Ababa</small><strong>{dateLabel(value.trial_ends_at)}</strong></div>
  <div><small>Paid through · Addis Ababa</small><strong>{dateLabel(value.subscription_ends_at)}</strong></div>
  <div><small>Payment collection</small><strong>No automatic charges</strong></div>
 </div><p className="j-muted">{value.expiry_policy}</p>{terms?.price==null&&<p className="j-muted">A renewal price has not been agreed for this subscription. Contact the platform team before renewal. Your free trial does not create a payment obligation.</p>}</>;
}
export function DaycareSubscription(){
 const [value,setValue]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const load=async()=>{setBusy(true);setError('');try{setValue(await portalApi.subscription());}catch(e){setError(apiError(e));}finally{setBusy(false);}};
 useEffect(()=>{void load();},[]);
 return <div className="journey j-panel"><h2>Your subscription</h2><p>Your selected package, accepted terms and recorded changes.</p><button onClick={load} disabled={busy}>{busy?'Refreshing…':'Refresh subscription'}</button>{error&&<p role="alert" className="j-error">{error}</p>}{value&&<><SubscriptionSummary value={value}/><p>To renew, change package or cancel renewal, contact the Ankelba platform team. Payment confirmation is recorded manually; this page never charges you.</p><History rows={value.history}/></>}</div>;
}
function PackageEditor({offer,onSaved}:{offer:PackageOffer;onSaved:()=>Promise<void>}){
 const [draft,setDraft]=useState({...offer,reason:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState('');
 useEffect(()=>{setDraft({...offer,reason:''});},[offer]);
 const save=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');setSaved('');try{const {code,updated_at,...body}=draft as any;await operatorApi.savePackage(offer.code,body);await onSaved();setSaved('Package saved. Existing subscriptions retain their accepted terms.');}catch(e){setError(apiError(e));}finally{setBusy(false);}};
 return <form className="j-panel j-form" onSubmit={save}><h3>{offer.code} package</h3>
  <label>Display name<input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
  <label>Description<textarea required minLength={12} maxLength={300} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
  <div className="j-grid"><label>Active-child capacity<input type="number" min={1} max={1000} required value={draft.max_children} onChange={e=>setDraft({...draft,max_children:Number(e.target.value)})}/></label><label>Free trial days<input type="number" required min={1} max={180} value={draft.trial_days} onChange={e=>setDraft({...draft,trial_days:Number(e.target.value)})}/></label></div>
  <div className="j-grid"><label>Monthly renewal · ETB<input type="number" min={0} max={9999999999} step="0.01" value={draft.monthly_price??''} placeholder="Not configured" onChange={e=>setDraft({...draft,monthly_price:e.target.value||null})}/></label><label>Annual renewal · ETB<input type="number" min={0} max={9999999999} step="0.01" value={draft.annual_price??''} placeholder="Not configured" onChange={e=>setDraft({...draft,annual_price:e.target.value||null})}/></label></div>
  <label><span><input type="checkbox" checked={draft.available} onChange={e=>setDraft({...draft,available:e.target.checked})}/> Accept new applications</span></label>
  <label>Reason for catalog change<textarea minLength={12} maxLength={1000} required value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>
  {error&&<p role="alert" className="j-error">{error}</p>}{saved&&<p role="status">{saved}</p>}<button disabled={busy} className="saas-btn saas-btn-primary">{busy?'Saving…':'Save package terms'}</button>
 </form>;
}
export function OperatorSubscriptions({daycares,initialId,onChanged}:{daycares:any[];initialId?:number;onChanged:()=>Promise<void>}){
 const [tab,setTab]=useState<'subscriptions'|'packages'>('subscriptions');
 const [offers,setOffers]=useState<PackageOffer[]>([]),[id,setId]=useState(initialId || 0),[search,setSearch]=useState('');
 const [value,setValue]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [action,setAction]=useState('renew'),[reason,setReason]=useState(''),[days,setDays]=useState(14),[code,setCode]=useState('standard'),[cycle,setCycle]=useState<Cycle>('monthly'),[amount,setAmount]=useState(''),[reference,setReference]=useState('');
 const key=useRef('');
 useEffect(()=>{key.current=`subscription_${Date.now()}_${Math.random().toString(36).slice(2,14)}`;},[id,action,reason,days,code,cycle,amount,reference]);
 useEffect(()=>{if(initialId)setId(initialId);},[initialId]);
 const loadOffers=async()=>{setOffers(await operatorApi.packages());};
 useEffect(()=>{void loadOffers().catch(e=>setError(apiError(e)));},[]);
 useEffect(()=>{let live=true;setValue(null);setError('');setNotice('');if(!id)return;setLoading(true);operatorApi.subscription(id).then(v=>{if(live)setValue(v);}).catch(e=>{if(live)setError(apiError(e));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[id]);
 const refresh=async()=>{if(!id)return;setLoading(true);setError('');try{setValue(await operatorApi.subscription(id));}catch(e){setError(apiError(e));}finally{setLoading(false);}};
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(!value)return;setBusy(true);setError('');setNotice('');
  const body:any={action,reason,version:value.version,request_key:key.current};
  if(action==='renew')Object.assign(body,{amount:Number(amount),payment_reference:reference});
  if(action==='extend_trial')body.days=days;
  if(action==='change_package')Object.assign(body,{package_code:code,billing_cycle:cycle});
  try{await operatorApi.subscriptionAction(id,body);await refresh();await onChanged();setReason('');setReference('');setAmount('');setNotice('Subscription action recorded. Review the updated terms and history below.');}
  catch(e){setError(apiError(e));}finally{setBusy(false);}
 };
 const centers=daycares.filter(d=>['active','suspended'].includes(d.status));
 const filtered=centers.filter(d=>`${d.name} ${d.admin_email}`.toLowerCase().includes(search.toLowerCase()));
 const expiring=centers.filter(d=>d.subscription_status==='trialing' && d.trial_ends_at && new Date(d.trial_ends_at).getTime()<Date.now()+7*86400000).length;
 return <div className="journey"><div className="j-actions"><button onClick={()=>setTab('subscriptions')} aria-pressed={tab==='subscriptions'}>Subscriptions</button><button onClick={()=>setTab('packages')} aria-pressed={tab==='packages'}>Package catalog</button></div>
 {tab==='packages'?<><h2>Package catalog</h2><p>Configure actual offers before inviting daycares. Changes apply to future applications; existing accepted terms remain unchanged.</p>{error&&<p role="alert" className="j-error">{error}</p>}<div className="j-grid">{offers.map(p=><PackageEditor key={p.code} offer={p} onSaved={loadOffers}/>)}</div></>:<>
  <div className="j-summary"><div><small>Approved centers</small><strong>{centers.length}</strong></div><div><small>Trials ending within 7 days or expired</small><strong>{expiring}</strong></div><div><small>Collection method</small><strong>Manual confirmation</strong></div></div>
  <section className="j-panel j-form"><label>Find a daycare<input type="search" value={search} onChange={e=>setSearch(e.target.value)} disabled={busy}/></label><label>Daycare subscription<select value={id} disabled={busy} onChange={e=>setId(Number(e.target.value))}><option value={0}>Choose an approved daycare</option>{(id&&!filtered.some(d=>d.id===id)?[...filtered,...centers.filter(d=>d.id===id)]:filtered).map(d=><option key={d.id} value={d.id}>{d.name} · {d.subscription_plan}</option>)}</select></label>{!centers.length&&<p>Approve a daycare application to begin its trial.</p>}</section>
  {loading&&<p role="status">Loading subscription…</p>}{error&&<p role="alert" className="j-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {value&&!loading&&<section className="j-panel"><h2>{value.name}</h2><button onClick={refresh} disabled={busy}>Refresh current terms</button><SubscriptionSummary value={value}/>
   <form onSubmit={submit} className="j-form"><h3>Manage subscription</h3><label>Action<select value={action} onChange={e=>setAction(e.target.value)} disabled={busy}><option value="renew">Record manual payment and renew</option><option value="extend_trial">Extend free trial</option><option value="change_package">Change package / agree renewal terms</option><option value="cancel">Cancel future renewal</option><option value="resume">Resume subscription</option></select></label>
   {action==='renew'&&<><p>Record only a payment you have verified outside Ankelba. This action extends access by one accepted billing period. Store orders and tuition are separate.</p><div className="j-grid"><label>Verified amount · ETB<input type="number" min={0} step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label><label>Unique payment / receipt reference<input required minLength={4} maxLength={150} value={reference} onChange={e=>setReference(e.target.value)} disabled={busy}/></label></div></>}
   {action==='extend_trial'&&<label>Additional days<input type="number" min={1} max={180} required value={days} onChange={e=>setDays(Number(e.target.value))} disabled={busy}/></label>}
   {action==='change_package'&&<><p>Confirm the new terms with the daycare before saving. A paid period must finish before its package can change. A lower capacity cannot exclude currently active children.</p><label>Package<select value={code} onChange={e=>setCode(e.target.value)} disabled={busy}>{offers.filter(p=>p.available).map(p=><option key={p.code} value={p.code}>{p.name} · {p.max_children} children</option>)}</select></label><label>Billing period<select value={cycle} onChange={e=>setCycle(e.target.value as Cycle)} disabled={busy}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label><p>{priceLabel(offers.find(p=>p.code===code)?.[cycle==='annual'?'annual_price':'monthly_price'],cycle)}</p></>}
   {action==='cancel'&&<p>No future renewal will be recorded until resumed. Existing paid-period evidence is retained. Child-care access follows the pilot expiry policy above.</p>}
   <label>Reason / agreement with daycare<textarea required minLength={12} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
   <button disabled={busy} className="saas-btn saas-btn-primary">{busy?'Recording…':'Confirm subscription action'}</button></form><History rows={value.history}/>
  </section>}
 </>}
 </div>;
}
