'use strict';
const crypto=require('node:crypto');
const Joi=require('joi');
const {requireFeature}=require('../saas/package-features');
const fail=(message,statusCode=422)=>Object.assign(new Error(message),{statusCode});
const fields={
  enabled:Joi.boolean().required(),generate_day:Joi.number().integer().min(1).max(28).required(),due_day:Joi.number().integer().min(Joi.ref('generate_day')).max(28).required(),
  default_fee:Joi.number().positive().max(99999999).precision(2).allow(null).required(),
  discount_percent:Joi.number().min(0).max(99.99).precision(2).required(),discount_reason:Joi.string().trim().max(500).allow('').required(),
  reminder_before_days:Joi.number().integer().min(0).max(30).required(),reminder_after_days:Joi.number().integer().min(0).max(60).required(),
  in_app_reminders:Joi.boolean().required(),email_reminders:Joi.boolean().required(),
};
const schema=Joi.object({...fields,version:Joi.number().integer().min(0).required(),reason:Joi.string().trim().min(12).max(1000).required(),preview_id:Joi.string().guid({version:'uuidv4'}).optional()});
const configKeys=Object.keys(fields);
const validate=body=>{const {value,error}=schema.validate(body,{abortEarly:false});if(error)throw fail(error.details.map(item=>item.message).join('. '));
  if(value.enabled&&!value.default_fee)throw fail('Configure a positive default care fee before enabling automation.');
  if(value.discount_percent>0&&value.discount_reason.trim().length<12)throw fail('Explain the recurring discount in at least 12 characters.');return value;};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const configOf=input=>Object.fromEntries(configKeys.map(key=>[key,input[key]]));
