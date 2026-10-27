# Alemitu audit repair plan — 23 October 2026

Source: [frontend acceptance audit](./ALEMITU_FRONTEND_END_TO_END_AUDIT_2026-10-23.md). Preserve existing work and test records. Work through this checklist in order; a code change is not a verified acceptance result.

## Phase 1 — essential safety, access and trustworthy records

- [x] **1. Pickup safety (ALE-07, ALE-10).** Require a fresh, unchecked identity attestation and an operator-entered verification description. Show only duty-permitted actions. Verify revoked/expired duty, unapproved adult, duplicate pickup and successful manual release through the UI.
- [x] **2. Additional guardians (ALE-01).** Replace message-only requests with persisted pending requests, an admin review queue, approval/rejection reasons and parent-visible status. Support pickup-only adult contacts without silently granting app access. Keep existing parent account links separate. Approval/revocation and checkout must recheck tenant, child, adult, duty and latest request state atomically.
- [x] **3. Complete and factual care records (ALE-03, ALE-08).** Show saved meal/activity details to administrators. Remove fabricated comfort/location/healthy statements; use factual missing-record states.
- [x] **4. Accountability and capability status (ALE-09, ALE-13).** Audit material writes with attributable actors and tenant context. Show actual integration/configuration status rather than unmeasured verification claims.
- [ ] **5. Access and concurrency acceptance.** Use two authorized synthetic daycares and all relevant roles; check child/report/health/guardian/message/announcement/order separation, direct restricted navigation, account switching, stale edits and duplicate actions. Preserve passing order and pickup protections. Do not infer backend security certification from UI results.

Phase 1 acceptance: a new pickup guardian can progress from request to decision and pickup; pending/rejected/revoked adults cannot release a child; one release creates one checkout; care displays agree across roles; material writes have audit entries; tested foreign-tenant and role-restricted records remain inaccessible.

## Phase 2 — reliability, remaining completeness and demo payment

- [ ] **6. Diagnose runtime and save failures (ALE-C02, ALE-C03).** Inspect the supported Expo/runtime setup, lazy module loading, error recovery and submit retries. Preserve drafts and prevent duplicate writes after ambiguous failures.
- [x] **7. Resolve data discrepancies (ALE-C01, C04, C05, C06, C08).** Reconcile requested plan, contact fields, validation rules, zero-total settlement and global account counts/pagination. Fix confirmed causes; document intentional differences.
- [x] **8. Correct navigation, copy and accessibility (ALE-02, ALE-05, ALE-06, ALE-11, ALE-12, ALE-C07).** Use actual chat roles; label controls; provide support guidance; rename pickup status; make classroom assignment read-only to parents; use neutral identity placeholders.
- [x] **9. AI relevance (ALE-04).** Remove unrelated example identities, answer supported questions accurately and disclose provider/fallback availability.
- [x] **10. Explicit demo payment.** Add a server-controlled demo method that records simulated success and a demo reference. Enforce order ownership, tenant scope, allowed state and retry idempotency. Label checkout, receipts and admin payment records as demo; transfer no money. Keep real payment integration deferred, and prevent demo settlement from silently becoming a production payment method.
- [ ] **11. Remaining frontend acceptance.** Exercise parent cancelled-order reconciliation, sibling management, remaining edits/exports, application rejection, subscription boundaries, account security, responsive/keyboard/reduced-motion behavior and recoverable errors. Do not publish broadcasts to unrelated tenants or delete non-test records.

Phase 2 acceptance: each of the 13 findings and eight provisional observations has an evidence-backed disposition; core demo payment succeeds and is visibly simulated; counts and saved data reconcile; supported flows work across roles and browser sizes; unresolved external dependencies remain accurately labelled.

## Explicit dependencies and boundaries

- Acceptance remains frontend-driven, as requested. Type checking, syntax validation and required schema migrations support implementation; do not substitute backend script tests for the real UI journey.
- Real payment providers, email transport/delivery, biometric/QR hardware and native background push require actual integrations/devices. Implement truthful availability and supported preferences; do not claim these services work without delivery/device evidence. Only payment simulation is authorized here.
- No production deployment, real charges, credential resets, unrelated tenant changes or destructive cleanup is included.
- Record changed files, migrations, completed UI checks and remaining limitations in the implementation handoff. Leave Alemitu active after lifecycle checks.

## Progress

- Implementation and frontend verification are recorded in [repair results](./ALEMITU_REPAIR_RESULTS_2026-10-23.md), including a disposition for every original finding and provisional observation. Existing uncommitted work retained.
- Steps 1–4 and 7–10 have implementation changes and core UI evidence. Step 8's extended keyboard/responsive pass remains in step 11.
- Step 5: two-tenant page separation, family/account switching, cross-tab sign-out, revoked-contact stale submission and duplicate pickup passed. Continuation added child/classroom/care/subscription edit revisions, shared child locking for standalone care edits, atomic classroom assignments, active enrollment quota and guarded owner lifecycle transitions. UI stale editors, caregiver deselection/restoration and quota/new-family rollback checks passed. Broader direct-object/role and simultaneous race coverage remains open.
- Step 6: shared-context hot-refresh/navigation defects repaired; announcement retry keys implemented; normal publication/type checking/web export passed. Two open payment views returned the same demo reference and one audit/stock effect. Controlled lost-response testing and timeout root-cause isolation remain open.
- Step 11: sibling, caregiver report, cancelled receipt, demo fulfillment and no-charge cancellation passed. Continuation verified application rejection/login restriction, quota/reactivation, ordinary payment replay, representative tenant-scoped CSV exports and owner approval/subscription keyboard handling. A new family/classroom saved together, completed parent onboarding, check-in and approved-parent pickup. Trial expiry, remaining edit/export combinations, full accessibility/device/security acceptance remain open.
