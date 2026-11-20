'use strict';
const { withTenant } = require('../../db/tenant-pool');
const { open } = require('./outbox');
const { account, eligible, state } = require('./auth-codes');

function createEmailWorker({ pool, transport, logger = console, secret = process.env.JWT_SECRET,
  portalUrl = process.env.FRONTEND_URL || '', announcements } = {}) {
  const control = pool.control || pool;
  const link = path => portalUrl ? new URL(path, require('./portal-url').portalUrl(portalUrl)).href : '';
  async function resolve(job) {
    if (job.protected_payload) {
      const user = await account(control, job.platform_account_id ? 'platform' : 'daycare', { id: job.platform_account_id || job.user_id });
      if (!eligible(user) || user.email.toLowerCase() !== job.recipient.toLowerCase()) return null;
      if (job.challenge_id) {
        const challenge = (await control.query('SELECT * FROM email_challenges WHERE id=$1', [job.challenge_id])).rows[0];
        if (!challenge || challenge.consumed_at || challenge.attempts >= 5 || new Date(challenge.expires_at) <= new Date()
          || challenge.auth_state !== state(user, secret)) return null;
      }
      return { to: job.recipient, ...open(job.protected_payload, job.id, secret) };
    }
    if (job.kind === 'application') {
      const application = (await control.query('SELECT admin_email,status FROM daycare_applications WHERE id=$1', [job.event_id])).rows[0];
      if (!application || application.admin_email !== job.recipient || job.dedupe_key !== `application:${job.event_id}:${application.status}`) return null;
      return { to: job.recipient, subject: 'Your Ankelba application',
        text: `Your daycare application is ${application.status}. Open Ankelba to review its current status.\n${link('/')}` };
    }
    if (job.kind === 'account_created' || job.kind === 'password_changed') {
      const user = await account(control, 'daycare', { id: job.user_id });
      if (!eligible(user) || user.daycare_id !== job.daycare_id || user.email !== job.recipient) return null;
      return job.kind === 'account_created'
        ? { to: user.email, subject: 'Welcome to Ankelba', text: `Your Ankelba account is ready. Verify your email to receive daycare updates.\n${link('/verify-email')}\n\nUse Forgot password to set your password. No password is included in this email.` }
        : { to: user.email, subject: 'Your Ankelba password changed', text: 'Your Ankelba password was changed. If this was not you, contact your administrator immediately.' };
    }
    if (!job.daycare_id) return null;
    return withTenant(Number(job.daycare_id), async () => {
      const user = (await pool.query(`SELECT u.*,r.name AS role,d.status AS daycare_status,d.deleted_at FROM users u
        JOIN roles r ON r.id=u.role_id JOIN daycares d ON d.id=u.daycare_id WHERE u.id=$1 AND u.daycare_id=$2`, [job.user_id, job.daycare_id])).rows[0];
      if (!user || user.status !== 'active' || user.daycare_status !== 'active' || user.deleted_at || !user.email) return null;
      const prefs = user.ui_preferences?.notifications || {};
      if (!user.email_verified_at || prefs.email === false) return null;
      const category = job.kind === 'message' ? 'messages' : job.kind === 'announcement' ? 'announcements' : 'activity';
      if (prefs[category] === false) return null;
      if (job.child_id && !(await pool.query(`SELECT 1 FROM guardian_links g JOIN children c ON c.id=g.child_id AND c.daycare_id=g.daycare_id
        WHERE g.user_id=$1 AND g.child_id=$2 AND g.daycare_id=$3`, [user.id, job.child_id, job.daycare_id])).rowCount) return null;
      const check = async (table, condition, values = []) => (await pool.query(`SELECT 1 FROM ${table}
        WHERE id=$1 AND daycare_id=$2 AND ${condition}`, [job.event_id, job.daycare_id, ...values])).rowCount > 0;
      let text, subject;
      if (job.kind === 'message') {
        if (!await check('messages', 'recipient_id=$3 AND read_at IS NULL', [user.id])) return null;
        subject = 'New message in Ankelba'; text = 'You have a new message. Open Messages in Ankelba to read and reply.';
      } else if (job.kind === 'announcement') {
        const list = announcements || require('../communication/communication.service').listAnnouncements;
        if (!(await list({}, user)).data.some(a => a.id === job.event_id)) return null;
        subject = 'New daycare announcement'; text = 'Your daycare posted an announcement. Open Announcements in Ankelba to read it.';
      } else if (job.kind === 'alert') {
        if (!(await require('../communication/communication.service').listAlerts(user)).data.some(a => a.id === job.event_id)) return null;
        subject = 'New daycare alert'; text = 'Your daycare posted an alert. Open Alerts in Ankelba to review it.';
      } else if (['report', 'checkin', 'pickup', 'health_record'].includes(job.kind)) {
        const table = { report: 'daily_reports', checkin: 'attendance', pickup: 'attendance', health_record: 'health_records' }[job.kind];
        if (!await check(table, 'child_id=$3', [job.child_id])) return null;
        [subject, text] = {
          report: ['Daily report ready', 'A daily report is ready. Open Reports in Ankelba to review it.'],
          checkin: ['Child checked in', 'A check-in was recorded for your child. Open Attendance in Ankelba to review it.'],
          pickup: ['Child pickup recorded', 'A pickup was recorded for your child. Open Attendance in Ankelba to review it.'],
          health_record: ['New health or incident update', 'Your daycare recorded a health or incident update. Open Ankelba to review it.'],
        }[job.kind];
      } else if (job.kind === 'invoice') {
        if (!await check('child_invoices', "parent_id=$3 AND status<>'cancelled'", [user.id])) return null;
        subject = 'New care fee invoice'; text = 'A care fee invoice is ready. Open Bills in Ankelba to review the amount and due date.';
      } else if (job.kind === 'care_receipt') {
        if (!(await pool.query(`SELECT 1 FROM child_payments p JOIN child_invoices i ON i.id=p.invoice_id AND i.daycare_id=p.daycare_id
          WHERE p.id=$1 AND p.daycare_id=$2 AND i.parent_id=$3`, [job.event_id, job.daycare_id, user.id])).rowCount) return null;
        subject = 'Care fee payment recorded'; text = 'Your daycare recorded a care fee payment. Open Bills in Ankelba to view your receipt.';
      } else if (job.kind === 'order') {
        if (!await check('orders', "parent_id=$3 AND ('order:'||id||':'||order_status||':'||payment_status)=$4", [user.id, job.dedupe_key])) return null;
        // Reuse package authorization so Standard accounts never receive shop notices.
        try { await require('../saas/package-features').requireFeature(pool, job.daycare_id, 'shop'); } catch (error) { if (error.statusCode === 403) return null; throw error; }
        subject = 'Shop order update'; text = 'Your shop order has an update. Open Orders in Ankelba to review its payment and delivery status.';
      } else return null;
      const preferences = user.role === 'parent' ? `Open Security in the parent app. ${link('/app')}` : link(user.role === 'admin' ? '/admin/email-settings' : '/staff/email-settings');
      return { to: user.email, subject, text: `${text}\n\nEmail preferences: ${preferences}` };
    });
  }
  let busy = false;
  async function run() {
    if (!transport || busy) return { processed: 0 };
    busy = true;
    let processed = 0;
    try {
      await control.query(`UPDATE email_outbox SET status='cancelled',protected_payload=NULL,lease_until=NULL,last_error='Expired'
        WHERE status IN ('pending','sending') AND expires_at<=NOW()`);
      await control.query(`UPDATE email_outbox SET status='failed',protected_payload=NULL,lease_until=NULL,last_error='Retry limit reached'
        WHERE status='sending' AND lease_until<NOW() AND attempts>=5`);
      for (let n = 0; n < 25; n++) {
        const job = (await control.query(`UPDATE email_outbox SET status='sending',attempts=attempts+1,lease_until=NOW()+INTERVAL '2 minutes'
          WHERE id=(SELECT id FROM email_outbox WHERE attempts<5 AND expires_at>NOW()
          AND ((status='pending' AND next_attempt_at<=NOW()) OR (status='sending' AND lease_until<NOW()))
          ORDER BY priority DESC,created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`)).rows[0];
        if (!job) break;
        processed++;
        try {
          const message = await resolve(job);
          const result = message && await transport.sendMail({ ...message, messageId: `<${job.id}@ankelba.local>` });
          if (message && !result?.accepted) throw Object.assign(new Error('Relay did not accept the message'), { code: 'EMAIL_REJECTED' });
          await control.query(`UPDATE email_outbox SET status=$2,provider_message_id=$3,accepted_at=$4,protected_payload=NULL,
            last_error=NULL,lease_until=NULL WHERE id=$1 AND status='sending' AND attempts=$5`,
          [job.id, message ? 'accepted' : 'cancelled', result?.messageId || null, message ? new Date() : null, job.attempts]);
        } catch (error) {
          const permanent = error.permanent || (error.responseCode >= 500 && error.responseCode < 600 && error.responseCode !== 535);
          const failed = permanent || job.attempts >= 5;
          const reason = ['EAUTH','ETIMEDOUT','ECONNECTION','EMAIL_REJECTED'].includes(error.code) ? error.code : 'DELIVERY_FAILED';
          await control.query(`UPDATE email_outbox SET status=$2,last_error=$3,lease_until=NULL,
            next_attempt_at=NOW()+($4*INTERVAL '1 second'),protected_payload=CASE WHEN $5 THEN NULL ELSE protected_payload END
            WHERE id=$1 AND status='sending' AND attempts=$6`, [job.id, failed ? 'failed' : 'pending', reason, Math.min(900, 15 * 2 ** job.attempts), failed, job.attempts]);
          logger.error('Email delivery attempt failed', { email_job_id: job.id, reason });
        }
      }
      return { processed };
    } finally { busy = false; }
  }
  return { run, resolve };
}
module.exports = { createEmailWorker };
