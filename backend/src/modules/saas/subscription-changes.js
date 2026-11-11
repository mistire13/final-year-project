'use strict';
const crypto=require('node:crypto');
const {sameFeatureTerms}=require('./package-features');
const fail=(message,statusCode=409)=>Object.assign(new Error(message),{statusCode});
const sameTime=(a,b)=>!!a&&!!b&&new Date(a).getTime()===new Date(b).getTime();
async function openChange(c,daycareId,lock=false){return (await c.query(`SELECT * FROM subscription_package_changes WHERE daycare_id=$1 AND status IN ('awaiting_payment','paid','blocked')${lock?' FOR UPDATE':''}`,[daycareId])).rows[0]||null;}
async function conflictingPayment(c,daycareId){return (await c.query(`SELECT id,status FROM subscription_payment_intents WHERE daycare_id=$1 AND application_id IS NULL
  AND (status='verified' OR status='verification_pending' AND payment_reference IS NOT NULL OR status IN ('pending','verification_pending') AND expires_at>NOW()) LIMIT 1`,[daycareId])).rows[0];}
async function event(c,daycareId,actorId,action,reason,details,key){
  const row=(await c.query('INSERT INTO subscription_events(daycare_id,actor_id,action,reason,details,request_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[daycareId,actorId,action,reason,JSON.stringify(details),key])).rows[0];
  await c.query("INSERT INTO audit_logs(actor_id,action,target_table,target_id,daycare_id,metadata) VALUES($1,$2,'daycares',$3,$3,$4)",[actorId,`SUBSCRIPTION_${action.toUpperCase()}`,daycareId,JSON.stringify({event_id:row.id,...details,reason})]);return row;
}
async function scheduleLocked(c,row,terms,input,actorId,hash){
  if(row.status!=='active'||row.subscription_status!=='active'||!row.subscription_terms||!row.subscription_started_at||!(Date.parse(row.subscription_ends_at)>Date.now()))throw fail('Schedule a package change during an active paid period.');
  if(await openChange(c,row.id,true))throw fail('A future package change is already open. Complete or cancel it first.');
  if(await conflictingPayment(c,row.id))throw fail('Complete or resolve the existing renewal payment before changing future terms.');
  if(!Number.isFinite(Number(terms.price))||Number(terms.price)<=0)throw fail('Configure a positive price before agreeing future terms.',422);
  const change=(await c.query(`INSERT INTO subscription_package_changes(id,daycare_id,terms,effective_at,created_by,reason,request_key,request_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[crypto.randomUUID(),row.id,JSON.stringify(terms),row.subscription_ends_at,actorId,input.reason,input.request_key,hash])).rows[0];
  // Bump the daycare's version without changing its existing paid promise.
  await c.query('UPDATE daycares SET updated_at=NOW() WHERE id=$1',[row.id]);
  const recorded=await event(c,row.id,actorId,'package_change_scheduled',input.reason,{request_hash:hash,change_id:change.id,terms,effective_at:change.effective_at},input.request_key);
  return {event:recorded,scheduled_change:change};
}
async function cancelLocked(c,row,input,actorId,hash){
  const change=await openChange(c,row.id,true);if(!change)throw fail('No future package change is open.');
  if(change.payment_intent_id){
    const payment=(await c.query('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE',[change.payment_intent_id])).rows[0];
    if(payment&&(['verified','consumed'].includes(payment.status)||payment.status==='verification_pending'&&payment.payment_reference))throw fail('Confirmed or submitted money must be resolved before cancelling its package change.');
    if(payment&&['pending','verification_pending'].includes(payment.status))await c.query("UPDATE subscription_payment_intents SET status='rejected',review_reason=$2,version=version+1,updated_at=NOW() WHERE id=$1",[payment.id,input.reason]);
  }
  const saved=(await c.query("UPDATE subscription_package_changes SET status='cancelled',cancel_reason=$2,cancelled_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *",[change.id,input.reason])).rows[0];
  await c.query('UPDATE daycares SET updated_at=NOW() WHERE id=$1',[row.id]);
  return {scheduled_change:saved,event:await event(c,row.id,actorId,'package_change_cancelled',input.reason,{request_hash:hash,change_id:change.id},input.request_key)};
}
async function applyScheduledLocked(c,row,intent,actorId,{now=new Date()}={}){
  const change=(await c.query('SELECT * FROM subscription_package_changes WHERE id=$1 AND daycare_id=$2 FOR UPDATE',[intent.subscription_change_id,row.id])).rows[0];
  if(!change||change.payment_intent_id!==intent.id)throw fail('Payment is not bound to this future package change.');
  if(change.status==='activated'&&intent.status==='consumed')return {replayed:true,scheduled_change:change,subscription_ends_at:row.subscription_ends_at};
  if(change.status==='cancelled'||intent.status!=='verified'||!intent.payment_reference)throw fail('Future package payment is not available for activation.');
  const terms=change.terms;
  if(!sameTime(intent.renewal_period_start,change.effective_at)||!sameTime(row.subscription_ends_at,change.effective_at)||
    !['code','name','version','max_children','billing_cycle','currency','price'].every(k=>String(terms[k])===String(intent.terms?.[k]))||!sameFeatureTerms(terms,intent.terms)||Number(intent.amount)!==Number(terms.price)||intent.currency!==terms.currency)throw fail('Future payment no longer matches its accepted period or terms. Contact the operator.');
  if(Date.parse(change.effective_at)>now.getTime()){
    if(change.status!=='paid')await c.query("UPDATE subscription_package_changes SET status='paid',blocked_reason=NULL,updated_at=NOW() WHERE id=$1",[change.id]);
    return {scheduled:true,scheduled_change:{...change,status:'paid'},effective_at:change.effective_at,subscription_ends_at:row.subscription_ends_at};
  }
  const ends=require('./subscriptions.service').addBillingPeriod(change.effective_at,terms.billing_cycle,change.effective_at);
  const active=Number((await c.query('SELECT COALESCE(active_child_count,0) AS n FROM platform_child_census() WHERE daycare_id=$1',[row.id])).rows[0]?.n||0);
  const blocked=row.deleted_at||row.status!=='active'?'The daycare must be active before activation.':row.subscription_status==='cancelled'?'Resume renewal before activating the paid change.':active>Number(terms.max_children)?'Active enrollment exceeds the accepted next-period capacity.':ends.getTime()<=now.getTime()?'The accepted next period has already ended; operator resolution is required.':null;
  if(blocked){
    if(change.status!=='blocked'||change.blocked_reason!==blocked){
      await c.query("UPDATE subscription_package_changes SET status='blocked',blocked_reason=$2,updated_at=NOW() WHERE id=$1",[change.id,blocked]);
      await event(c,row.id,actorId||change.created_by,'package_change_blocked',blocked,{change_id:change.id,payment_intent_id:intent.id,active_children:active},`change-block-${crypto.randomUUID()}`);
    }
    return {blocked:true,scheduled_change:{...change,status:'blocked',blocked_reason:blocked},message:blocked,subscription_ends_at:row.subscription_ends_at};
  }
  await c.query("UPDATE daycares SET subscription_plan=$2,subscription_terms=$3,billing_cycle=$4,max_children=$5,subscription_started_at=$6,subscription_ends_at=$7,subscription_status='active',renewal_restart_authorization=NULL,legacy_shop_access_until=NULL,updated_at=NOW() WHERE id=$1",[row.id,terms.code,JSON.stringify(terms),terms.billing_cycle,terms.max_children,change.effective_at,ends]);
  await c.query("UPDATE subscription_payment_intents SET status='consumed',version=version+1,updated_at=NOW() WHERE id=$1",[intent.id]);
  const saved=(await c.query("UPDATE subscription_package_changes SET status='activated',blocked_reason=NULL,activated_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *",[change.id])).rows[0];
  const recorded=await event(c,row.id,actorId||change.created_by,'package_change_activated','Verified next-period package payment activated',{change_id:change.id,payment_intent_id:intent.id,payment_reference:intent.payment_reference,amount:intent.amount,currency:intent.currency,terms,previous_end:row.subscription_ends_at,ends_at:ends},`change-activate-${change.id}`);
  return {event:recorded,scheduled_change:saved,subscription_ends_at:ends};
}
module.exports={openChange,conflictingPayment,scheduleLocked,cancelLocked,applyScheduledLocked,sameTime};
