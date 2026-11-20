'use strict';
require('dotenv').config();
const { createMailer } = require('../src/modules/email/transport');
const transport = createMailer({ ...process.env, EMAIL_DELIVERY_ENABLED:'true' });
if (!transport) { console.error('Complete the backend SMTP settings first.'); process.exitCode=1; }
else transport.verify().then(() => console.log('SMTP connection, encryption and credentials verified. No email sent.'))
  .catch(error => { console.error('SMTP verification failed:', ['EAUTH','ETIMEDOUT','ECONNECTION','ESOCKET'].includes(error.code) ? error.code : 'CONNECTION_FAILED', error.responseCode || ''); process.exitCode=1; });
