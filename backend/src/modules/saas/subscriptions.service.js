'use strict';
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const validate = (schema, body) => {
  const { error, value } = schema.validate(body, { abortEarly: false });
  if (error) throw fail(error.details.map(d => d.message).join('. '));
  return value;
};
const packageSchema = Joi.object({
  version: Joi.number().integer().min(1).required(),
  name: Joi.string().trim().min(2).max(80).required(), description: Joi.string().trim().min(12).max(300).required(),
  max_children: Joi.number().integer().min(1).max(1000).required(), trial_days: Joi.number().integer().min(1).max(180).required(),
  monthly_price: Joi.number().min(0).max(9999999999).precision(2).allow(null).required(),
  annual_price: Joi.number().min(0).max(9999999999).precision(2).allow(null).required(),
  available: Joi.boolean().required(), reason: Joi.string().trim().min(12).max(1000).required(),
});
const actionSchema = Joi.object({
  action: Joi.string().valid('renew', 'extend_trial', 'change_package', 'cancel', 'resume').required(),
  version: Joi.number().integer().min(1).required(), request_key: Joi.string().pattern(/^[a-zA-Z0-9_-]{16,100}$/).required(),
  reason: Joi.string().trim().min(12).max(1000).required(),
  days: Joi.number().integer().min(1).max(180).when('action', { is: 'extend_trial', then: Joi.required(), otherwise: Joi.forbidden() }),
  package_code: Joi.string().valid('standard','premium').when('action', { is: 'change_package', then: Joi.required(), otherwise: Joi.forbidden() }),
  billing_cycle: Joi.string().valid('monthly','annual').when('action', { is: 'change_package', then: Joi.required(), otherwise: Joi.forbidden() }),
  amount: Joi.number().min(0).max(9999999999).precision(2).when('action', { is: 'renew', then: Joi.required(), otherwise: Joi.forbidden() }),
  payment_reference: Joi.string().trim().min(4).max(150).when('action', { is: 'renew', then: Joi.required(), otherwise: Joi.forbidden() }),
});
const termsFor = (offer, cycle) => ({ code: offer.code, name: offer.name, version: offer.version,
  billing_cycle: cycle, price: offer[cycle === 'annual' ? 'annual_price' : 'monthly_price'],
  currency: 'ETB', max_children: offer.max_children, trial_days: offer.trial_days });
