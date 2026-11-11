'use strict';
const nodemailer = require('nodemailer');

function createReminderWorker({pool, transporter, from, portalUrl, logger = console}) {
  async function run() {
    // Catch up after downtime, without sending reminders for already expired periods.
    await pool.query(`INSERT INTO subscription_reminders (daycare_id,user_id,period_end)
      SELECT d.id,u.id,d.subscription_ends_at FROM daycares d
      JOIN users u ON u.daycare_id=d.id AND u.role_id=1 AND u.status='active'
      WHERE d.status='active' AND d.deleted_at IS NULL AND d.subscription_ends_at > NOW()
        AND d.subscription_ends_at <= NOW() + interval '5 days'
        AND d.subscription_status='active' AND u.email IS NOT NULL
      ON CONFLICT (daycare_id,user_id,period_end) DO UPDATE
        SET status='pending',next_attempt_at=NOW(),lease_until=NULL
        WHERE subscription_reminders.status='cancelled'`);
    // Claim each message immediately before sending. This keeps later messages
    // in a slow batch from losing a lease before delivery has even started.
    let claimed = 0;
    for (let i=0; i<25; i++) {
      const {rows} = await pool.query(`UPDATE subscription_reminders r SET
          status='sending', lease_until=NOW()+interval '5 minutes', attempts=attempts+1
        WHERE r.id IN (SELECT id FROM subscription_reminders
          WHERE ((status='pending' AND next_attempt_at<=NOW()) OR (status='sending' AND lease_until<NOW()))
          ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING r.id,r.daycare_id,r.user_id,r.period_end,r.attempts`);
      if (!rows.length) break;
      const reminder = rows[0];
      claimed += 1;
      const heartbeat = setInterval(() => {
        pool.query("UPDATE subscription_reminders SET lease_until=NOW()+interval '5 minutes' WHERE id=$1 AND status='sending' AND attempts=$2",[reminder.id,reminder.attempts])
          .catch(error => logger.error('Subscription reminder lease refresh failed', {reminder_id:reminder.id,error:error.message}));
      }, 60000);
      heartbeat.unref();
      try {
        // A renewal or cancellation between enqueue and send makes this notice stale.
        // Compare database timestamps directly: PostgreSQL retains microseconds
        // that would be lost if the period were round-tripped through JS Date.
        const {rows: recipients} = await pool.query(`SELECT u.email,d.name FROM subscription_reminders r
          JOIN users u ON u.id=r.user_id AND u.daycare_id=r.daycare_id
          JOIN daycares d ON d.id=r.daycare_id
          WHERE r.id=$1 AND r.status='sending' AND r.attempts=$2 AND u.role_id=1 AND u.status='active' AND d.status='active'
          AND d.deleted_at IS NULL AND d.subscription_status='active' AND d.subscription_ends_at=r.period_end AND d.subscription_ends_at>NOW()`,
        [reminder.id,reminder.attempts]);
        if (!recipients[0]) {
          await pool.query("UPDATE subscription_reminders SET status='cancelled',lease_until=NULL WHERE id=$1 AND status='sending' AND attempts=$2",[reminder.id,reminder.attempts]);
          continue;
        }
        const date = new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Addis_Ababa',dateStyle:'long'}).format(new Date(reminder.period_end));
        await transporter.sendMail({from,to:recipients[0].email,subject:'Your Ankelba subscription is due soon',
          text:`Your Ankelba subscription for ${recipients[0].name} ends on ${date}. Sign in to review your subscription and renew: ${portalUrl}`});
        await pool.query("UPDATE subscription_reminders SET status='sent',sent_at=NOW(),lease_until=NULL,last_error=NULL WHERE id=$1 AND status='sending' AND attempts=$2",[reminder.id,reminder.attempts]);
      } catch (error) {
        logger.error('Subscription reminder delivery failed', {reminder_id:reminder.id, error: String(error.message).slice(0,300)});
        const nextStatus = reminder.attempts >= 5 ? 'failed' : 'pending';
        await pool.query(`UPDATE subscription_reminders SET status='${nextStatus}',lease_until=NULL,last_error=$2,next_attempt_at=NOW()+interval '30 minutes' WHERE id=$1 AND status='sending' AND attempts=$3`,[reminder.id,String(error.message).slice(0,300),reminder.attempts]);
      } finally { clearInterval(heartbeat); }
    }
    return claimed;
  }
  return {run};
}

function fromEnvironment(pool, logger) {
  const {SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, FRONTEND_URL} = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || !FRONTEND_URL) return null;
  const secure = process.env.SMTP_SECURE === 'true';
  const transporter = nodemailer.createTransport({host:SMTP_HOST,port:Number(SMTP_PORT),secure,requireTLS:!secure,
    auth:{user:SMTP_USER,pass:SMTP_PASSWORD},connectionTimeout:15000,socketTimeout:30000});
  return createReminderWorker({pool,transporter,from:SMTP_FROM,portalUrl:FRONTEND_URL,logger});
}
module.exports = {createReminderWorker, fromEnvironment};
