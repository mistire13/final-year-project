# Standard and Plus package plan

Prepared: 8 November 2026. Updated: 9 November 2026. Status: core modules and the follow-up calendar/reporting, next-period package-change and cash-return workflows implemented and applied locally after backup/restore rehearsal. Live provider/email acceptance, physical-device testing and production rollout remain open. See [completion report](reviews/plus-completion-delivery.md), [scope audit](reviews/plus-plan-gap-audit.md) and [release runbook](PLUS_RELEASE_RUNBOOK.md). Parent enquiries/admissions/waiting lists remain explicitly excluded.

## 1. Product decisions

- Public package names become **Standard** and **Plus**. Plus replaces the Premium name.
- The daycare shop is available only with Plus for new shop activity.
- Standard remains a complete daily childcare package. Attendance, authorized pickup, health/incident records, daily care reports, parent messaging, basic staff duties, basic invoicing and access to historical records remain included.
- Plus adds larger capacity, shop operations, business analytics, billing automation and advanced staff scheduling.
- Monthly, six-month and annual options have the same features within their package. Only the period and administrator-configured price differ.
- The super administrator continues to configure each package's ETB prices and child capacity. Use the existing 50/150 capacities as defaults, preserving configured values.
- Advertise a feature as included only after it works end to end and is enabled. Planned features must not appear as delivered subscription benefits.

## 2. Target package matrix

| Capability | Standard | Plus |
| --- | --- | --- |
| Attendance, authorized pickup and health/incident records | Included | Included |
| Daily reports, parent messaging, announcements and calendar | Included | Included |
| Child/guardian profiles, classrooms and basic staff duties | Included | Included |
| Manual invoices, payment recording, receipts and parent bills | Included | Included |
| Manual monthly invoice generation already present | Included | Included |
| Basic operational/financial overview and access to own records | Included | Included |
| Child capacity | Current Standard limit | Current higher-tier limit |
| Product catalogue, categories, stock and new shop orders | Unavailable | Included |
| Shop sales and inventory reporting | Unavailable | Included |
| Comparative business analytics and management exports | Unavailable | Included |
| Scheduled invoicing and payment reminders | Unavailable | Included |
| Repeating staff schedules, leave and substitutions | Individual duty assignments | Included |

Existing orders and payment evidence remain accessible after a downgrade. Finishing or resolving already-created orders is an obligation-preserving exception, not permission to create new shop sales.

## 3. Baseline implementation and gaps before this work

This section records the original baseline, not the current delivery state. The remaining-work audit linked above is the current checklist.

- Shop: product/category management, stock, low-stock alerts, tenant-bound parent orders and order status handling exist. Package entitlement checks do not yet reserve these operations for Plus.
- Shop payment processing: the payment service explicitly reports online payments as disabled. Its initiation/callback functions cannot currently settle live payments. Do not equate the working SaaS subscription receipt verifier with working daycare shop payments.
- Billing: invoices, manual payment records/receipts, a financial overview and on-demand monthly invoice generation exist. Automatic schedules and invoice-reminder orchestration are additions.
- Reporting: operational dashboards, a dated portal snapshot and record exports exist. Comparative management reporting needs deliberate definitions and additional history where current snapshots cannot establish past occupancy.
- Staffing: duty assignments and shifts exist. Recurring schedules, leave approval and substitution workflows are additions.
- Package identifiers: database constraints, API validators, recovery, accepted terms and styling currently refer to `premium`. A blanket identifier replacement would break compatibility.

## 4. Phase 1 — Rename and feature-access foundation

1. Rename the current higher-tier catalogue display name to Plus. Update current pricing, portal/mobile labels, comparisons, help and upgrade messages.
2. Retain the existing `premium` internal identifier initially. Public names come from the catalogue; old links, subscriptions and recovery credentials continue to work. Preserve names/prices captured in historical payment and subscription records.
3. Introduce one server-owned feature policy with explicit capabilities: `shop`, `business_analytics`, `billing_automation`, and `staff_scheduling`. Standard has no Plus capabilities; Plus exposes only capabilities delivered by the deployed release.
4. Capture accepted feature-policy version and entitlements with subscription/payment terms alongside the current price, capacity and billing cycle. Renewal matching must include these terms so payment cannot activate a different feature agreement.
5. Resolve access from authenticated tenant and accepted subscription terms. Never trust a client-supplied package, UI state, local storage or a forged feature flag.
6. Return effective features to the portal and parent app. Use consistent API failures and administrator upgrade destinations for unavailable features. Parents receive a neutral unavailable message, not subscription-purchase prompts.
7. Keep super-admin configuration version checks and audit records. Preserve existing paid promises; inspect any legacy paid Standard shop access before changing it rather than silently rewriting accepted terms.

Acceptance: current offers display Standard/Plus; legacy identifiers and recovery work; tenant isolation remains intact; Standard cannot acquire Plus features by modifying a request; paid terms do not change when catalogue prices/features are edited.

## 5. Phase 2 — Plus-only shop and usable settlement

### Catalogue and new sales

- Gate product/category management, inventory changes, catalogue browsing and creation of new orders with the effective Plus shop capability.
- Cover `/store` operations, related payment operations, portal snapshots, dashboard totals, search results, exports and parent mobile entry points. Hiding the navigation alone is insufficient.
- Avoid including restricted shop data in Standard snapshot responses.
- Preserve existing stock locking, price snapshots, idempotency, cancellation protections and tenant/parent ownership checks.

### Payment and collection

