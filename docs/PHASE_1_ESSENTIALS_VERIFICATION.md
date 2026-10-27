# Phase 1 essentials — 22 October 2026

Plan: [two-phase completeness plan](TWO_PHASE_COMPLETENESS_PLAN.md).

## Implemented

- Separate tenant and authentication/control PostgreSQL pools. Runtime uses APP_DB_* and CONTROL_DB_*; DB_* remains migration/provisioning-only.
- Runtime setup requires independent strong passwords, refuses privileged existing accounts, prints no credentials, and never grants both runtime groups to one login.
- Server startup verifies restricted role attributes, separate membership, forced RLS, fail-closed tenant reads, no table ownership or TRUNCATE permission on checked tables, and no control access to child records.
- Tenant grants exclude platform credentials and destructive schema/table privileges. Authentication credential revocation tables now have tenant policies. Daycare settings writes cannot update subscription columns through the tenant database role.
- Authentication identity lookup uses control access; parent child loading uses verified tenant context. Platform summaries use aggregate child counts without direct private-record access.
- Platform impersonation is closed at service and authentication layers; old impersonation tokens are rejected. Private portal services also reject platform principals.
- Self-approved subscription renewal is closed, and its frontend actions and simulated payment modal are removed. Platform operators retain explicit governance plan management.
- Account changes remount account-owned navigation, child/cart state and design state. Delayed child loads are ignored; stale authentication responses cannot replace a newer session. Session-expiry responses clear the active user, with old-token responses ignored.
- Forward migrations 023/024 cover previously unversioned profile/product fields and runtime privileges. Migration-017 fixtures remain available for compatibility tests; operational fixtures include supported UI fields; restricted integration tests start from the full migration chain.

## Verification

- `npm run test:essentials`: 104 reported tests passed, zero failed. Includes real restricted PostgreSQL HTTP login/profile/report tests, two-daycare read/write denial, concurrent pooled tenant queries, subscription denial, impersonation denial, suspension revocation, and existing profile-write conflict tests.
- `npm run test:daycare-auth`: 43 reported tests passed, zero failed. Corrected one stale fixture expectation that still accepted unversioned JWTs.
- Frontend `tsc --noEmit`: passed.
- Applied migrations 023/024 to the configured local development database and provisioned separate restricted runtime logins. Credential values are stored only in the ignored local `.env`.
- Configured local runtime verification and temporary HTTP `/health` smoke test passed. Smoke-test listeners were closed afterward.
- Existing application records were not edited or seeded. Existing unrelated `Motion.tsx` work was preserved.

## Deployment/setup

For another environment, configure migration credentials (`DB_*`) and independent runtime credentials (`APP_DB_*`, `CONTROL_DB_*`) as shown in `backend/.env.example`, then run:

```text
npm run migrate
npm run db:runtime:setup
npm start
```

Migration 023 preserves existing columns and data on rollback. Migration 024 deliberately does not restore excessive privileges on rollback. Apply security changes forward rather than relying on rollback to reopen permissions.

## Remaining for Phase 2

Separate role navigation and restored-session routing; caregiver report/health/communication UI; announcement detail/navigation; support and notification journeys; checkout instructions; persistent preferences/reminders; order idempotency and other stale-edit guards; unavailable provider messaging; responsive/accessibility review and complete device/browser acceptance tests.

The frontend state changes have compilation verification, not a completed browser/device account-switch acceptance run. The backend checks establish the tested boundaries, not a claim that every endpoint or every UI flow has been exhaustively audited. Digital payments, biometric devices, and the newer authentication client's coordinated cutover remain outside Phase 1.
