import React,{useState} from 'react';
import {portalApi,apiError} from './api';
import {dateLabel} from './subscriptions';
import './journey.css';
export default function ApplicationStatus(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[result,setResult]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const check=async(e:React.FormEvent)=>{e.preventDefault();setError('');setResult(null);setBusy(true);try{setResult(await portalApi.applicationStatus(email,password));setPassword('');}catch(e){setError(apiError(e));}finally{setBusy(false);}};
 return <main className="journey j-status"><a href="/">← Ankelba home</a><span className="j-tag">YOUR DAYCARE APPLICATION</span><h1>Check your application</h1><p>Use the administrator email and password you entered when applying. This checks your application without opening a daycare session.</p>
 {error&&<p role="alert" className="j-error">{error}</p>}
 {!result?<form onSubmit={check} className="j-form"><label>Administrator email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy} className="saas-btn saas-btn-primary">{busy?'Checking…':'Check status'}</button></form>:<section aria-live="polite"><h2>{result.name}</h2><strong className="j-tag">{result.status==='pending'?'Under review':result.status}</strong>
 <p>{result.status==='pending'?'Your application is being reviewed. Your trial has not started.':(result.status==='active'||result.status==='approved')?'Your application is approved. Sign in to set up your center.':result.status==='rejected'?result.review_reason:'Your center is currently suspended. Contact Ankelba support.'}</p>
 <p>Selected package: <strong>{result.subscription_terms?.name || result.requested_plan}</strong> · {result.billing_cycle}</p>{result.trial_ends_at&&<p>Trial ends: {dateLabel(result.trial_ends_at)}</p>}
 <div className="j-actions"><a className="saas-btn saas-btn-primary" href="/admin/login">Daycare login</a><button onClick={()=>setResult(null)}>Check another application</button></div></section>}
 </main>;
}