function stateOf(row, now = Date.now()) {
  if (row.subscription_status === 'cancelled') return 'cancelled';
  const end = row.subscription_status === 'active' ? row.subscription_ends_at : row.trial_ends_at;
  return end && new Date(end).getTime() <= now ? 'expired' : row.subscription_status;
}
async function transaction(pool, work) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
function createSubscriptions(pool) {
  const catalog = async (all = false) => (await pool.query(`SELECT * FROM subscription_packages ${all ? '' : 'WHERE available'} ORDER BY max_children,code`)).rows;
  async function updatePackage(code, body, actorId) {
    const input = validate(packageSchema, body);
    return transaction(pool, async c => {
      const { rows } = await c.query(`UPDATE subscription_packages SET name=$2,description=$3,max_children=$4,trial_days=$5,
        monthly_price=$6,annual_price=$7,available=$8,updated_at=NOW() WHERE code=$1 AND version=$9 RETURNING *`,
      [code,input.name,input.description,input.max_children,input.trial_days,input.monthly_price,input.annual_price,input.available,input.version]);
      if (!rows[0]) throw fail('Package changed in another view. Refresh and review its current terms.',409);
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,metadata) VALUES($1,'PACKAGE_UPDATED','subscription_packages',$2)`,
        [actorId,JSON.stringify({code,reason:input.reason,terms:rows[0]})]);
      return rows[0];
    });
  }
  async function summary(id) {
    const row = (await pool.query(`SELECT id,name,status,subscription_plan,billing_cycle,subscription_status,subscription_terms,
      trial_ends_at,subscription_ends_at,max_children,version FROM daycares WHERE id=$1`,[id])).rows[0];
    if (!row) throw fail('Daycare not found.',404);
    const history = (await pool.query(`SELECT e.id,e.action,e.reason,e.details,e.created_at,COALESCE(u.name,'Account #'||e.actor_id) AS actor_name
      FROM subscription_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.daycare_id=$1 ORDER BY e.id DESC LIMIT 100`,[id])).rows;
    return {...row,effective_status:row.status==='pending'?'awaiting_review':stateOf(row),history,
      expiry_policy:'During the project pilot, expiry requires renewal review and does not interrupt child care or safe pickup.',
      payment_method:'Manual confirmation; no automatic charges'};
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
          `SELECT id, name, status, subscription_plan, subscription_status, subscription_terms, billing_cycle, trial_ends_at, max_children
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
        status: isApprovedOrActive ? 'active' : appRow.status,
        effective_status: appRow.status === 'pending' ? 'awaiting_review' : (isApprovedOrActive ? 'active' : appRow.status),
        review_reason: appRow.rejection_reason || (appRow.status === 'rejected' ? 'Application not approved.' : null),
        created_daycare_id: appRow.created_daycare_id,
        created_at: appRow.created_at,
        expiry_policy: 'During the project pilot, applications are reviewed manually by Super Admin.',
        payment_method: 'Manual confirmation; no automatic charges',
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
    const hash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return transaction(pool, async c => {
      const row = (await c.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!row) throw fail('Daycare not found.',404);
      const prior=(await c.query('SELECT * FROM subscription_events WHERE daycare_id=$1 AND request_key=$2',[id,input.request_key])).rows[0];
      if(prior) { if(prior.details.request_hash!==hash) throw fail('This request key was already used for different terms.',409); return {replayed:true,event:prior}; }
      if(row.version!==input.version) throw fail('Subscription changed in another view. Refresh before saving.',409);
      if(!['active','suspended'].includes(row.status)) throw fail('Approve the daycare before managing its subscription.',409);
      let patch={}, before={plan:row.subscription_plan,status:stateOf(row),terms:row.subscription_terms,trial_ends_at:row.trial_ends_at,subscription_ends_at:row.subscription_ends_at};
      if(input.action==='extend_trial') {
        if(row.subscription_status!=='trialing') throw fail('Only a trial subscription can be extended.',409);
        const end = new Date(Math.max(Date.now(),new Date(row.trial_ends_at || 0).getTime())+input.days*86400000);
        patch={trial_ends_at:end};
      } else if(input.action==='renew') {
        if(row.subscription_status==='cancelled') throw fail('Resume the subscription before recording renewal.',409);
        const price=row.subscription_terms?.price;
        if(price===null || price===undefined) throw fail('Agree a priced package before recording a renewal.');
        if(Math.round(Number(price)*100)!==Math.round(input.amount*100)) throw fail('Payment amount must match the accepted package price.');
        const duplicate=await c.query("SELECT id FROM subscription_events WHERE action='renew' AND details->>'payment_reference'=$1",[input.payment_reference]);
        if(duplicate.rows.length) throw fail('This payment reference is already recorded.',409);
        // References are globally unique, including simultaneous renewals on different centers.
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`subscription-payment:${input.payment_reference}`]);
        if((await c.query("SELECT id FROM subscription_events WHERE action='renew' AND details->>'payment_reference'=$1",[input.payment_reference])).rows.length) throw fail('This payment reference is already recorded.',409);
        const base=new Date(Math.max(Date.now(),new Date(row.subscription_status==='active'?row.subscription_ends_at:row.trial_ends_at || 0).getTime()));
        // Clamp month/year anniversaries (e.g. January 31 -> February 28).
        const day=base.getUTCDate();base.setUTCDate(1);base.setUTCMonth(base.getUTCMonth()+(row.billing_cycle==='annual'?12:1));
        const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();base.setUTCDate(Math.min(day,last));
        patch={subscription_status:'active',subscription_ends_at:base};
      } else if(input.action==='change_package') {
        const offer=(await c.query('SELECT * FROM subscription_packages WHERE code=$1 AND available FOR SHARE',[input.package_code])).rows[0];
        if(!offer) throw fail('Selected package is unavailable.');
        const active=Number((await c.query('SELECT COALESCE(active_child_count,0) AS n FROM platform_child_census() WHERE daycare_id=$1',[id])).rows[0]?.n || 0);
        if(active>offer.max_children) throw fail('Active enrollment exceeds the selected package capacity.',409);
        if(row.subscription_status==='active' && row.subscription_ends_at && new Date(row.subscription_ends_at)>new Date()) throw fail('Change package after the paid period ends. Existing paid terms are preserved.',409);
        patch={subscription_plan:offer.code,billing_cycle:input.billing_cycle,subscription_terms:termsFor(offer,input.billing_cycle),max_children:offer.max_children};
      } else if(input.action==='cancel') {
        if(row.subscription_status==='cancelled') throw fail('Subscription is already cancelled.',409);
        patch={subscription_status:'cancelled'};
      } else {
        if(row.subscription_status!=='cancelled') throw fail('Only a cancelled subscription can be resumed.',409);
        patch={subscription_status:row.subscription_ends_at?'active':'trialing'};
      }
      const entries=Object.entries(patch),params=[id,...entries.map(([,v])=>v)];
      const saved=(await c.query(`UPDATE daycares SET ${entries.map(([k],i)=>`${k}=$${i+2}`).join(',')},updated_at=NOW() WHERE id=$1 RETURNING *`,params)).rows[0];
      const details={request_hash:hash,before,after:{plan:saved.subscription_plan,status:stateOf(saved),terms:saved.subscription_terms,trial_ends_at:saved.trial_ends_at,subscription_ends_at:saved.subscription_ends_at},
        ...(input.action==='renew'?{amount:input.amount,currency:'ETB',payment_reference:input.payment_reference,method:'manual_confirmation'}:{})};
      const event=(await c.query(`INSERT INTO subscription_events(daycare_id,actor_id,action,reason,details,request_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[id,actorId,input.action,input.reason,details,input.request_key])).rows[0];
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,target_id,daycare_id,metadata) VALUES($1,$2,'daycares',$3,$3,$4)`,[actorId,`SUBSCRIPTION_${input.action.toUpperCase()}`,id,JSON.stringify({event_id:event.id,reason:input.reason})]);
      return {event};
    });
  }
  return {catalog,updatePackage,summary,applicationStatus,action};
}
module.exports={createSubscriptions,termsFor,stateOf};
