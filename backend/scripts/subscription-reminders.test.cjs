'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createReminderWorker,fromEnvironment} = require('../src/modules/saas/subscription-reminders');

test('reminders are queued once per period and sent to the current admin', async () => {
  const sql = [];
  let claims=0;
  const pool = {async query(query, params) {
    sql.push({query, params});
    if (query.startsWith('UPDATE subscription_reminders r SET')) return {rows:claims++ ? [] : [{id:4,daycare_id:5,user_id:6,period_end:'2026-11-10T09:00:00Z',attempts:1}]};
    if (query.startsWith('SELECT u.email')) return {rows:[{email:'admin@example.test',name:'Test daycare'}]};
    return {rows:[]};
  }};
  const messages=[];
  const worker=createReminderWorker({pool,from:'platform@example.test',portalUrl:'https://example.test',transporter:{async sendMail(message){messages.push(message);}}});
  assert.equal(await worker.run(),1);
  assert.match(sql[0].query,/ON CONFLICT/);
  assert.match(sql[0].query,/status='cancelled'/);
  assert.match(sql[1].query,/SKIP LOCKED/);
  assert.match(sql[1].query,/LIMIT 1/);
  assert.equal(messages[0].to,'admin@example.test');
  assert.match(messages[0].text,/10 November 2026/);
  assert.ok(sql.some(item=>item.query.includes("status='sent'")));
});

test('delivery failure is retried and stale period is not sent', async () => {
  const writes=[];
  let recipient=true;
  let claims=0;
  const pool={async query(query){writes.push(query);if(query.startsWith('UPDATE subscription_reminders r SET'))return{rows:claims++ % 2 ? [] : [{id:1,daycare_id:2,user_id:3,period_end:'2026-11-10T00:00:00Z',attempts:1}]};if(query.startsWith('SELECT u.email'))return{rows:recipient?[{email:'a@example.test',name:'A'}]:[]};return{rows:[]};}};
  const worker=createReminderWorker({pool,from:'x',portalUrl:'https://example.test',logger:{error(){}},transporter:{async sendMail(){throw new Error('SMTP unavailable');}}});
  await worker.run();
  assert.ok(writes.some(q=>q.includes("status='pending'")));
  recipient=false;
  await worker.run();
  assert.ok(writes.some(q=>q.includes("status='cancelled'")));
});

test('delivery failure marks reminder as failed when attempts reach cap', async () => {
  const writes=[];
  let claims=0;
  const pool={async query(query){
    writes.push(query);
    if(query.startsWith('UPDATE subscription_reminders r SET')) {
      return {rows:claims++ ? [] : [{id:10,daycare_id:2,user_id:3,period_end:'2026-11-10T00:00:00Z',attempts:5}]};
    }
    if(query.startsWith('SELECT u.email')) return {rows:[{email:'a@example.test',name:'A'}]};
    return {rows:[]};
  }};
  const worker=createReminderWorker({pool,from:'x',portalUrl:'https://example.test',logger:{error(){}},transporter:{async sendMail(){throw new Error('Permanent failure');}}});
  await worker.run();
  assert.ok(writes.some(q=>q.includes("status='failed'")));
});

test('email worker is unavailable without complete SMTP settings', () => {
  const names=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM','FRONTEND_URL'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {delete process.env.SMTP_HOST; assert.equal(fromEnvironment({},console),null);}
  finally {for(const name of names) if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
});
