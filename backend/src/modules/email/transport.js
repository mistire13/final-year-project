'use strict';
const nodemailer = require('nodemailer');

function createMailer(env = process.env, factory = nodemailer.createTransport) {
  if (env.NODE_ENV === 'test' || env.EMAIL_DELIVERY_ENABLED !== 'true') return null;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = env;
  if (![SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM].every(Boolean)) return null;
  const transport = factory({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465,
    requireTLS: Number(SMTP_PORT) !== 465, auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true });
  return {
    verify: () => transport.verify(),
    async sendMail(message) {
      const result = await transport.sendMail({ ...message, from: SMTP_FROM });
      if (!result.accepted?.length || result.rejected?.length) {
        throw Object.assign(new Error('Email recipient was not accepted'), { code: 'EMAIL_REJECTED', permanent: true });
      }
      // Accepted means the relay accepted it, not proof of inbox delivery.
      return { messageId: result.messageId, accepted: true };
    },
  };
}
const mailer = createMailer();
module.exports = { createMailer, mailer };
