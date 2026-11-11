# Next-paid-period subscription implementation

Implemented 9 November 2026 for section 2 of `docs/PLUS_COMPLETION_IMPLEMENTATION_PLAN.md`. No live payment, message, email, application-database write or deployment was performed by this implementation owner.

## Result

- During an active paid period, the operator can accept a different package/billing cycle at its reviewed catalogue version. The accepted price, capacity, feature flags and policy version are stored as immutable future terms. Its effective date is the current paid-through date. Current package, capacity and features remain unchanged.
- One open future change is allowed per daycare. Version checks, request hashes and durable event keys reject stale/conflicting requests and replay an identical request safely. Existing active/submitted/verified renewal payments must be completed or resolved before agreeing different future terms.
- Renewal payment creation automatically uses the open future agreement and stores its change ID and renewal-period anchor. Catalogue edits do not change that amount or capability promise. Duplicate active payment sessions are rejected with recovery guidance. Scheduled Telebirr session status reads also retain their captured receiving details.
- Successful verification marks the future change paid while leaving its intent verified and unconsumed until activation. Before the boundary, applying the payment returns a scheduled result and preserves current access. The UI describes this explicitly rather than claiming an immediate upgrade/downgrade.
- Due activation locks the daycare, change and intent, verifies the accepted terms, period anchor and payment binding, and rechecks account status and current active-child capacity. Activation changes the package/capacity/period and consumes the verified intent atomically, with an event and audit entry. Concurrent workers activate once.
- Suspension, excess enrollment or a fully elapsed accepted next period blocks activation and retains verified money. Unchanged blocked retries do not duplicate audit events. Reducing enrollment/restoring the active account allows a later retry. A fully elapsed agreed period requires operator resolution rather than silently restarting the billing clock.
- An unpaid change can be cancelled with a reason; its unused payment token is rejected and evidence retained. Submitted/verified money cannot be cancelled away. Existing external payment reconciliation can resolve confirmed money; only then can the related future agreement be cancelled. Neither action transfers or refunds money through Ankelba.
- Normal renewal intents also receive a paid-period anchor. Legacy unconsumed intents are bound to the current period during migration. If one old payment already extended that period, another payment for the old anchor remains verified for operator resolution instead of extending an overlapping period.

## Files

- `backend/src/db/migrations/054_scheduled_subscription_changes.js`: immutable future agreements, one-open-change constraint, tenant-scoped read policy, control-only mutations, payment/change binding and legacy renewal anchors. Rollback retains contractual/financial evidence.
- `backend/src/modules/saas/subscription-changes.js`: locked scheduling, cancellation, verified-money activation and audit logic.
- `backend/src/modules/saas/subscriptions.service.js`: existing operator actions, summaries, normal renewal safeguards and due activation recovery.
- `backend/src/modules/saas/subscription-payments.service.js`: future-term payment creation, verification/review outcomes, receiving-detail snapshots and external resolution integration.
- `backend/src/modules/saas/subscription-change-worker.js`: standalone activation worker.
- `frontend/src/portal/SubscriptionViews.web.tsx`: shared future-package summary for administrator/operator, reviewed future terms and unpaid cancellation actions, accurate scheduled/blocked payment notices. Uses Ankelba portal primitives and separate authenticated API clients; Ankelba UI skill and frontend Expo v57 documentation requirement were read.
- Focused tests: `backend/scripts/subscription-scheduled-changes.test.cjs`, `frontend/scripts/subscription-scheduled-ui.test.cjs`.

## Worker integration contract

`createSubscriptionChangeWorker(db, logger).run()` accepts the application pool with `.control` or a control pool directly. It performs no provider requests or message delivery. Invoke at startup and periodically, and clear the surrounding timer at shutdown. The worker has a local busy guard; database locks also serialize separate processes. The root implementation agent owns the app/server wiring and confirmed it is saved. Summary/apply requests also recover a due paid change.

An optional third argument `{ now: () => Date }` exists for deterministic disposable tests. Production uses real time. The worker must run for accepted verified contracts; it is not controlled by the optional billing-email automation flag.

## Validation

Node 24, generated disposable PostgreSQL databases, strict `NODE_ENV=test` and `SUBSCRIPTION_NAME_AMOUNT_TEST_MODE=false`, mocked receipt transport only:

- Scheduled changes + existing paid-signup flow + overdue restart: **3 passed, 0 failed**.
- Extended scheduled expiry/resolution + restricted runtime subscription roles + subscription operations: **4 passed, 0 failed**.
- New frontend scheduled-summary/operator action checks + existing bank/recovery/restart checks: **9 passed, 0 failed**.
- Frontend TypeScript `tsc --noEmit`: **passed**.
- `git diff --check`: **passed**, apart from informational pre-existing LF/CRLF notices.

The new regression exercises preserved Plus access, immutable catalogue snapshots, stale/duplicate/conflicting changes, verified payment held before the boundary, activation blocked by suspension/capacity, retry without audit spam, concurrent activation once, unpaid cancellation and rejected old tokens, paid cancellation refusal, externally recorded resolution, fully elapsed periods, overlapping normal-renewal prevention, and tenant read/write isolation.

An exploratory run without explicit strict flags inherited the local development name/amount-only switch, so strict mismatch assertions failed; rerunning with the required flags passed the affected suites. The same exploratory run included obsolete `practical-subscriptions.test.cjs`, which still expects the pre-payment signup/trial lifecycle and fails before creating its shared fixture. It was not rewritten or used to weaken the supported paid signup flow. Final combined acceptance belongs to the root/QA agents.

## Limits and operational prerequisites

No proration or automatic charging is introduced. Future terms are accepted by the operator after agreement with the daycare; the daycare administrator sees and pays those captured terms. Existing post-expiry package agreement behavior remains available when there is no conflicting future agreement/payment.

The worker and migrations must be deployed together. Real verification still depends on configured receiving accounts and provider availability. Real bank receipt acceptance, SMTP delivery, production deployment and native-device acceptance are outside this owner's performed tests. A payment bound to an already elapsed or conflicting period remains available for explicit operator reconciliation; it never grants a newly invented period.
