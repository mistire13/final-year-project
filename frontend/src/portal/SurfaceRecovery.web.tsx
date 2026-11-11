import React from 'react';
import {Button,Card,Icon} from './ui.web';
import './portal.css';
import './surface-recovery.css';

export type RecoveryKind='not-found'|'forbidden'|'session-expired'|'subscription-ended'|'payment-unavailable'|'unavailable';
const content:Record<RecoveryKind,{code:string;title:string;message:string}>={
  'not-found':{code:'404',title:'We couldn’t find that page',message:'The address may have changed, or the page is no longer available. Your account and saved payment records are unchanged.'},
  forbidden:{code:'403',title:'This page needs different access',message:'Your signed-in role does not have access to this page. Open your workspace or ask your daycare administrator for help.'},
  'session-expired':{code:'Sign in',title:'Your session needs a fresh sign-in',message:'Sign in again to continue. A missing session does not mean a payment failed; keep your receipt and check its saved status before paying again.'},
  'subscription-ended':{code:'Subscription',title:'Your paid subscription period has ended',message:'Review your subscription and renewal status. Essential care and authorized pickup remain available, along with existing payment records and permitted resolution actions.'},
  'payment-unavailable':{code:'Payment check',title:'We couldn’t confirm the payment yet',message:'Keep the receipt and reference. Retry the status check or contact the receiving daycare/platform team. Do not make another payment just because verification is unavailable.'},
  unavailable:{code:'Try again',title:'This page could not open',message:'Check your connection and try again. Your saved records and payment recovery links remain unchanged.'},
};
export function recoveryWorkspace(path:string){
  if(/^\/(platform|super-admin)(\/|$)/.test(path))return '/super-admin';
  if(/^\/(staff)(\/|$)/.test(path))return '/staff/workspace';
  if(/^\/(caregiver|front-desk)(\/|$)/.test(path))return '/caregiver';
  if(/^\/(admin|login|signin)(\/|$)/.test(path))return '/admin/dashboard';
  if(/^\/(app|parent)(\/|$)/.test(path))return '/app';
  return '/';
}
export default function SurfaceRecovery({kind,message,onRetry,workspaceHref,embedded=false}:{kind:RecoveryKind;message?:string;onRetry?:()=>void;workspaceHref?:string;embedded?:boolean}){
  const copy=content[kind],currentPath=typeof window!=='undefined'?window.location.pathname:'/',workspace=workspaceHref||recoveryWorkspace(currentPath);
  const retryable=['payment-unavailable','unavailable'].includes(kind);
  const chooseSignIn=kind==='session-expired'&&workspace==='/';
  const signIn=kind==='session-expired'&&!chooseSignIn?(workspace==='/super-admin'?'/super-admin':workspace==='/app'?'/app':'/admin/login'):null;
  const Region=embedded?'section':'main';
  return <div className={embedded?'surface-recovery-embedded':'ankelba-portal surface-recovery-root'}>
    <Region className="surface-recovery" aria-labelledby={`recovery-${kind}`}>
      {!embedded&&<a className="surface-recovery-brand" href="/">Ankelba<span>Daycare management</span></a>}
      <Card className="surface-recovery-card"><div className="surface-recovery-symbol" aria-hidden="true"><Icon name={kind==='forbidden'?'shield':retryable?'refresh':'leaf'} size={30}/></div>
        <p className="surface-recovery-code">{copy.code}</p><h1 id={`recovery-${kind}`}>{copy.title}</h1><p role={retryable?'status':undefined}>{message||copy.message}</p>
        <div className="surface-recovery-actions">
          {retryable&&<Button onClick={onRetry||(()=>window.location.reload())}>Try again</Button>}
          {signIn&&<a className="p-button" href={signIn}>Sign in again</a>}
          {chooseSignIn&&<><a className="p-button" href="/app">Parent sign in</a><a className="p-button secondary" href="/admin/login">Staff sign in</a><a className="p-button secondary" href="/super-admin">Platform sign in</a></>}
          {kind==='subscription-ended'&&<a className="p-button" href="/admin/subscription">Review subscription</a>}
          <a className="p-button secondary" href={workspace}>{workspace==='/'?'Return to Ankelba':'Open your workspace'}</a>
        </div>
        {kind==='payment-unavailable'&&<p className="surface-recovery-note">A retry keeps the current address and saved recovery details. It does not initiate a transfer or create another payment.</p>}
      </Card>
    </Region>
  </div>;
}
