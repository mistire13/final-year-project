# Standard / Plus completion implementation plan

9 November 2026. Authorized by the user's instruction to plan and continue implementation. Builds on the existing core; enquiries/admissions/waitlists, immediate prorating, online shop gateways and SMS remain excluded.

Delivery status: sections1–3 implemented, tested and applied locally; section4 has completed disposable API/browser acceptance and release tooling/runbook, with live provider/SMTP, physical devices and an actual production destination still external prerequisites. See [delivery report](reviews/plus-completion-delivery.md).

## 1. Frontend completion

- Add a Monday–Sunday staff calendar with week navigation, dated duty details, accessible controls and an agenda layout on narrow screens. Respect the server's role-filtered records; do not infer permissions from the calendar.
- Add day/week/month attendance grouping and useful date presets to business reports. Aggregate actual recorded child-days, use Addis Ababa calendar boundaries, and keep selected/previous totals and exports consistent.
- Show scheduled subscription changes and their payment/activation state clearly to the operator and daycare administrator.
- Show cash refund records to administrators and the owning parent; keep historical records available after downgrade.
- Follow the Ankelba UI styling skill and existing session separation. Exercise error, loading, stale-write, retry and narrow-screen states.

## 2. Next-period package changes

- Record reviewed future terms while a current paid period remains active, with the effective date anchored to its paid-through date. Preserve current capacity/features until that date.
- Bind future renewal payment to immutable accepted terms; catalogue edits must not silently alter them. No activation without verified payment, and no immediate prorating.
- Recheck active-child capacity and account status when activation is due, with transaction locks, replay protection and audit history. A failed capacity check must preserve the verified payment for operator resolution rather than consume/discard it.
- Reject or reconcile competing renewals/changes rather than extending two overlapping periods. Unpaid changes may be cancelled with a reason; verified money cannot disappear through cancellation.
- Integrate the activation path with normal startup/worker operation and safe request recovery. Add scoped role, stale-version, duplicate, cancellation, expiry and capacity regression coverage.

## 3. Shop refund/reconciliation records

- First supported resolution is a full refund of an administrator-recorded, non-demo cash payment, independently confirmed as already returned outside the app.
- Require exact amount, original payment reference, external refund evidence/reference, explicit confirmation, a written reason, fresh order version and request key. Reject online/pending/demo/refund-ambiguous payments.
- Append immutable tenant/parent-bound refund evidence. Update paid-order/payment resolution atomically, preserve original receipt and audit, and restore stock exactly once only when the goods were explicitly returned or never handed over.
- Support existing obligations after subscription expiry/downgrade. Parent can read only their own receipt/refund; recording a refund must never claim the app transferred money.
- Test wrong amount, wrong reference/owner/tenant, stale writes, concurrent/replayed requests, stock disposition and rollback on failure.

## 4. Integration acceptance and release preparation

- Use disposable fixture databases and mocked payment/email transports for automated/interactive acceptance. Do not provision fake paid data into the application database or send live messages.
- Re-run affected backend/ frontend suites, TypeScript and existing safety/payment regressions. Rehearse new migrations on a restored backup before applying locally.
- Inspect authenticated admin/caregiver/parent/operator journeys in the browser where the local fixture harness supports them; record exact coverage and device limitations.
- Prepare deployment/readiness checks for worker operation, backups, strict verification, real prices and SMTP without guessing secrets, prices or a production destination.
- Keep Telebirr's observed upstream 502 as an external dependency. Real CBE/Abyssinia payment acceptance and SMTP delivery require suitable receipts/consenting recipients and configured services; do not substitute test assertions for live proof.

## Acceptance and reporting

Each implementation owner supplies a report with files/behavior, tests, findings and limits. Final status must distinguish implemented/tested changes from external prerequisites. Preserve existing configured prices/accounts and historical financial evidence. No production deployment is authorized by this implementation step alone.
