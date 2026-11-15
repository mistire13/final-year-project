'use strict';
const { withTenant } = require('../../db/tenant-pool');
const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';

async function request(url, body, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = new Error('Push provider request failed');
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return response.json();
}

function createPushWorker({ pool, logger = console, fetchImpl = fetch }) {
  let busy = false;
  const provider = (url, body) => request(url, body, fetchImpl);
  async function validSession(device, daycareId) {
    if (!device.session_expires_at || new Date(device.session_expires_at).getTime()<=Date.now()) return false;
    const control=pool.control||pool;
    if(device.session_kind==='legacy') {
      const security=require('../auth/legacy-security');
      const account=await security.findAccount(control,{id:device.user_id});
      return security.activeAccount(account) && account.daycare_id===daycareId && security.matchesState(device.session_state,account);
    }
    if(device.session_kind==='modern') {
      const {rows}=await control.query(`SELECT 1 FROM auth_sessions s JOIN users u ON u.id=s.user_id AND u.daycare_id=s.daycare_id
        JOIN daycares d ON d.id=s.daycare_id LEFT JOIN mfa_factors f ON f.id=s.mfa_factor_id AND f.daycare_id=s.daycare_id
        AND f.user_id=s.user_id AND f.platform_account_id IS NULL
        WHERE s.id=$1 AND s.daycare_id=$2 AND s.user_id=$3 AND s.platform_account_id IS NULL
        AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND u.status='active' AND d.status='active' AND u.role_id IN (1,2,3)
        AND (u.role_id<>1 OR (s.mfa_verified_at IS NOT NULL AND s.mfa_verified_at<=clock_timestamp()
          AND f.confirmed_at IS NOT NULL AND f.revoked_at IS NULL))`,[device.session_state,daycareId,device.user_id]);
      return rows.length>0;
    }
    return false;
  }
  async function retry(job, checking, error, table = 'push_message_deliveries') {
    const retryable = error?.retryable !== false && job.attempts < 5;
    await pool.query(`UPDATE ${table} SET status=$2,lease_until=NULL,
      next_attempt_at=NOW()+INTERVAL '2 minutes',last_error=$3 WHERE id=$1 AND status=$4`,
    [job.id, retryable ? (checking ? 'receipt' : 'pending') : 'failed',
      retryable ? 'Provider temporarily unavailable' : 'Provider rejected delivery', checking ? 'checking' : 'sending']);
  }
  async function deliver(daycareId) {
    await pool.query(`UPDATE push_message_deliveries SET status='failed',lease_until=NULL,last_error='Push receipt expired'
      WHERE daycare_id=$1 AND status IN ('receipt','checking') AND created_at<NOW()-INTERVAL '24 hours'`,[daycareId]);
    await pool.query(`UPDATE push_message_deliveries SET status='failed',lease_until=NULL,last_error='Retry limit reached'
      WHERE daycare_id=$1 AND status='sending' AND lease_until<NOW() AND attempts>=5`, [daycareId]);
    for (let count=0; count<25; count++) {
      const job=(await pool.query(`UPDATE push_message_deliveries SET status='sending',attempts=attempts+1,
        lease_until=NOW()+INTERVAL '2 minutes' WHERE id=(SELECT id FROM push_message_deliveries
          WHERE daycare_id=$1 AND attempts<5 AND ((status='pending' AND next_attempt_at<=NOW())
            OR (status='sending' AND lease_until<NOW())) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`, [daycareId])).rows[0];
      if (!job) break;
      try {
        const row=(await pool.query(`SELECT p.token,p.user_id,p.session_kind,p.session_state,p.session_expires_at,m.push_event_type FROM push_devices p
          JOIN users u ON u.id=p.user_id AND u.daycare_id=p.daycare_id
          JOIN daycares d ON d.id=p.daycare_id
          JOIN messages m ON m.id=$3 AND m.daycare_id=p.daycare_id AND m.recipient_id=p.user_id
          WHERE p.id=$1 AND p.daycare_id=$2 AND p.active AND u.status='active' AND d.status='active'
            AND d.deleted_at IS NULL AND m.read_at IS NULL
            AND COALESCE((u.ui_preferences->'notifications'->>CASE WHEN m.push_event_type='health' THEN 'activity' ELSE 'messages' END)::boolean,true)`,
        [job.device_id,daycareId,job.message_id])).rows[0];
        if (!row || !await validSession(row,daycareId)) {
          await pool.query("UPDATE push_message_deliveries SET status='cancelled',lease_until=NULL WHERE id=$1 AND status='sending'", [job.id]);
          continue;
        }
        const result=await provider(SEND_URL, { to:row.token, title:'Ankelba', body:row.push_event_type==='health'?'Your daycare shared a health update.':'You have a new message.',
          sound:'default', channelId:row.push_event_type==='health'?'activity':'messages', data:{type:'message',messageId:job.message_id} });
        const ticket=result?.data;
        if (ticket?.status !== 'ok' || !ticket.id) {
          if (ticket?.details?.error === 'DeviceNotRegistered') {
            await pool.query('UPDATE push_devices SET active=false WHERE id=$1 AND daycare_id=$2', [job.device_id,daycareId]);
          }
          const error=new Error('Push provider rejected delivery');
          error.retryable = ['MessageRateExceeded','InternalServerError'].includes(ticket?.details?.error);
          throw error;
        }
        await pool.query(`UPDATE push_message_deliveries SET status='receipt',ticket_id=$2,lease_until=NULL,
          next_attempt_at=NOW()+INTERVAL '1 minute',last_error=NULL WHERE id=$1 AND status='sending'`, [job.id,ticket.id]);
      } catch (error) { await retry(job,false,error); logger.error('Push send failed', { delivery_id:job.id }); }
    }
    for (let count=0; count<25; count++) {
      const job=(await pool.query(`UPDATE push_message_deliveries SET status='checking',lease_until=NOW()+INTERVAL '2 minutes'
        WHERE id=(SELECT id FROM push_message_deliveries WHERE daycare_id=$1 AND
          ((status='receipt' AND next_attempt_at<=NOW()) OR (status='checking' AND lease_until<NOW()))
          ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [daycareId])).rows[0];
      if (!job) break;
      try {
        const response=await provider(RECEIPT_URL,{ids:[job.ticket_id]});
        const receipt=response?.data?.[job.ticket_id];
        if (!receipt) {
          await pool.query("UPDATE push_message_deliveries SET status='receipt',lease_until=NULL,next_attempt_at=NOW()+INTERVAL '5 minutes' WHERE id=$1 AND status='checking'",[job.id]);
        } else if (receipt.status==='ok') {
          await pool.query("UPDATE push_message_deliveries SET status='sent',lease_until=NULL,last_error=NULL WHERE id=$1 AND status='checking'",[job.id]);
        } else {
          if (receipt.details?.error==='DeviceNotRegistered') await pool.query('UPDATE push_devices SET active=false WHERE id=$1 AND daycare_id=$2',[job.device_id,daycareId]);
          await pool.query("UPDATE push_message_deliveries SET status='failed',lease_until=NULL,last_error='Provider could not deliver notification' WHERE id=$1 AND status='checking'",[job.id]);
        }
      } catch (error) { await retry(job,true,error); logger.error('Push receipt check failed', { delivery_id:job.id }); }
    }
    await deliverActivities(daycareId);
  }
  async function deliverActivities(daycareId) {
    const table='push_activity_deliveries';
    await pool.query(`UPDATE ${table} SET status='failed',lease_until=NULL,last_error='Push receipt expired'
      WHERE daycare_id=$1 AND status IN ('receipt','checking') AND created_at<NOW()-INTERVAL '24 hours'`,[daycareId]);
    await pool.query(`UPDATE ${table} SET status='failed',lease_until=NULL,last_error='Retry limit reached'
      WHERE daycare_id=$1 AND status='sending' AND lease_until<NOW() AND attempts>=5`,[daycareId]);
    for (let count=0;count<25;count++) {
      const job=(await pool.query(`UPDATE ${table} SET status='sending',attempts=attempts+1,lease_until=NOW()+INTERVAL '2 minutes'
        WHERE id=(SELECT id FROM ${table} WHERE daycare_id=$1 AND attempts<5 AND
        ((status='pending' AND next_attempt_at<=NOW()) OR (status='sending' AND lease_until<NOW()))
        ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,[daycareId])).rows[0];
      if (!job) break;
      try {
        // Recheck access and preferences at send time; a guardian may have been
        // unlinked, an announcement may have expired or a token reassigned.
        const {rows:[row]}=await pool.query(`SELECT p.token,p.user_id,p.session_kind,p.session_state,p.session_expires_at FROM push_devices p
          JOIN users u ON u.id=p.user_id AND u.daycare_id=p.daycare_id
          JOIN roles r ON r.id=u.role_id JOIN daycares d ON d.id=p.daycare_id
          WHERE p.id=$1 AND p.daycare_id=$2 AND p.user_id=$3 AND p.active AND u.status='active'
          AND d.status='active' AND d.deleted_at IS NULL
          AND COALESCE((u.ui_preferences->'notifications'->>CASE WHEN $4='announcement' THEN 'announcements' ELSE 'activity' END)::boolean,true)
          AND (($4<>'announcement' AND r.name='parent' AND EXISTS
              (SELECT 1 FROM guardian_links gl WHERE gl.daycare_id=p.daycare_id AND gl.user_id=u.id AND gl.child_id=$6)
              AND (($4='report' AND EXISTS(SELECT 1 FROM daily_reports dr WHERE dr.id=$5 AND dr.daycare_id=p.daycare_id AND dr.child_id=$6))
                OR ($4 IN ('checkin','pickup') AND EXISTS(SELECT 1 FROM attendance a WHERE a.id=$5 AND a.daycare_id=p.daycare_id AND a.child_id=$6))))
            OR ($4='announcement' AND EXISTS(SELECT 1 FROM announcements a WHERE a.id=$5 AND a.daycare_id=p.daycare_id
              AND (a.expires_at IS NULL OR a.expires_at>NOW()) AND (r.name='admin'
                OR (r.name='parent' AND a.audience IN ('all','parents','group') AND (a.target_group_id IS NULL OR EXISTS
                  (SELECT 1 FROM guardian_links gl JOIN children c ON c.id=gl.child_id AND c.daycare_id=gl.daycare_id
                   WHERE gl.user_id=u.id AND gl.daycare_id=p.daycare_id AND c.group_id=a.target_group_id)))
                OR (r.name='caregiver' AND a.audience IN ('all','caregivers','staff','group') AND (a.target_group_id IS NULL
                  OR EXISTS(SELECT 1 FROM children c WHERE c.daycare_id=p.daycare_id AND c.caregiver_id=u.id AND c.group_id=a.target_group_id)
                  OR EXISTS(SELECT 1 FROM groups g WHERE g.id=a.target_group_id AND g.daycare_id=p.daycare_id AND g.lead_caregiver_id=u.id)
                  OR EXISTS(SELECT 1 FROM front_desk_assignments f WHERE f.daycare_id=p.daycare_id AND f.staff_id=u.id AND f.status='active' AND (f.group_id IS NULL OR f.group_id=a.target_group_id))))))))`,
        [job.device_id,daycareId,job.user_id,job.event_type,job.event_id,job.child_id]);
        if(!row || !await validSession(row,daycareId)){await pool.query(`UPDATE ${table} SET status='cancelled',lease_until=NULL WHERE id=$1 AND status='sending'`,[job.id]);continue;}
        const bodies={announcement:'A new announcement is available.',report:'A new daily report is available.',checkin:'A check-in was recorded.',pickup:'A pickup was recorded.'};
        const result=await provider(SEND_URL,{to:row.token,title:'Ankelba',body:bodies[job.event_type],sound:'default',channelId:'activity',
          data:{type:job.event_type,eventId:job.event_id,childId:job.child_id}});
        const ticket=result?.data;
        if(ticket?.status!=='ok'||!ticket.id){
          if(ticket?.details?.error==='DeviceNotRegistered')await pool.query('UPDATE push_devices SET active=false WHERE id=$1 AND daycare_id=$2',[job.device_id,daycareId]);
          const error=new Error('Push provider rejected delivery');error.retryable=['MessageRateExceeded','InternalServerError'].includes(ticket?.details?.error);throw error;
        }
        await pool.query(`UPDATE ${table} SET status='receipt',ticket_id=$2,lease_until=NULL,next_attempt_at=NOW()+INTERVAL '1 minute',last_error=NULL WHERE id=$1 AND status='sending'`,[job.id,ticket.id]);
      } catch(error){await retry(job,false,error,table);logger.error('Activity push send failed',{delivery_id:job.id});}
    }
    for(let count=0;count<25;count++) {
      const job=(await pool.query(`UPDATE ${table} SET status='checking',lease_until=NOW()+INTERVAL '2 minutes'
        WHERE id=(SELECT id FROM ${table} WHERE daycare_id=$1 AND ((status='receipt' AND next_attempt_at<=NOW()) OR
        (status='checking' AND lease_until<NOW())) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,[daycareId])).rows[0];
      if(!job)break;
      try {
        const response=await provider(RECEIPT_URL,{ids:[job.ticket_id]});const receipt=response?.data?.[job.ticket_id];
        if(!receipt)await pool.query(`UPDATE ${table} SET status='receipt',lease_until=NULL,next_attempt_at=NOW()+INTERVAL '5 minutes' WHERE id=$1 AND status='checking'`,[job.id]);
        else if(receipt.status==='ok')await pool.query(`UPDATE ${table} SET status='sent',lease_until=NULL,last_error=NULL WHERE id=$1 AND status='checking'`,[job.id]);
        else {if(receipt.details?.error==='DeviceNotRegistered')await pool.query('UPDATE push_devices SET active=false WHERE id=$1 AND daycare_id=$2',[job.device_id,daycareId]);
          await pool.query(`UPDATE ${table} SET status='failed',lease_until=NULL,last_error='Provider could not deliver notification' WHERE id=$1 AND status='checking'`,[job.id]);}
      } catch(error){await retry(job,true,error,table);logger.error('Activity push receipt check failed',{delivery_id:job.id});}
    }
  }
  async function run() {
    if (busy) return;
    busy=true;
    try {
      const {rows}=await (pool.control||pool).query('SELECT daycare_id FROM public.push_pending_tenants()');
      for (const row of rows) {
        try { await withTenant(Number(row.daycare_id),()=>deliver(Number(row.daycare_id))); }
        catch { logger.error('Push worker failed', { daycare_id:row.daycare_id }); }
      }
    } finally { busy=false; }
  }
  return {run,deliver};
}
module.exports={createPushWorker,request};
