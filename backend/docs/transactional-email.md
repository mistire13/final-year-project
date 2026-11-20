# Transactional email

The shared Nodemailer transport reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` and `EMAIL_DELIVERY_ENABLED` from the ignored backend `.env`. SMTP credentials never enter frontend bundles. Brevo's SMTP key is different from its HTTP API key. Use STARTTLS on 587 or 2525, or implicit TLS on 465. `FRONTEND_URL` must be HTTPS in production; development also accepts loopback and private LAN addresses. Update it when the PC's LAN address changes.

Run migrations before starting the worker. `node scripts/verify-email.cjs` checks the connection and authentication without sending mail. SMTP verification does not confirm sender approval or inbox delivery. Provider acceptance appears as `accepted`, never as a claim of delivery. Brevo's transactional activity log remains the source for delivery and bounce information.

New database events enqueue emails in the same transaction. No historical events are backfilled. Password reset and verification codes have priority over routine events. Workers claim jobs with leases and retry temporary failures up to five times, with increasing delays. Expired codes are cancelled and encrypted payloads removed. Accepted jobs are not retried; an ambiguous SMTP timeout after acceptance can still cause a duplicate on retry because SMTP provides no exactly-once guarantee.

Coverage:
- Password reset codes and email verification: six digits, ten-minute expiry, five guesses, one-minute resend cooldown, five requests per address per 15 minutes and IP rate limits.
- Password changes revoke sessions, pending authentication challenges and old reset tokens. MFA factors remain intact. Verification alone does not log users out.
- New accounts and changed passwords; daycare application status updates.
- Unread messages, announcements and urgent alerts, daily reports, health/incident records, check-ins and pickups.
- Care fee invoices and receipts; shop order/payment status changes, with Plus access checked at delivery.
- Existing Plus billing reminders, subscription renewal reminders and subscription payment recovery use the same transport. Billing reminders retain their separate parent opt-in.

Routine daycare event emails require a verified address, active account/daycare, current guardian/audience access and enabled notification preferences. Staff use Email settings in their workspace. Parents use Security & Password in the app. Turning off daycare email also suppresses opted-in billing reminders; security and account recovery email remain available. Sensitive message and child details are read inside the authenticated app, not copied into routine email.

The current web and updated mobile clients use `/api/email/request-code` and `/api/email/confirm-code`. Existing installed mobile clients can still request and use the older long reset token, now delivered through SMTP. The separate feature-flagged preview authentication module retains its existing local outbox; its new clients can use the shared code endpoints with `account_type: platform` or `daycare`. The shipped web operator portal currently uses legacy user accounts and the default `daycare` account type.

Run `node --require ./scripts/helpers/strict-test-environment.cjs --test scripts/email-delivery.test.cjs`. Tests use generated disposable databases and fake transports; NODE_ENV=test disables the real SMTP transport.

Diagnostics (using the control database role):
```sql
SELECT kind,status,count(*) FROM email_outbox GROUP BY kind,status ORDER BY kind,status;
SELECT last_error,count(*) FROM email_outbox WHERE status IN ('pending','failed') GROUP BY last_error;
```
Never display encrypted payloads, reset codes or SMTP credentials in logs. Rotate exposed SMTP keys in Brevo and update only the ignored backend `.env`, then restart the backend. Brevo quotas and sender approval apply to all messages, including reset codes.
