'use strict';
require('dns').setDefaultResultOrder?.('ipv4first');
require('dotenv').config();
const app = require('./src/app');
const logger = require('./src/config/logger');

const PORT = process.env.PORT || 5000;

const db = require('./src/config/db');
const realtime = require('./src/modules/realtime/hub');
let server;
let realtimeHub;
let remindersTimer;
let billingAutomationTimer;
let subscriptionChangesTimer;
let pushTimer;
let emailTimer;
db.verifyRuntime().then(() => {
  server = app.listen(PORT, () => {
    logger.info(`Ankelba backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    if(process.env.NODE_ENV==='development'&&process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE==='true'){
      logger.warn('Subscription name-and-amount test matching is enabled locally; full matching is required before launch.');
    }
    const subscriptionChanges=require('./src/modules/saas/subscription-change-worker').createSubscriptionChangeWorker(db,logger);
    const emailTransport = require('./src/modules/email/transport').mailer;
    if (emailTransport) {
      const emailWorker = require('./src/modules/email/worker').createEmailWorker({ pool: db, transport: emailTransport, logger });
      const runEmail = () => emailWorker.run().catch(() => logger.error('Email worker failed'));
      runEmail(); emailTimer = setInterval(runEmail, 5000); emailTimer.unref();
    }
    const pushWorker=require('./src/modules/notifications/push-worker').createPushWorker({pool:db,logger});
    const runPush=()=>pushWorker.run().catch(()=>logger.error('Push worker failed'));
    runPush();pushTimer=setInterval(runPush,10000);pushTimer.unref();
    const activateChanges=()=>subscriptionChanges.run().catch(()=>logger.error('Scheduled subscription activation failed'));
    activateChanges();subscriptionChangesTimer=setInterval(activateChanges,60000);subscriptionChangesTimer.unref();
    const billingWorker=require('./src/modules/billing-automation/worker').fromEnvironment(db,logger);
    if(billingWorker){
      const runBilling=()=>billingWorker.run().catch(()=>logger.error('Billing automation worker failed'));
      runBilling();billingAutomationTimer=setInterval(runBilling,15*60*1000);billingAutomationTimer.unref();
    }
    if (process.env.SUBSCRIPTION_REMINDERS_ENABLED === 'true') {
      const worker = require('./src/modules/saas/subscription-reminders').fromEnvironment(db.control, logger);
      if (!worker) logger.warn('Subscription reminder emails are disabled: SMTP configuration is incomplete');
      else {
        const run = () => worker.run().catch(error => logger.error('Subscription reminder worker failed', {message:error.message}));
        run();
        remindersTimer = setInterval(run, 15 * 60 * 1000);
        remindersTimer.unref();
      }
    }
  });
  realtimeHub = realtime.attachRealtime(server);
}).catch(async error => {
  logger.error('Database security verification failed; server was not started', { message: error.message });
  await db.closeAll();
  process.exitCode = 1;
});

// Graceful shutdown — close pool connections on SIGTERM/SIGINT
process.on('SIGTERM', () => {
  clearInterval(emailTimer);
  clearInterval(remindersTimer);
  clearInterval(billingAutomationTimer);
  clearInterval(subscriptionChangesTimer);
  clearInterval(pushTimer);
  logger.info('SIGTERM received — shutting down gracefully');
  if (!server) return;
  realtimeHub?.close();
  server.close(async () => {
    await db.closeAll();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  clearInterval(emailTimer);
  clearInterval(remindersTimer);
  clearInterval(billingAutomationTimer);
  clearInterval(subscriptionChangesTimer);
  clearInterval(pushTimer);
  logger.info('SIGINT received — shutting down gracefully');
  if (!server) return;
  realtimeHub?.close();
  server.close(async () => {
    await db.closeAll();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
