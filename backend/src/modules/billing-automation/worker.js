'use strict';
const {createBillingAutomation,localDay,transaction}=require('./service');
const {requireFeature}=require('../saas/package-features');
const {withTenant}=require('../../db/tenant-pool');

function createBillingWorker({pool,transporter=null,from=null,emailEnabled=false,logger=console,now=()=>new Date()}){
  const service=createBillingAutomation(pool,{now});
  async function eligible(c,job){
    await requireFeature(c,job.daycare_id,'billing_automation');
    const row=(await c.query(`SELECT i.title,i.amount-i.amount_paid AS balance,i.due_date::text,i.parent_id,u.email,u.ui_preferences,
      s.updated_by,s.in_app_reminders,s.email_reminders,s.reminder_before_days,s.reminder_after_days,
      d.name AS daycare_name FROM child_invoices i JOIN users u ON u.id=i.parent_id AND u.daycare_id=i.daycare_id
      JOIN billing_automation_settings s ON s.daycare_id=i.daycare_id JOIN daycares d ON d.id=i.daycare_id
      JOIN users sender ON sender.id=s.updated_by AND sender.daycare_id=s.daycare_id AND sender.role_id=1 AND sender.status='active'
      WHERE i.id=$1 AND i.daycare_id=$2 AND i.parent_id=$3 AND i.status<>'cancelled' AND i.amount>i.amount_paid
      AND s.enabled AND u.role_id=3 AND u.status='active' AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.daycare_id=i.daycare_id AND g.child_id=i.child_id AND g.user_id=u.id) FOR SHARE OF i`,[job.invoice_id,job.daycare_id,job.user_id])).rows[0];
    if(!row)return null;
    if(job.channel==='in_app'&&(!row.in_app_reminders||row.ui_preferences?.notifications?.messages===false))return null;
    if(job.channel==='email'&&(!row.email_reminders||row.ui_preferences?.notifications?.billing_email!==true||!row.email))return null;
    const delta=Math.round((Date.parse(localDay(now())+'T00:00:00Z')-Date.parse(row.due_date+'T00:00:00Z'))/86400000);
    if(job.kind==='before'&&!(delta<0&&delta>=-row.reminder_before_days))return null;
    if(job.kind==='after'&&delta<row.reminder_after_days)return null;
    return row;
  }
  async function deliver(daycareId){let handled=0;
    await pool.query("UPDATE billing_automation_reminders SET status='failed',lease_until=NULL,last_error='Reminder delivery exhausted its retry limit.' WHERE daycare_id=$1 AND status='sending' AND lease_until<NOW() AND attempts>=5",[daycareId]);
    for(let index=0;index<25;index++){
      const job=(await pool.query(`UPDATE billing_automation_reminders r SET status='sending',attempts=attempts+1,lease_until=NOW()+INTERVAL '5 minutes'
        WHERE r.id=(SELECT id FROM billing_automation_reminders WHERE daycare_id=$1 AND attempts<5 AND (channel='in_app' OR $2)
          AND ((status='pending' AND next_attempt_at<=NOW()) OR (status='sending' AND lease_until<NOW())) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING r.*`,[daycareId,!!(emailEnabled&&transporter&&from)])).rows[0];
      if(!job)break;handled++;
      let heartbeat;
      try{
        if(job.channel==='in_app'){
          await transaction(pool,async c=>{
            const locked=(await c.query("SELECT id FROM billing_automation_reminders WHERE id=$1 AND daycare_id=$2 AND status='sending' AND attempts=$3 FOR UPDATE",[job.id,daycareId,job.attempts])).rows[0];if(!locked)return;
            const invoice=await eligible(c,job);
            if(!invoice){await c.query("UPDATE billing_automation_reminders SET status='cancelled',lease_until=NULL WHERE id=$1",[job.id]);return;}
            const text=`${invoice.daycare_name}: ${invoice.title} has an outstanding balance of ${invoice.balance} ETB, due ${invoice.due_date}. Open your bills to review current payments. If you recently paid, contact the daycare to reconcile the receipt.`;
            const message=(await c.query('INSERT INTO messages(daycare_id,sender_id,recipient_id,subject,body) VALUES($1,$2,$3,$4,$5) RETURNING id',[daycareId,invoice.updated_by,job.user_id,'Care fee payment reminder',text])).rows[0];
            await c.query("UPDATE billing_automation_reminders SET status='sent',sent_at=NOW(),lease_until=NULL,last_error=NULL,message_id=$2 WHERE id=$1",[job.id,message.id]);
          });
        }else{
          const invoice=await eligible(pool,job);
          if(!invoice){await pool.query("UPDATE billing_automation_reminders SET status='cancelled',lease_until=NULL WHERE id=$1 AND attempts=$2 AND status='sending'",[job.id,job.attempts]);continue;}
          heartbeat=setInterval(()=>{pool.query("UPDATE billing_automation_reminders SET lease_until=NOW()+INTERVAL '5 minutes' WHERE id=$1 AND daycare_id=$2 AND status='sending' AND attempts=$3",[job.id,daycareId,job.attempts]).catch(()=>{});},60000);heartbeat.unref();
          await transporter.sendMail({from,to:invoice.email,subject:`Care fee reminder — ${invoice.daycare_name}`,messageId:`<ankelba-billing-reminder-${job.id}@ankelba.local>`,
            text:`${invoice.title}\nOutstanding balance: ${invoice.balance} ETB\nDue date: ${invoice.due_date}\nOpen the Ankelba parent app to review your current bills. Contact your daycare if you recently paid.\nYou can disable billing emails in your billing preferences.`});
          await pool.query("UPDATE billing_automation_reminders SET status='sent',sent_at=NOW(),lease_until=NULL,last_error=NULL WHERE id=$1 AND daycare_id=$2 AND status='sending' AND attempts=$3",[job.id,daycareId,job.attempts]);
        }
      }catch(error){
        const blocked=[403,404].includes(error.statusCode);
        await pool.query(`UPDATE billing_automation_reminders SET status=$2,lease_until=NULL,last_error=$3,next_attempt_at=NOW()+INTERVAL '30 minutes' WHERE id=$1 AND daycare_id=$4 AND status='sending' AND attempts=$5`,[job.id,blocked?'cancelled':job.attempts>=5?'failed':'pending',blocked?'Subscription or account access is unavailable.':'Reminder delivery failed. Retry scheduled.',daycareId,job.attempts]);
        if(!blocked)logger.error('Billing reminder delivery failed',{reminder_id:job.id});
      }finally{if(heartbeat)clearInterval(heartbeat);}
    }
    return handled;
  }
  async function runDaycare(daycareId){return withTenant(Number(daycareId),async()=>{
    const invoices=await service.generate(daycareId);
    if(invoices.blocked)return {blocked:true};
    await service.enqueue(daycareId);const reminders=await deliver(daycareId);return {invoices,reminders};
  });}
  let busy=false;
  async function run(){if(busy)return {busy:true};busy=true;try{
    const ids=(await (pool.control||pool).query('SELECT daycare_id FROM public.billing_automation_tenants()')).rows;
    let processed=0;for(const row of ids){try{await runDaycare(row.daycare_id);processed++;}catch(error){logger.error('Billing automation run failed',{daycare_id:row.daycare_id});}}
    return {processed};
  }finally{busy=false;}}
  return {run,runDaycare,deliver};
}
function fromEnvironment(pool,logger){
  if(process.env.BILLING_AUTOMATION_ENABLED!=='true')return null;
  let transporter=null,from=null,emailEnabled=false;
  const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASSWORD,SMTP_FROM}=process.env;
  if(process.env.BILLING_AUTOMATION_EMAIL_ENABLED==='true'&&SMTP_HOST&&SMTP_PORT&&SMTP_USER&&SMTP_PASSWORD&&SMTP_FROM){
    const secure=process.env.SMTP_SECURE==='true';from=SMTP_FROM;emailEnabled=true;
    transporter=require('nodemailer').createTransport({host:SMTP_HOST,port:Number(SMTP_PORT),secure,requireTLS:!secure,auth:{user:SMTP_USER,pass:SMTP_PASSWORD},connectionTimeout:15000,socketTimeout:30000});
  }
  return createBillingWorker({pool,logger,transporter,from,emailEnabled});
}
module.exports={createBillingWorker,fromEnvironment};
