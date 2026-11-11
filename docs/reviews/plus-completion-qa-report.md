# Standard / Plus completion QA and release readiness

9 November 2026. QA agent: `plus_qa_final`. Status: backend completion regression **158/158 passed**; disposable authenticated API acceptance **29/29 passed**; visual browser acceptance and application migration rehearsal are owned by root and reported separately.

## Disposable authenticated acceptance harness

Added `backend/scripts/plus-ui-acceptance-fixture.cjs`. It uses the existing guarded `withCurrentDatabase` helper, creates the complete current schema in a unique owned test database, creates separate restricted tenant/control PostgreSQL logins, verifies their permissions, and binds the API only to loopback. The configured application database is never seeded. Run `node scripts/stop-plus-ui-acceptance.cjs` from `backend` to request cleanup through an exact-PID stop marker; this works even when tool-managed stdin closes. The fixture closes HTTP connections/pools, removes its temporary runtime logins, drops its exact disposable database and removes its credentials file. Interactive stdin also accepts `stop` when available.

Run from `backend` with the bundled Node executable:

```powershell
$env:NODE_ENV='test'
$env:PLUS_UI_API_PORT='5300'
& 'C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe' scripts/plus-ui-acceptance-fixture.cjs
```

Credentials and record IDs are generated under the already ignored `tmp/subscription-backups/plus-ui-acceptance/fixture.json`. It contains only disposable synthetic credentials, no real credentials or bank receipts. Do not publish it or commit it. JWT signing material and temporary database login passwords stay in memory and are not printed. Authentication uses the real existing password/JWT application flow, not fabricated browser tokens or mocked authentication middleware. The frontend's preview MFA session flow is separate and is not covered by this harness.

The fixture supplies:

- Platform operator, Plus administrator, caregiver and linked parent, plus an unrelated parent in another daycare.
- Disposable Plus/Standard pricing, classroom/child, actual attendance, unpaid child invoice, and weekday schedule draft.
- A non-demo cash-paid shop order recorded through the real service with exact confirmation/reason, for refund acceptance.
- Disposable CBE/Abyssinia receiver settings for payment-method rendering. Provider lookups and Nodemailer blocked by test adapters; background email workers disabled. No live bank lookup, external email, or other external delivery is allowed by this harness.

Start a separate frontend process with `EXPO_PUBLIC_API_URL=http://localhost:5300/api` and a spare web port, e.g. 8083. Use normal login screens: administrator/staff via `/admin/login`, parent `/app`, platform `/super-admin` (the existing portal gate presents its own login). Use the generated emails/password; do not manually inject auth tokens. Restart the fixture after migration or server-module edits so the schema and loaded service code match the final files.

`backend/scripts/plus-ui-acceptance-check.cjs` validates the running fixture via real HTTP logins. It passed **29/29 checks** both initially and again after restarting with migrations 054/055: anonymous/wrong-password rejection, five role identities, role-specific journeys, parent/admin/caregiver/operator separation, cross-tenant child denial, analytics/scheduling permissions, email preference access, logout revocation and preservation of another user's session. It prints no credentials or tokens. These are API acceptance checks, not claims of visual browser coverage.

The initial tool-managed server's stdin closed unexpectedly, preventing interactive shutdown. Recovery verified its exact recorded PID/command line, generated database name, authenticated disposable identity and two test-only runtime logins before stopping that process and removing precisely its database/logins. The `--recover-interrupted` option documents that narrowly guarded fallback; normal future stops use the graceful marker.

## Read-only readiness inventory

Added `backend/scripts/plus-release-readiness.cjs`. By default it reports only environment presence/flags. `--local-database` explicitly adds a `BEGIN READ ONLY` local database inventory of migrations, configured price readiness and enabled receiving-account field presence. It prints no amounts, account details, names, credentials or API keys. It does not deploy, migrate, send mail, contact a bank provider or choose a production target.

Initial local inventory observed:

- Migrations 054 and 055 pending; do not deploy code relying on them before rehearsing and applying them.
- Both packages' three price slots and enabled receiving-account fields are configured locally.
- Name-and-amount test mode remains configured locally. Strict full matching must be the explicit release configuration; QA did not change the user's local testing preference.
- Billing automation enabled; billing email delivery and subscription reminder delivery disabled.
- SMTP configuration incomplete and frontend origin unset in the inspected local configuration.
- Separate tenant/control login names present. Running worker heartbeat, exact runtime grants, successful SMTP delivery and live bank acceptance require independent operational proof.
- Nine local backup files found. A file count does not prove a successful restore or offsite retention.
- Preview authentication configuration explicitly rejects production activation; this must not be presented as production-ready MFA authentication.

## Release checklist

