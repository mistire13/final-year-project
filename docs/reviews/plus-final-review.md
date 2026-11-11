# Standard / Plus independent review

Reviewed 2026-11-09. Scope: package entitlements, migrations 049–053, shop creation and cash settlement, business analytics, billing generation/reminders, staff scheduling, and their legacy duty integration. Admissions and waitlists are excluded. This is a source and focused integration review, not a live payment/provider validation.

## Findings

### Fixed: manual duties bypassed approved leave (P2)

`backend/src/modules/portal/portal.service.js:49` previously checked only existing assignment overlaps. An approved leave request could therefore be followed by a manual duty granting attendance/pickup permissions inside that approved leave interval, although the new publication/substitution paths rejected the same conflict.

The manual path now checks approved `staff_leave_requests` under its existing caregiver `FOR UPDATE` lock before inserting. Leave approval and schedule publication use the same caregiver lock, so a concurrent review and assignment cannot both succeed with conflicting results. Historical approved leave remains effective after a package change.

Regression added in `backend/scripts/plus-staff-scheduling.test.cjs:67`: an overlapping manual duty is rejected without an assignment insert; a duty beginning exactly when leave ends remains valid.

### Fixed: catalogue mutations released entitlement lock before writing (P2)

`backend/src/modules/store/store.service.js:89` checks entitlement separately from the product update at line 156. Category creation/update/deletion likewise check at lines 590, 609 and 632 before their mutation transactions/statements. The tenant pool commits each standalone query automatically, releasing the daycare share lock. A package downgrade can commit after that check and before the catalogue mutation. Product creation and checkout already recheck within their explicit write transaction.

Product update and category creation/update/deletion now run with `requireFeature` on the same explicit transaction client, taking the daycare share lock before catalogue row locks and retaining it through commit. Product creation also validates its category on that transaction client. Historical order fulfilment/settlement after expiry remains supported.

Regression in `backend/scripts/plus-package-access.test.cjs` pauses immediately before each actual catalogue mutation and proves a competing `FOR UPDATE NOWAIT` daycare lock receives PostgreSQL `55P03`. It then lets the write commit and verifies all four mutations reject after downgrade.

### Fixed: exhausted monthly billing runs could not recover after correction (P2)

`backend/src/modules/billing-automation/service.js:82` skips a monthly run permanently after five failures. The reviewed settings update at lines 61–64 does not reset an exhausted failed run. The manual run endpoint delegates to the same check. Correcting a bad fee or a transient outage therefore cannot recover that month's automation through the UI.

A reviewed enabled settings save now resets retry attempts and the delay only for failed runs in the current period, under the same settings row lock used by generation. Its audit entry records `retried_run_ids`; prior `last_error` survives until a successful retry. Completed runs and issued invoices are unchanged.

Regression in `backend/scripts/plus-billing-automation.test.cjs` seeds an exhausted December failure, proves generation initially skips it, previews/saves corrected settings, then generates December once with the corrected amounts while retaining November's issued amounts. A repeated run still skips, and the retry reset is audited.

## Reviewed protections

- New accepted package terms carry explicit feature flags. Server feature checks require an active daycare and a valid paid-through date for paid terms; old paid Standard shop access is bounded by its captured expiry.
- New shop orders recheck entitlement inside checkout and lock products in deterministic order. Cash settlement requires the exact total, explicit confirmation and a recorded reason; paid orders cannot be reversed through the status editor. Existing obligations remain accessible after a downgrade.
- Analytics revalidates the active administrator and Plus entitlement within a repeatable-read report transaction, scopes child/classroom/invoice data to the daycare, uses payment dates for collections, excludes demo shop receipts and escapes CSV formulas. Current-classroom and invoice-cohort limitations are disclosed in report notes.
- New module tables use forced tenant row security and composite tenant foreign keys. Occupancy observations are trigger-written aggregates with a real migration baseline and no invented backfill; tenant runtime cannot write that evidence directly.
- Migration 053 captures actual product creation/stock changes in their writing transaction, with a zero-change migration baseline. Tenant runtime has read access only, the definer function uses qualified table references and a fixed search path, and analytics/CSV scope and bound the movement history. No additional source-review finding was identified in this migration.
- Billing uses exact minor-unit arithmetic, preview/configuration/roster hashes, invoice uniqueness, persisted leases/retries and explicit parent email opt-in. Worker discovery exposes tenant identifiers through a narrowly granted definer function; delivery rechecks account, invoice and entitlement eligibility. SMTP remains an external at-least-once boundary: a process crash after SMTP acceptance can still cause a retry despite a stable message ID.
- Staff publication/substitution/leave approval serialize on caregiver rows, scope all candidates to the daycare, reject conflicting duties/leaves, retain capability flags, and audit/persist change notices in the same transaction. The reviewed manual leave bypass is fixed above.

No confirmed P0/P1 issue or cross-tenant read/write was found in this scope. This does not establish the absence of every concurrency defect.

## Validation

Using Node 24 and generated disposable local PostgreSQL databases only:

- `node --test scripts/plus-staff-scheduling.test.cjs`: 2 passed, 0 failed.
- `node --test scripts/phase4-attendance-frontdesk.test.cjs scripts/plus-analytics.test.cjs scripts/plus-billing-automation.test.cjs`: 11 passed, 0 failed.
- After the catalogue/retry fixes: `node --test scripts/plus-package-access.test.cjs scripts/plus-billing-automation.test.cjs`: 4 passed, 0 failed (including the new locking and exhausted-run recovery regressions).

The helper created, migrated and dropped its own generated test databases. The tests include restricted-role isolation, actual analytics accounting, concurrent invoice generation, reminder retries/opt-in, reviewed schedules and legacy attendance/pickup behavior. No live application data, email, payment or receipt verification was used by this review. Deployment migration application and full frontend/end-to-end verification remain with the root implementation/QA agents.
