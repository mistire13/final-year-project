# Standard / Plus completion delivery

9 November 2026. Local implementation delivered against [the completion plan](../PLUS_COMPLETION_IMPLEMENTATION_PLAN.md). No production deployment, real payment approval or external email occurred.

## Implemented

- **Calendar:** Monday–Sunday staff calendar, week navigation/date jump, expandable duty details and narrow-screen agenda. Container-aware columns keep names readable, with the original role-filtered duties and authorization responsibilities.
- **Reports:** day/week/month aggregation from actual recorded child-days, Addis Ababa date presets, selected/previous equal-duration comparisons and consistent CSV/print filters. Gross cash receipts keep their original dates; independently recorded returns are separate dated events and net collections subtract them.
- **Next paid period:** an operator can agree immutable future package/price/capacity terms during the current paid period. The daycare sees current and future terms separately and pays the accepted future amount. Verified future payment stays unconsumed until the effective date; activation rechecks account/capacity under locks. Blocked money is preserved for resolution. Unpaid changes can be cancelled; submitted/verified money cannot be silently discarded. Startup/every-minute activation is integrated with shutdown cleanup and request recovery.
- **Cash returns:** full independently completed returns of non-demo daycare cash payments can be recorded with exact amount, original receipt, unique return evidence, actual return time, explicit confirmation, reason, fresh version and stable request key. Original paid receipts remain intact. Goods disposition controls a single stock restoration. Refund/order/stock/audit writes commit together; mismatches and duplicate/conflicting evidence roll back. Existing obligations remain resolvable after subscription expiry/downgrade.
- **Frontend:** operator/admin future-term summaries and parent-owned cash-return evidence. Refunded orders are closed. Browser review also found and fixed a mobile portal-header overflow; at390px, document width now equals viewport width.
- **Release tools:** guarded disposable real-auth fixture,29-check API acceptance script, safe cleanup helper, read-only release inventory and [release runbook](../PLUS_RELEASE_RUNBOOK.md). Existing real prices/receiving accounts were preserved.

## Tests and review

- Combined backend regression: **158/158 passed**, zero failures/skips, strict verification flags. Covers Plus, scheduled changes, cash returns, subscriptions, runtime roles, security, payments and isolation. Initial two failures were a test double expecting an older SELECT projection; the fixture was updated without weakening assertions, and the full run passed. [QA report](plus-completion-qa-report.md).
- Full existing care/safety/communication/profile regression: **119/119 passed**, zero failures/skips, current final schema. Log `tmp/plus-completion-essentials.log`.
- Full frontend suite: **73/73 passed**. Final TypeScript `--noEmit` passed. Log `tmp/plus-completion-frontend.log`.
- Real HTTP password/JWT acceptance: **29/29 passed**, including all four roles, cross-tenant denial, logout and independent sessions.
- Independent refund review found no blocking scope/atomicity/evidence defect; added tests prove concurrent cross-order request-key and case-normalized evidence collisions roll back the losing order and inventory. Semantic JSON field-order retries now replay safely.
- [UI implementation report](plus-completion-ui-report.md); [scheduled-subscription report](plus-completion-subscription-report.md).

## Authenticated browser acceptance

All product writes in this walkthrough were confined to a separately provisioned disposable database and loopback API on5300; frontend preview on8083. Live provider and email transports were blocked. No fake paid records were seeded into the application database.

1. Signed in as daycare administrator through the actual login form, previewed five future staff duties, explicitly reviewed/published them and verified the calendar entries and expandable classroom/attendance/pickup details.
2. Selected weekly grouping and the current-week preset; verified actual grouped child-days and separate gross/return/net tables.
3. Opened the cash-return form, submitted199ETB against a200ETB receipt, verified the persistent exact-amount error and preserved inputs, corrected to200ETB and verified the closed/refunded order and original/return references.
4. Signed in independently as parent, opened the owned order history and verified the return amount, date, evidence, original receipt and explicit statement that the app transferred no money.
5. Signed in independently as platform operator and agreed a future Standard period while Plus remained paid/active. Verified awaiting-payment future terms and preserved current Plus capacity/price, then confirmed the daycare administrator saw the same split and future payment action. No provider verification was attempted.
6. Signed out of the daycare portal, signed in as caregiver, verified only own schedule/availability/leave controls and no administrator template/substitution controls. Reopened the parent app and verified the independent parent session still restored.
7. Checked responsive staff agenda at390×844, fixed header overflow and verified390px document width. Restored the default viewport. Physical Android/iOS devices were not available for this walkthrough.

Evidence: `tmp/plus-completion-calendar-final.png`, `tmp/plus-completion-calendar-mobile.png`, `tmp/plus-completion-reports.png`, `tmp/plus-completion-refund.png`, `tmp/plus-completion-parent-refund.png`, `tmp/plus-completion-scheduled-change.png`.

The fixture cleanup removed its synthetic credentials, temporary database roles and exact owned disposable database; removal was checked after helper teardown. The fixture frontend was stopped. Main application servers remain on 5000/8081, both returned HTTP 200, and there are zero pending migrations. The application database has zero synthetic scheduled changes or cash-return rows.

## Local migration rollout

Created a fresh private PostgreSQL custom-format backup, verified its archive, restored a disposable copy, rehearsed054/055 and compared original financial records. Completion preservation checks include package prices/accounts/accepted terms and metadata, payment intents/reference claims, original shop receipts/orders/items/stock history and child invoices/payments; only the two intended new payment-anchor fields are excluded from the original-field comparison. Empty new evidence tables are also checked. Applied the same migrations locally only after the comparison passed, then verified again. There were zero enabled daycare billing schedules at rollout. Local backups remain under ignored `tmp/subscription-backups/`.

## Still requires external acceptance/configuration

- Telebirr's last authorized real lookup returned upstream502. CBE/Abyssinia still need fresh controlled end-to-end acceptance for the intended live workflow. No matching rules were weakened here.
- Local name-and-amount test mode stays enabled as previously requested; production ignores it. Disable locally and validate strict full evidence before accepting real subscriptions.
- SMTP is not configured and billing email remains disabled. Controlled recipients/consent and delivery testing are needed. SMTP retry after a crash at the external-send boundary cannot guarantee exactly-once delivery.
- Confirm actual prices and receiving details on the super-admin page; preserved development values are not a launch recommendation.
- Actual staging/production destination, deployment secrets/origins, supervised worker operation, offsite backup schedule/restore and physical-device checks remain outside this local delivery. Optional preview/MFA auth was not validated by the legacy-login walkthrough.
- First cash-return workflow is full, non-demo, independently completed cash returns. Partial/digital/pending/ambiguous cases and live online shop payments require separately reviewed integrations. Admissions/waitlists remain excluded.
