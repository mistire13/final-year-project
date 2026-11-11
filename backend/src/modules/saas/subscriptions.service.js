'use strict';
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const {catalogFeatures,FEATURE_POLICY_VERSION,sameFeatureTerms,getDaycareFeatures}=require('./package-features');
const changes=require('./subscription-changes');
const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const validate = (schema, body) => {
  const { error, value } = schema.validate(body, { abortEarly: false });
  if (error) throw fail(error.details.map(d => d.message).join('. '));
  return value;
};
const packageSchema = Joi.object({
  version: Joi.number().integer().min(1).required(),
  name: Joi.string().trim().min(2).max(80).required(), description: Joi.string().trim().min(12).max(300).required(),
  max_children: Joi.number().integer().min(1).max(1000).required(), trial_days: Joi.number().integer().min(1).max(180).optional(),
  monthly_price: Joi.number().min(0).max(9999999999).precision(2).allow(null).required(),
  six_month_price: Joi.number().min(0).max(9999999999).precision(2).allow(null).required(),
  annual_price: Joi.number().min(0).max(9999999999).precision(2).allow(null).required(),
  available: Joi.boolean().required(), reason: Joi.string().trim().min(12).max(1000).required(),
});
const actionSchema = Joi.object({
  action: Joi.string().valid('change_package', 'cancel_package_change', 'cancel', 'resume', 'renew', 'extend_trial').required(),
  version: Joi.number().integer().min(1).required(), request_key: Joi.string().pattern(/^[a-zA-Z0-9_-]{16,100}$/).required(),
  reason: Joi.string().trim().min(12).max(1000).required(),
  package_code: Joi.string().valid('standard','premium').when('action', { is: 'change_package', then: Joi.required(), otherwise: Joi.forbidden() }),
  billing_cycle: Joi.string().valid('monthly','six_month','annual').when('action', { is: 'change_package', then: Joi.required(), otherwise: Joi.forbidden() }),
  terms_version: Joi.number().integer().min(1).when('action', { is: 'change_package', then: Joi.required(), otherwise: Joi.forbidden() }),
});
const termsFor = (offer, cycle) => ({ code: offer.code, name: offer.name, version: offer.version,
  billing_cycle: cycle, price: offer[cycle === 'annual' ? 'annual_price' : cycle === 'six_month' ? 'six_month_price' : 'monthly_price'],
  currency: 'ETB', max_children: offer.max_children,features:catalogFeatures(offer.code),feature_policy_version:FEATURE_POLICY_VERSION });
function addBillingPeriod(value, cycle, anchor = value) {
  const months = { monthly: 1, six_month: 6, annual: 12 }[cycle];
  if (!months) throw fail('Invalid billing period.');
  // Addis Ababa uses UTC+03:00. Preserve the local time and clamp the day.
  const date = new Date(new Date(value).getTime() + 3 * 3600000);
  const day = new Date(new Date(anchor).getTime() + 3 * 3600000).getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return new Date(date.getTime() - 3 * 3600000);
}
function stateOf(row, now = Date.now()) {
  if (row.subscription_status === 'cancelled') return 'cancelled';
  const end = row.subscription_status === 'active' ? row.subscription_ends_at : row.trial_ends_at;
  return end && new Date(end).getTime() <= now ? 'expired' : row.subscription_status;
}
function matchesRenewalTerms(current, payment) {
  return !!current && !!payment && current.code === payment.code && current.name === payment.name &&
    Number(current.version) === Number(payment.version) && Number(current.max_children) === Number(payment.max_children) &&
    current.billing_cycle === payment.billing_cycle && current.currency === payment.currency &&
    String(current.price) === String(payment.price) && sameFeatureTerms(current,payment);
}

