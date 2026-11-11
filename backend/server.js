'use strict';
require('dotenv').config();
const app = require('./src/app');
const logger = require('./src/config/logger');

const PORT = process.env.PORT || 5000;

const db = require('./src/config/db');
let server;
let remindersTimer;
let billingAutomationTimer;
let subscriptionChangesTimer;
db.verifyRuntime().then(() => {
  server = app.listen(PORT, () => {
    logger.info(`Ankelba backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    if(process.env.NODE_ENV==='development'&&process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE==='true'){
      logger.warn('Subscription name-and-amount test matching is enabled locally; full matching is required before launch.');
    }
    const subscriptionChanges=require('./src/modules/saas/subscription-change-worker').createSubscriptionChangeWorker(db,logger);
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
}).catch(async error => {
  logger.error('Database security verification failed; server was not started', { message: error.message });
  await db.closeAll();
  process.exitCode = 1;
});

// Graceful shutdown — close pool connections on SIGTERM/SIGINT
process.on('SIGTERM', () => {
  clearInterval(remindersTimer);
  clearInterval(billingAutomationTimer);
  clearInterval(subscriptionChangesTimer);
  logger.info('SIGTERM received — shutting down gracefully');
  if (!server) return;
  server.close(async () => {
    await db.closeAll();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  clearInterval(remindersTimer);
  clearInterval(billingAutomationTimer);
  clearInterval(subscriptionChangesTimer);
  logger.info('SIGINT received — shutting down gracefully');
  if (!server) return;
  server.close(async () => {
    await db.closeAll();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
