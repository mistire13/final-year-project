import React, { useCallback, useEffect, useState } from 'react';
import PricingPage from './PricingPage.web';
import EnrollmentCheckout, { EnrollmentSelection, EnrollmentStage } from './EnrollmentCheckout.web';
import { consumeSubscriptionRecovery } from './subscriptionRecovery';
import { PaymentSession } from './SubscriptionPayment.web';

export default function PricingJourney(){
  const [selection,setSelection]=useState<EnrollmentSelection|undefined>();
  const [resume,setResume]=useState<{id:string;token:string}|null>(null);
  const [checkoutOpen,setCheckoutOpen]=useState(false),[hasIntent,setHasIntent]=useState(false);
  const [paymentBusy,setPaymentBusy]=useState(false);
  const [stage,setStage]=useState<EnrollmentStage>('payment');
  useEffect(()=>{
    const recovery=consumeSubscriptionRecovery(window.location.href,path=>{
      const clean=new URL(path,window.location.origin);clean.pathname='/pricing';
      window.history.replaceState({},'',`${clean.pathname}${clean.search}`);
    });
    if(recovery?.purpose==='renewal'){
      try{window.sessionStorage.setItem('ankelba_renewal_resume',JSON.stringify(recovery));}catch{}
      window.history.replaceState({},'','/admin/subscription');window.dispatchEvent(new PopStateEvent('popstate'));return;
    }
    try{if(recovery)window.sessionStorage.setItem('ankelba_payment_resume',JSON.stringify(recovery));}catch{}
    try{
      const saved=recovery || JSON.parse(window.sessionStorage.getItem('ankelba_payment_resume')||'null') || JSON.parse(window.sessionStorage.getItem('ankelba_application_payment')||'null');
      if(saved?.id&&saved?.token){setResume({id:saved.id,token:saved.token});setCheckoutOpen(true);setHasIntent(true);}
    }catch{}
  },[]);
  const handleSession=useCallback((value:PaymentSession|null)=>{
    setHasIntent(!!value);
    if(!value){
      setResume(null);setCheckoutOpen(false);setSelection(undefined);setPaymentBusy(false);setStage('payment');return;
    }
    if(value?.terms?.code&&value.terms?.billing_cycle){
      const terms=value.terms;
      setSelection({cycle:terms.billing_cycle,offer:{code:terms.code,name:terms.name,description:'',max_children:terms.max_children,
        version:terms.version,trial_days:0,monthly_price:terms.billing_cycle==='monthly'?String(terms.price):null,
        six_month_price:terms.billing_cycle==='six_month'?String(terms.price):null,
        annual_price:terms.billing_cycle==='annual'?String(terms.price):null,available:true}});
    }
  },[]);
  const handleStage=useCallback((value:EnrollmentStage)=>setStage(value),[]);
  return <PricingPage onChoose={(offer,cycle)=>{setSelection({offer,cycle});setCheckoutOpen(true);setStage('payment');}}
    selectedTerms={selection} checkoutStage={stage}
    onBackToPlans={checkoutOpen&&!hasIntent&&!paymentBusy?()=>{setCheckoutOpen(false);setSelection(undefined);}:undefined}
    checkout={checkoutOpen?<EnrollmentCheckout selection={selection} resume={resume} onSession={handleSession} onStage={handleStage} onBusyChange={setPaymentBusy}/>:undefined}/>;
}