// Caller locks daycare first, then intent. Used by payment verification so
// successful verification and renewal are committed together when possible.
async function applyRenewalLocked(c, row, intent, actorId, {restartOverdue = false, reason = 'Verified subscription payment',now=new Date()} = {}) {
  const id = row.id;
  if(intent.subscription_change_id)return changes.applyScheduledLocked(c,row,intent,actorId,{now});
  if (intent.status === 'consumed') return {replayed:true, subscription_ends_at:row.subscription_ends_at};
  if (intent.status !== 'verified' || !intent.payment_reference) throw fail('Payment must be verified before renewal.',409);
  if(await changes.openChange(c,id,true))throw fail('Resolve the scheduled package change before applying a different renewal.',409);
  if(intent.renewal_period_start&&!changes.sameTime(intent.renewal_period_start,row.subscription_ends_at))throw fail('This payment belongs to an earlier renewal period. Contact the operator to resolve it.',409);
  if (row.subscription_status === 'cancelled') throw fail('Resume the subscription before renewal.',409);
  if (!row.subscription_ends_at || !row.subscription_started_at || !row.subscription_terms) throw fail('Subscription terms require operator review before renewal.',409);
  if (!matchesRenewalTerms(row.subscription_terms, intent.terms) ||
      Number(intent.amount) !== Number(row.subscription_terms.price) || intent.currency !== row.subscription_terms.currency) {
    throw fail('Payment terms no longer match this subscription. Contact the platform operator.',409);
  }
  let started = row.subscription_started_at;
  let ends = addBillingPeriod(row.subscription_ends_at, row.billing_cycle, started);
  let restarted = false;
  if (ends.getTime() <= Date.now()) {
    const auth = row.renewal_restart_authorization;
    const agreedBeforePayment = !!intent.restart_authorization_id && auth?.id === intent.restart_authorization_id &&
      auth.intent_id === intent.id && Number.isFinite(Date.parse(auth.expires_at)) && Date.parse(auth.expires_at) > Date.now() &&
      matchesRenewalTerms(auth.terms,intent.terms);
    if (!restartOverdue && !agreedBeforePayment) throw fail('This subscription is overdue by more than one billing period. Contact the platform operator.',409);
    started = new Date();
    ends = addBillingPeriod(started, row.billing_cycle, started);
    restarted = true;
  }
  if (!actorId) throw fail('Renewal requires an active administrator or operator for audit.',409);
  await c.query("UPDATE daycares SET subscription_status='active',subscription_ends_at=$2,subscription_started_at=$3,renewal_restart_authorization=NULL,updated_at=NOW() WHERE id=$1", [id,ends,started]);
  await c.query("UPDATE subscription_payment_intents SET status='consumed',updated_at=NOW(),version=version+1 WHERE id=$1", [intent.id]);
  const details={payment_intent_id:intent.id,payment_reference:intent.payment_reference,amount:intent.amount,
    currency:intent.currency,previous_end:row.subscription_ends_at,ends_at:ends,restarted_overdue:restarted};
  const event=(await c.query(`INSERT INTO subscription_events(daycare_id,actor_id,action,reason,details,request_key)
    VALUES($1,$2,'renew',$3,$4,$5) RETURNING *`,[id,actorId,reason,JSON.stringify(details),`payment-${intent.id}`])).rows[0];
  await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,target_id,daycare_id,metadata)
    VALUES($1,'SUBSCRIPTION_RENEW','daycares',$2,$2,$3)`,[actorId,id,JSON.stringify({event_id:event.id,payment_intent_id:intent.id,reason})]);
  return {event,subscription_ends_at:ends};
}
async function transaction(pool, work) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
function createSubscriptions(pool,options={}) {
  const catalog = async (all = false) => (await pool.query(`SELECT * FROM subscription_packages ${all ? '' : 'WHERE available'} ORDER BY max_children,code`)).rows.map(offer=>({...offer,features:catalogFeatures(offer.code),feature_policy_version:FEATURE_POLICY_VERSION}));
  async function updatePackage(code, body, actorId) {
    const input = validate(packageSchema, body);
    return transaction(pool, async c => {
      const { rows } = await c.query(`UPDATE subscription_packages SET name=$2,description=$3,max_children=$4,
        monthly_price=$5,six_month_price=$6,annual_price=$7,available=$8,updated_at=NOW() WHERE code=$1 AND version=$9 RETURNING *`,
      [code,input.name,input.description,input.max_children,input.monthly_price,input.six_month_price,input.annual_price,input.available,input.version]);
      if (!rows[0]) throw fail('Package changed in another view. Refresh and review its current terms.',409);
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,metadata) VALUES($1,'PACKAGE_UPDATED','subscription_packages',$2)`,
        [actorId,JSON.stringify({code,reason:input.reason,terms:rows[0]})]);
      return rows[0];
    });
  }
  async function summary(id) {
    await activateDueChange(id);
    const row = (await pool.query(`SELECT id,name,status,subscription_plan,billing_cycle,subscription_status,subscription_terms,
      trial_ends_at,subscription_ends_at,subscription_started_at,renewal_restart_authorization,max_children,version FROM daycares WHERE id=$1`,[id])).rows[0];
    if (!row) throw fail('Daycare not found.',404);
    const history = (await pool.query(`SELECT e.id,e.action,e.reason,e.details,e.created_at,COALESCE(u.name,'Account #'||e.actor_id) AS actor_name
      FROM subscription_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.daycare_id=$1 ORDER BY e.id DESC LIMIT 100`,[id])).rows;
    const eligible = row.status === 'active' && row.subscription_status === 'active' && !!row.subscription_terms &&
      !!row.subscription_ends_at && !!row.subscription_started_at && ['monthly','six_month','annual'].includes(row.billing_cycle) &&
      addBillingPeriod(row.subscription_ends_at,row.billing_cycle,row.subscription_started_at).getTime() <= Date.now();
    const scheduled=(await pool.query(`SELECT ch.*,i.status AS payment_status,i.payment_reference FROM subscription_package_changes ch
      LEFT JOIN subscription_payment_intents i ON i.id=ch.payment_intent_id WHERE ch.daycare_id=$1 AND ch.status IN ('awaiting_payment','paid','blocked') ORDER BY ch.created_at DESC LIMIT 1`,[id])).rows[0]||null;
    return {...row,...await getDaycareFeatures(pool,id),scheduled_change:scheduled,renewal_restart_eligible:!!eligible,effective_status:row.status==='pending'?'awaiting_review':stateOf(row),history,
      expiry_policy:'After expiry, care and pickup remain available while other operations are read-only until renewal.',
      payment_method:'Pay each period and submit a reference for verification; no automatic charges'};
  }
  async function authorizeRenewalRestart(id, body, actorId) {
    const input = validate(Joi.object({version:Joi.number().integer().min(1).required(),
      reason:Joi.string().trim().min(12).max(1000).required(),acknowledge_restart:Joi.boolean().valid(true).required()}),body);
    return transaction(pool, async c => {
      const row=(await c.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!row || row.deleted_at) throw fail('Daycare not found.',404);
      if (row.version !== input.version) throw fail('Subscription changed. Refresh before agreeing to restart.',409);
      if (row.status !== 'active' || row.subscription_status !== 'active' || !row.subscription_terms ||
          !row.subscription_started_at || !row.subscription_ends_at ||
          addBillingPeriod(row.subscription_ends_at,row.billing_cycle,row.subscription_started_at).getTime() > Date.now()) {
        throw fail('Only an active center overdue by at least one full billing period can restart.',409);
      }
      const prior = row.renewal_restart_authorization;
      if (prior?.intent_id) {
        const existing=(await c.query('SELECT status,expires_at,payment_reference FROM subscription_payment_intents WHERE id=$1 FOR UPDATE',[prior.intent_id])).rows[0];
        if (existing && (existing.status === 'verified' ||
            (existing.status === 'verification_pending' && existing.payment_reference) ||
            (['pending','verification_pending'].includes(existing.status) && new Date(existing.expires_at).getTime() > Date.now()))) {
          throw fail('An existing payment needs to be completed or resolved before a new restart agreement.',409);
        }
      }
      const now=new Date();
      const authorization={id:crypto.randomUUID(),terms:row.subscription_terms,actor_id:actorId,reason:input.reason,
        created_at:now.toISOString(),expires_at:new Date(now.getTime()+7*86400000).toISOString(),intent_id:null};
      const saved=(await c.query('UPDATE daycares SET renewal_restart_authorization=$2,updated_at=NOW() WHERE id=$1 RETURNING version',
        [id,JSON.stringify(authorization)])).rows[0];
      await c.query(`INSERT INTO subscription_events(daycare_id,actor_id,action,reason,details,request_key)
        VALUES($1,$2,'renewal_restart_authorized',$3,$4,$5)`,[id,actorId,input.reason,JSON.stringify({authorization_id:authorization.id,expires_at:authorization.expires_at,terms:authorization.terms}),`restart-${authorization.id}`]);
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,target_id,daycare_id,metadata)
        VALUES($1,'SUBSCRIPTION_RESTART_AUTHORIZED','daycares',$2,$2,$3)`,[actorId,id,JSON.stringify({authorization_id:authorization.id,reason:input.reason,expires_at:authorization.expires_at})]);
      return {authorization,version:saved.version,message:'Restart agreed. Access remains restricted until payment is confirmed.'};
    });
  }
  async function applicationStatus(body) {
    const input = validate(Joi.object({email:Joi.string().email({tlds:{allow:false}}).max(255).required(),password:Joi.string().max(200).required()}),body);
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Check daycare_applications staging table first
    const appRow = (await pool.query(
      `SELECT id, daycare_name, admin_name, admin_email, password_hash, requested_plan, status, rejection_reason, created_daycare_id, created_at
       FROM daycare_applications
       WHERE lower(admin_email) = $1
       ORDER BY id DESC LIMIT 1`,
      [normalizedEmail]
    )).rows[0];

    if (appRow) {
      const valid = await bcrypt.compare(input.password, appRow.password_hash);
      if (!valid) throw fail('Application credentials could not be verified.', 401);

      let daycareData = null;
      if (appRow.created_daycare_id) {
        daycareData = (await pool.query(
          `SELECT id, name, status, deleted_at, subscription_plan, subscription_status, subscription_terms, billing_cycle, trial_ends_at, max_children
           FROM daycares WHERE id = $1`,
          [appRow.created_daycare_id]
        )).rows[0];
      }

      const isApprovedOrActive = appRow.status === 'approved' || (daycareData && daycareData.status === 'active');

      return {
        id: appRow.created_daycare_id || appRow.id,
        application_id: appRow.id,
        name: daycareData?.name || appRow.daycare_name,
        daycare_name: daycareData?.name || appRow.daycare_name,
        admin_name: appRow.admin_name,
        admin_email: appRow.admin_email,
        requested_plan: daycareData?.subscription_plan || appRow.requested_plan || 'standard',
        subscription_terms: daycareData?.subscription_terms || null,
        billing_cycle: daycareData?.billing_cycle || 'monthly',
        trial_ends_at: daycareData?.trial_ends_at || null,
        max_children: daycareData?.max_children || 50,
        status: daycareData?.deleted_at ? 'deleted' : (daycareData?.status || appRow.status),
        effective_status: daycareData?.deleted_at ? 'deleted' : (daycareData?.status || (appRow.status === 'pending' ? 'awaiting_review' : (isApprovedOrActive ? 'active' : appRow.status))),
        review_reason: appRow.rejection_reason || (appRow.status === 'rejected' ? 'Application not approved.' : null),
        created_daycare_id: appRow.created_daycare_id,
        created_at: appRow.created_at,
        expiry_policy: 'Applications are reviewed by a Super Administrator after payment confirmation.',
        payment_method: 'Reference verification or operator review; no automatic charges',
      };
    }

    // 2. Legacy check: users u JOIN daycares d
    const row = (await pool.query(`SELECT u.password_hash,d.id,d.name,d.status,d.requested_plan,d.subscription_terms,d.billing_cycle,d.trial_ends_at
      FROM users u JOIN daycares d ON d.id=u.daycare_id WHERE lower(u.email)=$1 AND u.role_id=1`,[normalizedEmail])).rows[0];
    const valid = await bcrypt.compare(input.password,row?.password_hash || '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
    if (!row || !valid) throw fail('Application credentials could not be verified.',401);
    const {password_hash,...safe} = row;
    if(row.status==='rejected') {
      safe.review_reason=(await pool.query("SELECT metadata->>'reason' AS reason FROM audit_logs WHERE daycare_id=$1 AND action='DAYCARE_REJECTED' ORDER BY id DESC LIMIT 1",[row.id])).rows[0]?.reason || 'Please contact Ankelba support for the review decision.';
    }
    return safe;
  }
  async function action(id, body, actorId) {
    const input = validate(actionSchema,body);
    if (input.action === 'renew') throw fail('Renew through a verified subscription payment.', 409);
    if (input.action === 'extend_trial') throw fail('Free trials are no longer offered.', 409);
    const hash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return transaction(pool, async c => {
      const row = (await c.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!row) throw fail('Daycare not found.',404);
      if (row.deleted_at) throw fail('Deleted daycares cannot change subscription.',409);
      const prior=(await c.query('SELECT * FROM subscription_events WHERE daycare_id=$1 AND request_key=$2',[id,input.request_key])).rows[0];
      if(prior) { if(prior.details.request_hash!==hash) throw fail('This request key was already used for different terms.',409); return {replayed:true,event:prior}; }
      if(row.version!==input.version) throw fail('Subscription changed in another view. Refresh before saving.',409);
      if(!['active','suspended'].includes(row.status)) throw fail('Approve the daycare before managing its subscription.',409);
      if(input.action==='cancel_package_change')return changes.cancelLocked(c,row,input,actorId,hash);
      let patch={}, before={plan:row.subscription_plan,status:stateOf(row),terms:row.subscription_terms,trial_ends_at:row.trial_ends_at,subscription_ends_at:row.subscription_ends_at};
      if(input.action==='change_package') {
        const offer=(await c.query('SELECT * FROM subscription_packages WHERE code=$1 AND available FOR SHARE',[input.package_code])).rows[0];
        if(!offer) throw fail('Selected package is unavailable.');
        if(offer.version!==input.terms_version) throw fail('Package terms changed. Refresh and review the current price before agreeing.',409);
        if(row.subscription_ends_at&&Date.parse(row.subscription_ends_at)>Date.now())return changes.scheduleLocked(c,row,termsFor(offer,input.billing_cycle),input,actorId,hash);
        if(await changes.openChange(c,id,true)||await changes.conflictingPayment(c,id))throw fail('Complete or resolve existing future terms and renewal payments first.',409);
        const active=Number((await c.query('SELECT COALESCE(active_child_count,0) AS n FROM platform_child_census() WHERE daycare_id=$1',[id])).rows[0]?.n || 0);
        if(active>offer.max_children) throw fail('Active enrollment exceeds the selected package capacity.',409);
        patch={subscription_plan:offer.code,billing_cycle:input.billing_cycle,subscription_terms:termsFor(offer,input.billing_cycle),max_children:offer.max_children};
      } else if(input.action==='cancel') {
        if(await changes.openChange(c,id,true))throw fail('Resolve or cancel the scheduled package change before cancelling renewal.',409);
        if(row.subscription_status==='cancelled') throw fail('Subscription is already cancelled.',409);
        patch={subscription_status:'cancelled'};
      } else {
        if(row.subscription_status!=='cancelled') throw fail('Only a cancelled subscription can be resumed.',409);
        patch={subscription_status:row.subscription_ends_at?'active':'trialing'};
      }
      const entries=Object.entries(patch),params=[id,...entries.map(([,v])=>v)];
      const saved=(await c.query(`UPDATE daycares SET ${entries.map(([k],i)=>`${k}=$${i+2}`).join(',')},updated_at=NOW() WHERE id=$1 RETURNING *`,params)).rows[0];
      const details={request_hash:hash,before,after:{plan:saved.subscription_plan,status:stateOf(saved),terms:saved.subscription_terms,trial_ends_at:saved.trial_ends_at,subscription_ends_at:saved.subscription_ends_at}};
      const event=(await c.query(`INSERT INTO subscription_events(daycare_id,actor_id,action,reason,details,request_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[id,actorId,input.action,input.reason,details,input.request_key])).rows[0];
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,target_id,daycare_id,metadata) VALUES($1,$2,'daycares',$3,$3,$4)`,[actorId,`SUBSCRIPTION_${input.action.toUpperCase()}`,id,JSON.stringify({event_id:event.id,reason:input.reason})]);
      return {event};
    });
  }
  async function applyVerifiedRenewal(id, intentId, actorId, options = {}) {
    return transaction(pool, async c => {
      const row = (await c.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row || row.deleted_at) throw fail('Daycare not found.',404);
      const intent = (await c.query('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE', [intentId])).rows[0];
      if (!intent || Number(intent.daycare_id)!==Number(id)) throw fail('Payment not found.',404);
      if (intent.status !== 'consumed' && options.expectedVersion !== undefined && intent.version !== options.expectedVersion) throw fail('Payment changed. Refresh before applying.',409);
      return applyRenewalLocked(c,row,intent,actorId,options);
    });
  }
  async function activateDueChange(id){return transaction(pool,async c=>{
    const now=options.now?.()||new Date();
    const row=(await c.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)return null;
    const change=await changes.openChange(c,id,true);
    if(!change?.payment_intent_id||!['paid','blocked'].includes(change.status)||Date.parse(change.effective_at)>now.getTime())return null;
    const intent=(await c.query('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE',[change.payment_intent_id])).rows[0];
    if(!intent||intent.status!=='verified')return null;
    return changes.applyScheduledLocked(c,row,intent,change.created_by,{now});
  });}
  return {catalog,updatePackage,summary,applicationStatus,action,applyVerifiedRenewal,authorizeRenewalRestart,activateDueChange};
}
module.exports={createSubscriptions,termsFor,stateOf,addBillingPeriod,matchesRenewalTerms,applyRenewalLocked};
