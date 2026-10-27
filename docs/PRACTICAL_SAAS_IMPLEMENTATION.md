# Practical Ankelba SaaS journey

Started 24 October 2026; implementation verified 25 October 2026 (Africa/Addis_Ababa). This supersedes the earlier blueprint's billing deferral for the functionality described here. The goal is a working final-year-project system with real persisted workflows, rather than sales-demo screens.

## Decisions and assumptions

- Use Brightwheel's guided setup and role-focused journey as inspiration; keep Ankelba's branding, SRS scope and staff-controlled pickup verification.
- Customers select Standard or Premium before applying. Trial is a subscription phase, not a package. Both packages include the existing core care and safety functions; capacity distinguishes them initially.
- Package prices are operator-configurable in ETB. Do not invent approved commercial prices. An unconfigured price is stated explicitly and prevents recording a paid renewal.
- Start the selected package's trial on approval. Snapshot the accepted package terms so catalog edits cannot silently alter an existing subscription.
- Keep daycare approval/suspension separate from subscription state. Expiry does not interrupt safe pickup or hide child records during the project pilot. It requires an operator renewal decision; no automatic charging or payment-provider claims.
- Support manual payment confirmation with a reference, exact amount, actor, reason, idempotency key and subscription history. This is separate from parent store orders and daycare tuition fees.
- Operator login has its own route and browser token storage, with server role checks. Remove operator navigation from public customer pages. No impersonation or unrestricted child-record access is added.
- Target the existing small pilot, paginated operator records and existing runtime DB pools. Preserve RLS, optimistic concurrency and transactional writes. Optional services must not break attendance or pickup.
- The project team owns package configuration and support. External email invitations and automated recurring payment collection remain separate integrations, not capabilities implied by these screens.

## Implementation sequence

1. Add persistent package catalog, separate subscription fields and append-only subscription events with restricted DB grants.
2. Implement catalog reads/configuration, package-bound registration, credential-protected application status, selected-package approval, tenant subscription view and audited lifecycle actions.
3. Replace the public registration dropdown with package cards, billing-period selection, accepted-terms summary and customer-only success navigation.
4. Add application-status page, isolated operator sign-in, subscription workbench, package configuration and persistent subscription histories.
5. Add daycare subscription details and a resumable setup checklist derived from saved center/staff/classroom/family/duty records.
6. Verify lifecycle, stale edits, retries, role/tenant access, price snapshots, approval, expiry and rejected applications in an isolated database. Run TypeScript/build checks and inspect the live frontend without creating fixtures in the user's clean application database.

## Acceptance

- A customer can compare packages, choose terms, apply, securely check status, receive approval and see the selected package and actual trial dates.
- An operator can configure future package offers, review applications, inspect subscription state, extend a trial, record a manual renewal and cancel future renewal with attributable history.
- Repeated payment confirmation cannot create a second renewal. Stale changes fail rather than overwriting newer decisions. Catalog changes do not change accepted terms.
- A daycare admin sees only their own subscription and setup progress. Parent/caregiver accounts cannot access operator or billing administration.
- Safety workflows remain available under the documented pilot expiry policy.
- Existing manually entered data and the preserved superadmin are retained. Only system catalog configuration is provisioned by the migration.

## Applied result and verification

- Migration **034_practical_subscriptions.js** applied to the local application database after a full PostgreSQL backup. The existing two user accounts and one manually entered daycare were retained. No acceptance fixtures were added to that database. Prices remain unconfigured until an operator enters actual project-approved offers.
- Customer entry: `/` → package comparison → selected-terms registration → `/application-status` → `/admin/login` after approval. Public pages have no operator-review button/link. Existing `/super-admin` links remain a compatibility alias; the dedicated operator entry is `/platform/login`.
- Operator workbench: **Subscriptions & packages**, including catalog configuration, current subscription summary, trial extension, agreed package changes, manual renewal, cancellation/resumption and history. The former unrestricted plan-edit endpoint now rejects requests and directs callers to the audited workflow.
- Daycare workspace: persisted-record setup checklist on the dashboard and current subscription/history on **Center profile & plan**. Package badges no longer claim that an already renewed center is still trialing.
- `npm run test:subscriptions`: **8 passing checks**, using a generated disposable PostgreSQL database. Covers selected terms, pending/rejected applications, protected endpoints, catalog concurrency, accepted-price snapshots, simultaneous renewal retries, payment-reference reuse, stale changes, cancellation/resumption, expiry/extension, tenant-owned summaries and actual RLS filtering of subscription history.
- Existing frontend `portal.test.cjs`: **5 passing checks**, run with bundled Node 24.19.0. Covers attendance totals/timestamps, staff duty scope, CSV safety and caregiver/pickup separation.
- TypeScript `tsc --noEmit`: passed. Production web export: passed, **1,453 modules**. The export emits environment color warnings; no build error. Use the bundled Node runtime; the system Node 22.11 does not support this TypeScript test entry and is below Expo 57's documented minimum.
- Browser verification used the live customer pages and a separate disposable backend/database with a production frontend build. Verified annual Premium selection carries into the registration summary; protected application-status fields; operator login; incorrect renewal amount rejected; correct manual renewal saved with a paid-through date and history; package catalog edit saved; daycare sees its original **100 ETB/month** accepted price after the future catalog changed to **120 ETB/month**; dashboard derives **1 of 6** setup steps from saved contact details; operator session survives signing in as daycare admin in the same browser. All synthetic prices and accounts belonged to the disposable database, which was removed after verification.
- Live package comparison evidence: [package selection](screenshots/subscription-package-selection.png). Manual test instructions are in [MANUAL_MVP_TEST.md](MANUAL_MVP_TEST.md).

## Practical limits

- This is a working public/application/subscription/setup improvement, not a claim that every proposed “360 management” capability or every SRS acceptance criterion is complete.
- No payment provider is connected for subscription collection. A manual confirmation records an operator's verified receipt; it does not transfer funds. No unconfigured price is treated as a free paid subscription.
- Trial expiry and cancellation are visible lifecycle states with the explicit care-preserving pilot policy. Commercial automatic enforcement and recurring collection require a later policy/integration decision.
- External invitation emails, automated checkout report emails, actual biometric hardware and the earlier unresolved SRS acceptance items remain separate work. Existing family/caregiver provisioning continues to use the current account setup flow; the new checklist does not imply invitation delivery exists.
- Existing daycare applications created before this revision can have no accepted-price snapshot. Review their package through the workbench and record an agreed current offer before attempting a paid renewal.
- Browser checks covered the available narrow web viewport. They do not establish physical Android/iOS device behavior, comprehensive accessibility, mail delivery or a full network-interruption matrix.