- Treat shop proceeds as daycare income. SaaS subscription fees continue to use the super administrator's receiving accounts; shop payments must not use those accounts accidentally.
- Proposed first shop settlement: pay at the daycare, with an administrator recording the exact payment and issuing an auditable receipt before an order is marked paid/collected. Confirm the existing implementation supports each transition; add missing operations rather than treating demo payments as real payments.
- Keep simulated payment operations restricted to development. Leave unsupported online checkout unavailable until a separate verified merchant-payment integration exists.
- Support viewing and completing existing orders after expiry/downgrade, including safe stock restoration for eligible cancellations. Do not pretend an external refund has happened; record evidence through a supported resolution workflow.

### Shop reporting

- Add collected sales totals, paid/unpaid order counts, best-selling items, stock movements and low-stock lists.
- Distinguish placed-order totals from collected revenue. Profit reporting requires cost data and is not included in this phase.

Acceptance: a Standard administrator or parent cannot bypass the restriction through APIs or stale screens; Plus catalogue → order → payment record → collection works; concurrent stock/orders cannot oversell; existing orders and receipts remain accessible after downgrade.

## 6. Phase 3 — Plus business analytics

- Attendance trends by day/week/month and classroom.
- Capacity/occupancy reporting based on recorded enrollment and capacity history. Begin recording missing history; never manufacture historical occupancy from today's count.
- Fees billed, collected, outstanding and overdue, with clear date and period filters.
- Shop sales and inventory reports kept distinguishable from care-fee accounting.
- Month-to-month comparisons and filtered PDF/CSV management reports.
- A monthly owner summary, initially downloadable; automated delivery can use the controlled reporting/reminder infrastructure after it is tested.
- Standard retains its daily overview, basic finances and access to individual records/receipts.

Acceptance: figures reconcile to source records; partial payments, cancellations and date boundaries do not inflate totals; Addis Ababa periods are consistent; exports respect tenant and role permissions.

## 7. Phase 4 — Plus billing automation

- Administrator-configured recurring fee rules and billing schedules.
- Scheduled monthly invoice generation using the existing invoice service.
- Configurable reminders before/after due dates, in-app and through configured email delivery. SMS is a separately scoped integration/cost decision.
- Outstanding-balance aging and a reminder delivery/failure history.
- Reviewed recurring discounts or fee adjustments with explicit reasons and audit history.
- Persisted, idempotent jobs: retries or multiple workers cannot create the same invoice twice or repeatedly send the same reminder.
- On downgrade/expiry, stop future Plus automation while allowing ordinary invoice access, manual payment recording and existing balances to be resolved.
- Invoice automation does not automatically debit a parent or move money. Care-fee collection and SaaS subscription renewals remain distinct processes.

Acceptance: scheduling can be previewed and enabled deliberately; paused/expired tenants receive no new automation; retries, crashes, changed balances and delivery failures behave correctly; testing uses controlled recipients/transports.

## 8. Phase 5 — Plus advanced staff scheduling

- Repeating weekly shift templates and a review-before-publish flow.
- Staff availability and leave requests with administrator approval.
- Substitute assignments and overlapping-shift checks.
- Calendar views and schedule-change notifications.
- Generate actual dated duties through the current assignment/authorization system. A template alone does not grant pickup or attendance permissions.
- Basic duties, attendance/pickup authorization and critical care/safety functions remain available in Standard.

Acceptance: leave or template changes cannot revoke necessary care access unexpectedly; generated assignments remain tenant-bound; no duplicate shifts on retries; caregivers see their permitted schedules only.

## 9. Subscription transitions and pricing

- Initial implementation applies plan changes with the next paid subscription period. Preserve the current paid-through date and benefits. Immediate prorated upgrades require a separate, explicitly agreed credit/payment design.
- Validate downgrade capacity before activating the lower plan. Never delete or automatically archive children to meet the limit.
- A paid cancellation retains access through the accepted paid period; expiry blocks new Plus business activity while essential care and permitted historical/order-resolution actions remain available.
- Publish exact, administrator-configured totals for each package/period. Longer-term savings appear only when they are real comparisons against the same package's monthly billing.
- Plus subscription activation requires verified subscription payment; a shop purchase does not upgrade the daycare's SaaS plan.
- The existing development-only name-and-amount receipt test mode is separate from this package work. Final live-payment verification policy must be reviewed before production rollout, not weakened to make package tests pass.

## 10. Delivery and validation

Delivery order: foundation → shop → analytics → billing automation → staff scheduling. The core of all five phases is implemented locally; the remaining-work audit records incomplete UI/workflows and outstanding live validation. Passing automated tests does not close those items.

For every phase provide an implementation summary, review findings and QA results. Test:

- Both packages, all three billing periods and configured/unconfigured prices.
- Direct API access, stale clients, cross-tenant requests and role boundaries.
- Registration, approval, renewal, cancellation, expiry and downgrade transitions.
- Existing order/history access and care/safety availability.
- Duplicate payments/orders/jobs, concurrent stock and capacity changes, worker retries and recovery.
- Portal and parent mobile navigation, keyboard accessibility and responsive pricing.

Back up before migrations, rehearse them against a disposable copy, preserve financial history, and advertise newly delivered benefits only after acceptance checks pass. Subsequent user instructions authorized implementation and local application. No production deployment has been performed.

## 11. Research informing the feature direction

The roadmap adapts business operations already common in childcare systems to Ankelba's existing modules; it is not a claim that all these features currently exist here.

- [Famly Professional features](https://help.famly.co/en/articles/13715018-famly-professional-package-what-s-included): reporting, billing reminders, scheduling and staff scheduling.
- [brightwheel Premium](https://help.mybrightwheel.com/en/articles/1443633-unlock-efficiency-what-s-included-in-brightwheel-premium): billing automation, reporting and staff management.