const previewHash=config=>hash({...config,enabled:false});
const defaults={enabled:false,generate_day:1,due_day:10,default_fee:null,discount_percent:0,discount_reason:'',reminder_before_days:3,reminder_after_days:3,in_app_reminders:false,email_reminders:false,version:0};
const localDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const minor=value=>{const text=String(value??'');if(!/^\d+(\.\d{1,2})?$/.test(text))throw fail('A care fee is missing or invalid. Review child fees and the default fee.');const [whole,decimal='']=text.split('.');return BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));};
const decimal=value=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
function discountedFee(base,percent){const fee=minor(base);if(fee<=0n)throw fail('Each automated invoice must have a positive care fee.');const rate=minor(percent);const total=(fee*(10000n-rate)+5000n)/10000n;if(total<=0n)throw fail('The discount would create a zero-value invoice.');return decimal(total);}
async function transaction(pool,work){const c=await pool.connect();try{await c.query('BEGIN');const value=await work(c);await c.query('COMMIT');return value;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
async function admin(c,user){if(user?.role!=='admin'||!Number.isSafeInteger(Number(user.daycare_id)))throw fail('Daycare administrator required.',403);
  const row=(await c.query("SELECT id FROM users WHERE id=$1 AND daycare_id=$2 AND role_id=1 AND status='active'",[user.id,user.daycare_id])).rows[0];if(!row)throw fail('Active daycare administrator required.',403);}
async function audit(c,user,action,metadata){await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,target_id,daycare_id,metadata) VALUES($1,$2,'daycares',$3,$3,$4)`,[user.id,action,user.daycare_id,JSON.stringify(metadata)]);}
async function roster(c,daycareId,config,period){
  if(!config.default_fee)throw fail('Configure a positive default care fee before previewing automation.');
  const rows=(await c.query(`SELECT c.id,c.full_name,c.monthly_care_fee,
    (SELECT gl.user_id FROM guardian_links gl JOIN users u ON u.id=gl.user_id AND u.daycare_id=gl.daycare_id
      WHERE gl.child_id=c.id AND gl.daycare_id=c.daycare_id AND u.status='active' AND u.role_id=3
      ORDER BY CASE WHEN gl.relationship IN ('mother','father','primary_guardian','parent') THEN 0 ELSE 1 END,gl.id LIMIT 1) AS parent_id,
    EXISTS(SELECT 1 FROM child_invoices i WHERE i.daycare_id=c.daycare_id AND i.child_id=c.id AND i.billing_period=$2 AND i.invoice_type='care_fee') AS already_invoiced
    FROM children c WHERE c.daycare_id=$1 AND c.enrollment_status='active' ORDER BY c.id`,[daycareId,period])).rows;
  return rows.map(row=>({...row,base_fee:String(row.monthly_care_fee??config.default_fee),amount:discountedFee(row.monthly_care_fee??config.default_fee,config.discount_percent)}));
}
function createBillingAutomation(pool,options={}){
  const now=options.now??(()=>new Date());
  async function settings(user){await admin(pool,user);await requireFeature(pool,user.daycare_id,'billing_automation');const row=(await pool.query('SELECT * FROM billing_automation_settings WHERE daycare_id=$1',[user.daycare_id])).rows[0];return row||{...defaults};}
  async function preview(body,user){const input=validate(body),config=configOf(input);return transaction(pool,async c=>{
    await admin(c,user);await requireFeature(c,user.daycare_id,'billing_automation');
    const period=localDay(now()).slice(0,7),children=await roster(c,user.daycare_id,config,period),id=crypto.randomUUID();
    await c.query(`INSERT INTO billing_automation_previews(id,daycare_id,actor_id,config_hash,roster_hash,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '10 minutes')`,[id,user.daycare_id,user.id,previewHash(config),hash(children)]);
    const billable=children.filter(child=>!child.already_invoiced),total=billable.reduce((sum,child)=>sum+minor(child.amount),0n);
    return {preview_id:id,billing_period:period,due_date:`${period}-${String(config.due_day).padStart(2,'0')}`,generated_count:billable.length,skipped_count:children.length-billable.length,total_amount:decimal(total),children:children.map(child=>({id:child.id,name:child.full_name,amount:child.amount,already_invoiced:child.already_invoiced,has_parent:!!child.parent_id})),expires_in_minutes:10};
  });}
  async function save(body,user){const input=validate(body),config=configOf(input);return transaction(pool,async c=>{
    await admin(c,user);await requireFeature(c,user.daycare_id,'billing_automation');
    // Serialize the first save as well as subsequent versioned updates.
    await c.query('SELECT pg_advisory_xact_lock($1,$2)',[51001,Number(user.daycare_id)]);
    const old=(await c.query('SELECT * FROM billing_automation_settings WHERE daycare_id=$1 FOR UPDATE',[user.daycare_id])).rows[0];
    if((old?.version??0)!==input.version)throw fail('Billing settings changed. Refresh and preview again.',409);
    if(config.enabled){const proof=(await c.query('SELECT * FROM billing_automation_previews WHERE id=$1 AND daycare_id=$2 AND actor_id=$3 AND expires_at>NOW() AND consumed_at IS NULL FOR UPDATE',[input.preview_id??null,user.daycare_id,user.id])).rows[0];
      const children=await roster(c,user.daycare_id,config,localDay(now()).slice(0,7));
      if(!proof||proof.config_hash!==previewHash(config)||proof.roster_hash!==hash(children))throw fail('Preview the current fees and children before enabling or changing scheduled billing.',409);
      await c.query('UPDATE billing_automation_previews SET consumed_at=NOW() WHERE id=$1',[proof.id]);}
    const values=configKeys.map(key=>config[key]);
    const row=(await c.query(`INSERT INTO billing_automation_settings(daycare_id,${configKeys.join(',')},updated_by) VALUES($1,${values.map((_,i)=>'$'+(i+2)).join(',')},$${values.length+2})
      ON CONFLICT(daycare_id) DO UPDATE SET ${configKeys.map(key=>`${key}=EXCLUDED.${key}`).join(',')},updated_by=EXCLUDED.updated_by,version=billing_automation_settings.version+1,updated_at=NOW() RETURNING *`,[user.daycare_id,...values,user.id])).rows[0];
    // A reviewed correction can recover this month's failed generation. The
    // settings lock serializes this reset with generate(); completed runs and
    // already-issued invoices remain unchanged.
    const retried=config.enabled?(await c.query("UPDATE billing_automation_runs SET attempts=0,next_attempt_at=NULL WHERE daycare_id=$1 AND billing_period=$2 AND status='failed' RETURNING id",[user.daycare_id,localDay(now()).slice(0,7)])).rows:[];
    if(!config.enabled)await c.query("UPDATE billing_automation_reminders SET status='cancelled',lease_until=NULL WHERE daycare_id=$1 AND status IN ('pending','sending')",[user.daycare_id]);
    await audit(c,user,'BILLING_AUTOMATION_UPDATED',{before:old||null,after:config,reason:input.reason,retried_run_ids:retried.map(run=>run.id)});return row;
  });}
  async function history(user){await admin(pool,user);const [runs,deliveries,aging]=await Promise.all([
    pool.query('SELECT * FROM billing_automation_runs WHERE daycare_id=$1 ORDER BY id DESC LIMIT 60',[user.daycare_id]),
    pool.query(`SELECT r.id,r.invoice_id,r.channel,r.kind,r.status,r.attempts,r.sent_at,r.last_error,r.created_at,u.name AS parent_name FROM billing_automation_reminders r JOIN users u ON u.id=r.user_id AND u.daycare_id=r.daycare_id WHERE r.daycare_id=$1 ORDER BY r.id DESC LIMIT 100`,[user.daycare_id]),
    pool.query(`SELECT COALESCE(SUM(amount-amount_paid) FILTER(WHERE due_date>=($2::date)),0) AS current_balance,
      COALESCE(SUM(amount-amount_paid) FILTER(WHERE $2::date-due_date BETWEEN 1 AND 30),0) AS days_1_30,
      COALESCE(SUM(amount-amount_paid) FILTER(WHERE $2::date-due_date BETWEEN 31 AND 60),0) AS days_31_60,
      COALESCE(SUM(amount-amount_paid) FILTER(WHERE $2::date-due_date>60),0) AS days_over_60 FROM child_invoices WHERE daycare_id=$1 AND status<>'cancelled' AND amount>amount_paid`,[user.daycare_id,localDay(now())])]);
    return {runs:runs.rows,deliveries:deliveries.rows,aging:aging.rows[0]};}
  async function generate(daycareId){const day=localDay(now()),period=day.slice(0,7);let config,actor;
    try{return await transaction(pool,async c=>{
      await requireFeature(c,daycareId,'billing_automation');
      config=(await c.query('SELECT * FROM billing_automation_settings WHERE daycare_id=$1 FOR UPDATE',[daycareId])).rows[0];
      if(!config?.enabled||Number(day.slice(8))<config.generate_day)return {skipped:true};
      actor={id:config.updated_by,daycare_id:daycareId,role:'admin'};await admin(c,actor);
      await c.query('SELECT pg_advisory_xact_lock($1,$2)',[51002,Number(daycareId)]);
      const prior=(await c.query('SELECT * FROM billing_automation_runs WHERE daycare_id=$1 AND billing_period=$2 FOR UPDATE',[daycareId,period])).rows[0];
      if(prior?.status==='completed'||prior?.attempts>=5||(prior?.next_attempt_at&&new Date(prior.next_attempt_at)>now()))return {skipped:true};
      const children=await roster(c,daycareId,config,period);let generated=0,skipped=0,total=0n;
      for(const child of children){const inserted=await c.query(`INSERT INTO child_invoices(daycare_id,child_id,parent_id,invoice_type,billing_period,title,amount,amount_paid,due_date,status,notes)
        VALUES($1,$2,$3,'care_fee',$4,$5,$6,0,$7,'pending',$8) ON CONFLICT(daycare_id,child_id,billing_period,invoice_type) DO NOTHING RETURNING id`,
        [daycareId,child.id,child.parent_id,period,`${period} Monthly Care Fee — ${child.full_name}`,child.amount,`${period}-${String(config.due_day).padStart(2,'0')}`,config.discount_percent>0?`Recurring discount ${config.discount_percent}%: ${config.discount_reason}`:null]);
        if(inserted.rows.length){generated++;total+=minor(child.amount);}else skipped++;}
      await c.query(`INSERT INTO billing_automation_runs(daycare_id,billing_period,status,generated_count,skipped_count,total_amount,configuration,completed_at)
        VALUES($1,$2,'completed',$3,$4,$5,$6,NOW()) ON CONFLICT(daycare_id,billing_period) DO UPDATE SET status='completed',attempts=billing_automation_runs.attempts+1,generated_count=$3,skipped_count=$4,total_amount=$5,configuration=$6,completed_at=NOW(),last_error=NULL,next_attempt_at=NULL`,[daycareId,period,generated,skipped,decimal(total),JSON.stringify(configOf(config))]);
      await audit(c,actor,'BILLING_AUTOMATION_INVOICES_GENERATED',{billing_period:period,generated_count:generated,skipped_count:skipped,total_amount:decimal(total)});
      return {generated_count:generated,skipped_count:skipped,total_amount:decimal(total),billing_period:period};
    });}catch(error){if([403,404].includes(error.statusCode)){await pool.query("UPDATE billing_automation_reminders SET status='cancelled',lease_until=NULL WHERE daycare_id=$1 AND status IN ('pending','sending')",[daycareId]);return {blocked:true};}
      if(config){await pool.query(`INSERT INTO billing_automation_runs(daycare_id,billing_period,status,configuration,last_error,next_attempt_at) VALUES($1,$2,'failed',$3,$4,NOW()+INTERVAL '30 minutes')
        ON CONFLICT(daycare_id,billing_period) DO UPDATE SET attempts=billing_automation_runs.attempts+1,last_error=EXCLUDED.last_error,next_attempt_at=EXCLUDED.next_attempt_at WHERE billing_automation_runs.status<>'completed'`,[daycareId,period,JSON.stringify(configOf(config)),error.statusCode===422?String(error.message).slice(0,300):'Scheduled invoice generation failed. Contact platform support.']);}throw error;}
  }
  async function enqueue(daycareId){await requireFeature(pool,daycareId,'billing_automation');return transaction(pool,async c=>{
    const config=(await c.query('SELECT * FROM billing_automation_settings WHERE daycare_id=$1 AND enabled FOR SHARE',[daycareId])).rows[0];if(!config)return 0;
    const invoices=(await c.query(`SELECT i.id,i.parent_id,i.due_date::text,u.ui_preferences FROM child_invoices i JOIN users u ON u.id=i.parent_id AND u.daycare_id=i.daycare_id
      WHERE i.daycare_id=$1 AND i.status<>'cancelled' AND i.amount>i.amount_paid AND u.role_id=3 AND u.status='active'
      AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.daycare_id=i.daycare_id AND g.child_id=i.child_id AND g.user_id=u.id)`,[daycareId])).rows;
    const day=localDay(now());let count=0;
    for(const invoice of invoices){const due=String(invoice.due_date).slice(0,10),delta=Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(due+'T00:00:00Z'))/86400000);
      const kind=delta<0&&delta>=-config.reminder_before_days?'before':delta>=config.reminder_after_days?'after':null;if(!kind)continue;
      const channels=[...(config.in_app_reminders&&invoice.ui_preferences?.notifications?.messages!==false?['in_app']:[]),...(config.email_reminders&&invoice.ui_preferences?.notifications?.billing_email===true?['email']:[])];
      for(const channel of channels){const inserted=await c.query(`INSERT INTO billing_automation_reminders(daycare_id,invoice_id,user_id,channel,kind) VALUES($1,$2,$3,$4,$5) ON CONFLICT(daycare_id,invoice_id,user_id,channel,kind) DO NOTHING RETURNING id`,[daycareId,invoice.id,invoice.parent_id,channel,kind]);count+=inserted.rows.length;}}
    return count;
  });}
  async function parentReminders(user){if(user?.role!=='parent')throw fail('Parent account required.',403);const rows=(await pool.query(`SELECT r.id,r.kind,r.sent_at,r.read_at,i.id AS invoice_id,i.title,i.due_date,i.amount,i.amount_paid,i.status,c.full_name AS child_name
    FROM billing_automation_reminders r JOIN child_invoices i ON i.id=r.invoice_id AND i.daycare_id=r.daycare_id JOIN children c ON c.id=i.child_id AND c.daycare_id=i.daycare_id
    WHERE r.daycare_id=$1 AND r.user_id=$2 AND r.channel='in_app' AND r.status='sent' AND i.parent_id=$2
    AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.daycare_id=i.daycare_id AND g.child_id=i.child_id AND g.user_id=$2)
    ORDER BY r.sent_at DESC LIMIT 100`,[user.daycare_id,user.id])).rows;return {reminders:rows};}
  async function readReminder(id,user){if(user?.role!=='parent')throw fail('Parent account required.',403);const row=(await pool.query("UPDATE billing_automation_reminders SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND daycare_id=$2 AND user_id=$3 AND channel='in_app' AND status='sent' RETURNING id",[id,user.daycare_id,user.id])).rows[0];if(!row)throw fail('Reminder not found.',404);return row;}
  async function parentPreferences(user){
    if(user?.role!=='parent')throw fail('Parent account required.',403);
    const row=(await pool.query("SELECT ui_preferences FROM users WHERE id=$1 AND daycare_id=$2 AND role_id=3 AND status='active'",[user.id,user.daycare_id])).rows[0];
    if(!row)throw fail('Account unavailable.',403);
    return {billing_email:row.ui_preferences?.notifications?.billing_email===true};
  }
  async function emailPreference(enabled,user){if(user?.role!=='parent')throw fail('Parent account required.',403);if(typeof enabled!=='boolean')throw fail('Parent billing email preference required.');const row=(await pool.query(`UPDATE users SET ui_preferences=jsonb_set(COALESCE(ui_preferences,'{}'::jsonb),'{notifications}',COALESCE(ui_preferences->'notifications','{}'::jsonb)||jsonb_build_object('billing_email',$3::boolean),true) WHERE id=$1 AND daycare_id=$2 AND role_id=3 AND status='active' RETURNING id`,[user.id,user.daycare_id,enabled])).rows[0];if(!row)throw fail('Account unavailable.',403);return {billing_email:enabled};}
  return {settings,preview,save,history,generate,enqueue,parentReminders,readReminder,parentPreferences,emailPreference};
}
module.exports={createBillingAutomation,localDay,discountedFee,defaults,transaction};
