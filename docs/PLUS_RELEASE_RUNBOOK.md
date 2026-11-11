# Standard / Plus release preparation

The code is implemented locally. This runbook does not select or deploy a production destination, change real prices/receiving accounts, enable external delivery, or approve real money.

## Preflight

1. Select the actual staging/production environment and its owner. Review the release diff and environment configuration; do not copy local secrets or synthetic fixture credentials into it.
2. Run `npm run release:readiness` from `backend`. For the configured local database only, add `-- --local-database` to inventory pending migrations and account/price readiness without printing their values.
3. Confirm all six package prices and receiving details in the super-admin console. The development database intentionally retains the administrator's prior values, including a 1 ETB Plus monthly price observed during development. Price presence alone is not a pricing decision.
4. Set the intended frontend origin, trusted Veritas API configuration, separate restricted tenant/control PostgreSQL logins, secret values and application environment through the deployment's secret/configuration mechanism. Use HTTPS for deployed endpoints. Do not print `.env` or API keys in logs/reports.
5. Review supported authentication mode. Interactive acceptance covered the existing password/JWT login, including all four roles and separate sessions. The optional preview/MFA authentication path was not covered and must not be advertised as production-validated by this work.

## Migration and backup

- Take a private custom-format backup, verify the archive and restore it into an isolated database. Run migrations and validate preservation of existing accepted terms, prices, recipients, references, orders and invoices there before applying to the selected environment.
- Migrations 054/055 add accepted future package changes/payment anchors and immutable cash-return evidence. They do not intentionally change existing prices, receiving settings or paid promises.
- These evidence-preserving migrations have no destructive down implementation. Use a reviewed roll-forward correction; do not assume rollback removes financial evidence.
- Arrange scheduled/offsite backups and demonstrate restore in the actual deployment environment. Successful local rehearsal does not prove an offsite backup schedule exists.

## Workers and monitoring

- Run the backend under a supervised process with durable PostgreSQL storage and working health/log monitoring.
- Scheduled subscription changes are checked on startup and every 60 seconds; admin summary/application paths also recover due changes. Verified future money activates only at its accepted boundary, with current status/capacity checks. Blocked changes retain the payment for operator resolution.
- `BILLING_AUTOMATION_ENABLED=true` enables monthly invoice/reminder orchestration. Each daycare must independently preview and enable its schedule. Multi-worker retries are protected by transaction/unique keys.
- Keep `BILLING_AUTOMATION_EMAIL_ENABLED=false` until SMTP and controlled recipient consent are ready. Subscription expiry emails have their own existing `SUBSCRIPTION_REMINDERS_ENABLED` configuration.
- Alert on worker errors, repeated failed jobs, blocked paid subscription changes and provider failures. Test restart/recovery in staging with disposable or explicitly designated test records.

## Payment acceptance

- Turn off the local name-and-amount diagnostic mode before real acceptance. Production ignores this development-only bypass. Verify strict amount, currency, account/name, reference, date and successful-provider evidence; mismatches remain pending.
- Use a genuine, designated transfer per selected live provider and the matching configured receiver/expected amount. Test mismatch/reuse without approving unrelated historical receipts or duplicating an actual payment.
- Telebirr's last authorized lookup returned upstream HTTP 502. Treat it as unvalidated until the external provider produces a successful real lookup. A healthy API health endpoint is insufficient evidence.
- Cash shop settlement/refund records do not transfer money. The first refund workflow records a full independently completed return of a non-demo daycare cash payment. Pending, digital, partial or ambiguous refunds require a separate reviewed reconciliation process.
- Preserve original receipts and reference claims through cancellation/refund. Reporting retains gross payment dates and records cash returns separately by their attested date.

## Email acceptance

- Configure SMTP privately. Use controlled consenting recipients, daycare enablement and explicit parent opt-in; test opt-out and balance changes before delivery.
- In-app reminder recording is transactional. SMTP is an external side effect: a crash after provider acceptance but before the local status update can produce a duplicate retry. Deterministic Message-ID does not guarantee exactly-once delivery. Resolve or explicitly accept this operational limit before enabling real recipients.

## Verification and handoff

- Run `npm run test:plus`, `npm run test:subscriptions`, `npm run test:essentials`, frontend tests and `tsc --noEmit` in the appropriate isolated/test environment. Do not use the default legacy `master_audit.js` against a live database as a substitute for these disposable suites.
- The optional `npm run test:ui:fixture` creates an isolated local database and loopback API on port 5300; its credentials file is ignored under `tmp/subscription-backups/plus-ui-acceptance/`. Start a separate frontend with `EXPO_PUBLIC_API_URL=http://localhost:5300/api` on a different port, then `npm run test:ui:check`.
- Stop the fixture with `npm run test:ui:stop`; it validates the owned process marker and cleans up its exact database, roles and credentials file. Follow the fixture script's guarded recovery mode after an interrupted run; never enumerate and delete arbitrary databases.
- Confirm keyboard/narrow-screen behavior and real Android/iOS acceptance where those devices/builds are available. Browser emulation does not establish physical-device behavior.
- Deliver reports with implemented scope, exact test results, unresolved provider/configuration prerequisites and production rollout approval.
# Daycare receipt integration — local follow-up, 10 November 2026

Migration 056 has been backed up, rehearsed on a restored copy and applied locally, preserving accepted financial history. See [the integration report](reviews/daycare-receipts-integration-final.md) and its frontend/security/QA reports for evidence. Run `npm run test:daycare-payments` in the backend for the strict disposable receipt/lifecycle suites. Daycares configure their own receiving accounts under Finances & Fees; platform subscription accounts are separate. Both packages support care-fee verification; Plus retains new shop activity and monthly automation. Daily/weekly billing is deferred.

Before launch, disable local SaaS name/amount diagnostic matching, configure approved real prices and destinations, complete genuine receipt and SMTP acceptance, validate workers/backups and select the production target. Daycare receipt matching always remains strict. Neither migration nor test success proves live provider availability or authorizes production deployment.