- Confirm an actual deployment destination and operator authorization. No production deployment is authorized by this implementation task.
- Back up the intended database; restore to an isolated database; rehearse all new migrations and record integrity/count checks before touching the application database. Protect historical payment/reference evidence.
- Run final backend completion tests and existing payment, subscription, safety, tenancy and concurrency regressions. Run frontend tests/TypeScript and record visual desktop/narrow-screen coverage for each role.
- Confirm Standard/Plus live prices and enabled receiver details through the operator screen. Confirm strict matching configuration and secret handling; credentials belong in runtime configuration, not examples committed to source control.
- Verify normal-process scheduled subscription activation/recovery and billing workers start with the intended flags. Inspect logs/health and retry behavior; enabled flags alone do not prove execution.
- Configure the actual frontend origin and authenticated transport. Keep operator/daycare/parent account boundaries distinct and verify logout/revocation behavior.
- Configure SMTP with a consenting test recipient; prove one controlled delivery and retry behavior. Do not claim the mocked delivery tests prove live SMTP.
- Obtain suitable genuine receipts for CBE/Abyssinia live acceptance and verify exact amount, recipient/account, freshness, reference binding/reuse handling. Telebirr's previously observed upstream 502 remains an external dependency; a local test does not resolve it.
- Validate cash refunds as records of independently returned cash, including original receipt, exact full amount, explicit stock disposition and immutable evidence. The application must not claim to transfer money.
- Preserve application database settings and financial history; seed synthetic paid subscriptions only in disposable databases.

## Final backend integration evidence

The final combined command passed **158 tests, six suites, zero failures and zero skips**, in approximately 68 seconds. It used the complete latest disposable schema, including migrations 054/055, with strict test configuration explicitly set. All integration writes stayed in generated owned test databases. Exact command, working directory `backend`:

```powershell
$env:NODE_ENV='test'
$env:SUBSCRIPTION_NAME_AMOUNT_TEST_MODE='false'
& 'C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe' --test --test-concurrency=1 --test-reporter=spec scripts/plus-package-access.test.cjs scripts/plus-analytics.test.cjs scripts/plus-billing-automation.test.cjs scripts/plus-staff-scheduling.test.cjs scripts/plus-billing-preferences.test.cjs scripts/plus-shop-refunds.test.cjs scripts/subscription-scheduled-changes.test.cjs scripts/subscription-access.test.cjs scripts/subscription-payments-unit.test.cjs scripts/subscription-verification-match.test.cjs scripts/subscription-reminders.test.cjs scripts/subscription-paid-flow-integration.test.cjs scripts/subscription-runtime-roles.test.cjs scripts/subscription-operations-integration.test.cjs scripts/subscription-ledger-migration.test.cjs scripts/subscription-overdue-restart.test.cjs scripts/veritas-client.test.cjs scripts/subscription-bank-switch.test.cjs scripts/qa-subscription-comprehensive.test.cjs scripts/essential-security.test.cjs scripts/phase1-payments.test.cjs scripts/phase2-daycare-isolation.test.cjs
```

Detailed log: ignored `tmp/subscription-backups/plus-ui-acceptance/completion-backend-final.log`. Coverage includes authenticated roles/RLS, original safety/care behavior, inventory/cash settlement, immutable full cash refunds and exact/concurrent retries, cross-order key/reference conflicts with loser rollback, gross/refund/net accounting dates, scheduled terms/capacity/status/activation/cancellation/replay, receiving-bank adapters, reference reuse/alias ledgers, legacy migration preflights, paid signup/renewal/restart, and reminder recovery.

The first combined run passed 156/158. Its two failures were caused by an isolated unit pool stub still matching the former `SELECT application_id FROM ...` query after the product correctly changed to `SELECT application_id,daycare_id FROM ...` for lock ordering. QA updated only the stub projection/returned IDs; the unit suite then passed 11/11 and the complete command passed 158/158. No product assertion or strict matching behavior was weakened.

The earlier core implementation's 147-test results remain separately recorded in `plus-final-qa.md`; the 158-test result supersedes that acceptance count for the completion changes. This QA agent did not run a restored application backup migration rehearsal or visual desktop/mobile browser walkthrough; root owns that evidence. The active disposable UI fixture was deliberately retained at root's request during its browser work.

The obsolete `practical-subscriptions.test.cjs` was excluded from the final supported-flow command: the subscription owner confirmed it still assumes the removed free-trial/unpaid-signup contract and spreads read-only feature metadata into updates. It needs an explicit test-maintenance rewrite rather than weakening the current payment requirement. This report does not claim every historical script in the repository passes unchanged.

## Independent implementation review (initial pass)

The cash refund service and migration 055 were read independently. No blocking issue was found in the reviewed tenant/parent binding, order locking, exact amount/reference verification, collection/stock-disposition rules, original payment preservation, transactional inventory/refund/order/audit writes, or immutable database trigger/unique evidence constraints. This finding remains conditional on the final dedicated concurrency/rollback tests. A minor replay robustness issue was reported and root fixed it: the service now canonicalizes input field order before hashing, and the test explicitly accepts reordered equivalent JSON. QA added simultaneous cross-order request-key and case-normalized external-reference collision assertions; the losing transaction must retain its original payment, paid order, stock and absence of refund evidence.

The scheduled-change service and migration 054 were read independently. Accepted future terms and paid-through anchors are preserved; verification binds money to that agreement; activation rechecks state/capacity, retains blocked verified payments and prevents competing overlapping renewal paths. The normal server startup initially did not invoke the new change worker; this was reported and root added startup execution, a 60-second timer and SIGINT/SIGTERM timer cleanup. These lifecycle hooks were checked in source; service tests and a visible enabled flag do not by themselves prove a running deployed worker.
