# Standard / Plus final QA

Date: 2026-11-09. Agent: `plus_qa_final`.

## Scope and database safety

Backend verification used the bundled Node executable at `C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe`, with `NODE_ENV=test`. Integration tests used the repository's `withCurrentDatabase` / `withOperationalDatabase` helper. It creates uniquely named, locally owned disposable databases, checks their identity, and drops the exact databases after use. No application database migrations or application data writes were performed by this QA agent. No real receipts were consumed, no real paid subscriptions were created, and no external email or user messages were sent. Mail delivery assertions used mocked transports and synthetic recipients.

## Verified final results

The following command passed **70 tests, 0 failures, 0 skipped** against the latest schema, including migration 053:

```powershell
$env:NODE_ENV='test'
& 'C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe' --test --test-reporter=spec scripts/plus-package-access.test.cjs scripts/plus-analytics.test.cjs scripts/plus-billing-automation.test.cjs scripts/plus-staff-scheduling.test.cjs scripts/plus-billing-preferences.test.cjs scripts/essential-security.test.cjs scripts/phase1-payments.test.cjs scripts/phase2-daycare-isolation.test.cjs
```

Working directory: `backend`. Detailed local output: `tmp/plus-qa-features-isolation-final.log`.

This exact 70-test command was rerun after the reviewer's store transaction/billing recovery changes and root's cash payment row-count guard. It again passed **70/70, zero failures or skips**, including the standalone parent preferences unit test. No further fixtures or product code were changed for this rerun. Earlier output remains in `tmp/plus-qa-features-isolation.log`.

Coverage includes:

- Standard feature denial, paid-period entitlement snapshots, legacy access, cancellation semantics, and Plus catalogue naming.
- Shop idempotency, inventory checkout/cancellation evidence, Standard downgrade denial for new sales, preserved existing order history, exact cash settlement evidence, and collection after downgrade.
- Inventory movement rows prove actual creation, checkout and cancellation changes `[3, -2, -1, 1]`, with retries leaving stock unchanged.
- Analytics reconciliation, calendar/date validation, exact amounts, attendance, occupancy observations, report isolation, and restricted runtime access.
- Billing preview before save, exact fees/discounts, duplicate/concurrent generation, reminder retry/idempotency, paid-invoice recheck, and history after downgrade.
- Persisted parent email preference defaults, opt-in and opt-out, cross-tenant rejection, and readability after downgrade; separate mocked preference privacy regression.
- Staff schedules, overnight duration bounds, conflicting shifts, leave/substitution scoping, publication review, and duplicate/cross-tenant rejection.
- Restricted PostgreSQL roles/RLS, missing scope failing closed, migration rollback/reapply, biometric/pickup/audit integrity, parent/staff HTTP permissions, order stale-write handling, and cross-daycare store/search/dashboard isolation.

## Issues found and resolved during QA

1. The new package access fixture omitted mandatory daycare contact email and role records. Added only synthetic test data.
2. Existing shop tests assumed Standard tenants could sell. Marked those scenario fixtures explicitly Plus-eligible, preserved the phase-two pre-RLS upgrade test, and added the current entitlement fields to that synthetic old-schema fixture.
3. Existing package-update test spread newly returned read-only feature metadata into its strict mutation payload. Removed those output-only fields from the synthetic request.
4. Existing cash settlement test omitted the new amount/confirmation/reason evidence. Added exact synthetic evidence.
5. Migration 035 reapplication assumed every insertable table had an `id` column; new billing settings do not. With root authorization, restricted sequence discovery to tables that actually have an undeleted `id` attribute. Essential rollback/reapply and dependent integrity assertions now pass.
6. Subscription CBE flow imported an undefined `cbeReceipt` helper. Root restored URL parsing/export, suffix extraction, and exact reference binding; bank-specific regression cases pass on rerun.
7. Cash settlement reused a SQL parameter with incompatible text/varchar inference, causing PostgreSQL 42P08 and HTTP 500. Root added explicit casts; package downgrade settlement and essential order scenarios pass on rerun.

## Subscription regression

Final full-suite result: **77 tests passed, 0 failures, 0 skipped**, including six suites. Working directory: `backend`. Exact command:

```powershell
$env:NODE_ENV='test'
& 'C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe' --test --test-concurrency=1 --test-reporter=spec scripts/subscription-access.test.cjs scripts/subscription-payments-unit.test.cjs scripts/subscription-verification-match.test.cjs scripts/subscription-reminders.test.cjs scripts/subscription-paid-flow-integration.test.cjs scripts/subscription-runtime-roles.test.cjs scripts/subscription-operations-integration.test.cjs scripts/subscription-ledger-migration.test.cjs scripts/subscription-overdue-restart.test.cjs scripts/veritas-client.test.cjs scripts/subscription-bank-switch.test.cjs scripts/qa-subscription-comprehensive.test.cjs
```

Detailed local output: `tmp/plus-qa-subscriptions-final.log`. This covers signup/approval/renewal/restart, strict matching, CBE/Bank of Abyssinia/Telebirr adapters, reused reference/alias ledger protection, historical migration preflights, scoped runtime roles, safety operations during expiry, reminders, OCR degradation, provider failure classification, and recovery token handling.

The preceding concurrent rerun passed 76/77 tests, with a diagnostic-free whole-file process failure in `subscription-operations-integration.test.cjs`. Running that file alone immediately afterward passed both tests. The complete serial rerun then passed 77/77. The concurrent failure's cause was not established; no product-code weakening was used to suppress it.

## Limits

This report covers backend automated tests. The UI agent owns the frontend tests and TypeScript results; this agent did not perform visual browser QA or mobile UI verification. Provider behavior is verified with synthetic/mocked evidence, not a live bank transaction. Deployment, the application database upgrade, real receiving-account configuration and external SMTP delivery remain root/operator rollout tasks. Worker environment flags must be configured intentionally for actual scheduled delivery.
