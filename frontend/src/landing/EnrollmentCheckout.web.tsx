import React, { useEffect, useRef, useState } from 'react';
import { apiError, portalApi } from '../portal/api';
import { Cycle, PackageOffer } from '../portal/subscriptions';
import { Icon } from '../portal/ui.web';
import SubscriptionPayment, { clearApplicationPayment, PaymentSession } from './SubscriptionPayment.web';

export type EnrollmentSelection = { offer: PackageOffer; cycle: Cycle };
export type EnrollmentStage = 'payment' | 'application' | 'submitted';
const initialForm = { daycareName:'', citySubcity:'', contactEmail:'', contactPhone:'', licenseNumber:'', adminName:'', adminEmail:'', adminPassword:'' };

export default function EnrollmentCheckout({ selection, resume, onSession, onStage, onBusyChange }: {
  selection?: EnrollmentSelection;
  resume?: {id:string;token:string} | null;
  onSession?: (value: PaymentSession | null) => void;
  onStage?: (stage: EnrollmentStage) => void;
  onBusyChange?: (busy:boolean) => void;
}) {
  const [payment,setPayment] = useState<PaymentSession|null>(null);
  const [form,setForm] = useState(() => {
    let daycareName='';
    try { daycareName=window.sessionStorage.getItem('ankelba_daycare_name') || ''; } catch {}
    return {...initialForm,daycareName};
  });
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [submitted,setSubmitted]=useState(false);
  const submitting=useRef(false), errorNotice=useRef<HTMLDivElement>(null);
  useEffect(()=>{onStage?.(submitted?'submitted':payment?'application':'payment');},[submitted,payment,onStage]);
  useEffect(()=>{if(error){errorNotice.current?.focus();errorNotice.current?.scrollIntoView({block:'nearest'});}},[error]);
  useEffect(()=>{
    if(!busy)return;
    const beforeUnload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    const preventRouteChange=(event:Event)=>{event.preventDefault();};
    const preventNavigation=(event:MouseEvent)=>{
      if(event.target instanceof Element && event.target.closest('a[href]'))event.preventDefault();
    };
    window.addEventListener('beforeunload',beforeUnload);
    window.addEventListener('ankelba:before-route-change',preventRouteChange);
    document.addEventListener('click',preventNavigation,true);
    return ()=>{window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('ankelba:before-route-change',preventRouteChange);document.removeEventListener('click',preventNavigation,true);};
  },[busy]);

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(submitting.current || !payment)return;
    submitting.current=true;setBusy(true);setError('');
    try {
      await portalApi.registerDaycare({
        ...form,address:form.citySubcity,licenseNumber:form.licenseNumber || 'N/A',
        requestedPlan:payment.terms?.code,billingCycle:payment.terms?.billing_cycle,termsVersion:payment.terms?.version,
        payment_intent_id:payment.id,payment_token:payment.token,
      });
      setSubmitted(true);clearApplicationPayment();setForm(initialForm);
      try {window.sessionStorage.removeItem('ankelba_daycare_name');}catch{}
    } catch(e:any) {
      setError(!e.response?'We could not confirm your submission. Your entries are still here. Check your connection and application status before retrying.':apiError(e));
    } finally {submitting.current=false;setBusy(false);}
  };

  if(submitted)return <section className="pricing-application-success" aria-live="polite">
    <span className="pricing-success-mark"><Icon name="check" size={30}/></span>
    <h2>Your application has been submitted.</h2>
    <p>The platform team will review your daycare. Your paid period begins when your application is approved.</p>
    <a className="btn-pill btn-pill-primary" href="/application-status">Track application <Icon name="arrow" size={17}/></a>
  </section>;

  if(!payment)return <SubscriptionPayment selection={selection} resume={resume} onSession={onSession} onBusyChange={onBusyChange} onPaid={value=>{
    setPayment(value);setForm(previous=>({...previous,adminEmail:value.email || previous.adminEmail}));
  }}/>;

  const fields: {key:keyof typeof initialForm;label:string;type?:string;placeholder:string;required?:boolean}[]=[
    {key:'daycareName',label:'Daycare name',placeholder:'Bright Stars Daycare',required:true},
    {key:'citySubcity',label:'City and subcity',placeholder:'Bole, Addis Ababa',required:true},
    {key:'contactEmail',label:'Daycare email',type:'email',placeholder:'office@yourdaycare.com',required:true},
    {key:'contactPhone',label:'Contact phone',type:'tel',placeholder:'+251 91 123 4567',required:true},
    {key:'licenseNumber',label:'Trade or educational license number',placeholder:'Your license number'},
    {key:'adminName',label:'Director’s full name',placeholder:'Director or administrator',required:true},
    {key:'adminEmail',label:'Director’s sign-in email',type:'email',placeholder:'director@yourdaycare.com',required:true},
    {key:'adminPassword',label:'Create a password',type:'password',placeholder:'At least 6 characters',required:true},
  ];
  return <section className="pricing-application">
    <div className="pricing-checkout-heading"><h2>Daycare and director details</h2>
      <p>Complete your application for <strong>{payment.terms?.name || payment.terms?.code}</strong>. Your sign-in email stays linked to your payment.</p></div>
    {error&&<div ref={errorNotice} tabIndex={-1} role="alert" className="pricing-form-error">{error}</div>}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy} className="pricing-application-fields"><legend className="comparison-sr-only">Daycare and director details</legend>
        {fields.map(field=><div className="form-group" key={field.key}>
          <label htmlFor={field.key}>{field.label}{field.required?' *':''}</label>
          <input id={field.key} type={field.type||'text'} required={field.required} placeholder={field.placeholder}
            value={form[field.key]} minLength={field.key==='adminPassword'?6:undefined} maxLength={field.key==='adminPassword'?72:field.key==='citySubcity'?500:field.key==='licenseNumber'?100:['daycareName','adminName'].includes(field.key)?200:255}
            autoComplete={field.key==='adminPassword'?'new-password':field.key==='daycareName'?'organization':undefined}
            readOnly={field.key==='adminEmail'&&!!payment.email}
            onChange={event=>setForm(previous=>({...previous,[field.key]:event.target.value}))}/>
        </div>)}
      </fieldset>
      {busy&&<p role="status">Submitting your application. Please keep this page open.</p>}
      <div className="pricing-submit-row"><p>Your subscription begins after approval. Already applied? <a href="/application-status">Check your status.</a></p>
        <button type="submit" className="btn-pill btn-pill-primary" disabled={busy}>{busy?'Submitting…':'Submit application'}<Icon name="arrow" size={17}/></button></div>
    </form>
  </section>;
}
