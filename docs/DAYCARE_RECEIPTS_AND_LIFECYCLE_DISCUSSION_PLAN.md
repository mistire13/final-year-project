# Package comparison, lifecycle and daycare receipts — discussion plan

9 November 2026 discussion; implementation updated 10 November 2026. The confirmed scope below is implemented locally. See the [integration report](reviews/daycare-receipts-integration-final.md) for validation and remaining launch requirements.

## Confirmed product decisions

- The user confirmed bank-receipt verification for care fees belongs in **both Standard and Plus**. Scheduled invoicing/reminders remain Plus features; new shop activity remains Plus-only.
- Daily and weekly billing configuration is deferred until consultation with the daycares. Do not invent booked-day, attendance-day, absence/holiday, rate or due-day rules. Continue the existing monthly model and supported manual invoices meanwhile.

## Current status

Grouped analytics/presets, accepted next-period package changes, cash-return evidence and authenticated role walkthroughs are already implemented locally. They need continued regression/acceptance coverage rather than duplicate implementations. Production setup and real provider/email/device acceptance are not complete.

The public pricing page now includes a Standard/Plus comparison matrix. Unknown public/workspace routes have explicit recovery pages. Daycares configure separate receiving accounts; parents can submit receipts for owned care invoices and existing shop orders. Strict provider verification and independent review use permanent shared reference claims. Cash and historical manual receipts retain distinct provenance. Automated fee generation remains monthly-only.

## 1. Package comparison

- Put a clear Standard/Plus row comparison beneath price-first cards. Include guardian/child profiles, attendance/pickup, reports/health, messaging/calendar, classrooms/manual duties, manual invoices/receipts, basic finance and audit in both.
- Distinguish Plus shop/inventory, business reports/management exports, recurring invoice/reminder automation and repeating attendance/pickup coverage. Use backend feature flags and administrator-configured price/capacity values.
- Reframe the scheduler around front-desk attendance/pickup shifts, keeping permanent caregiver/classroom assignments separate. Only advertise the refocused workflow once that UI adjustment is delivered.
- Mark real email prerequisites and payment methods accurately. Keep proposed expenses/profit, internal supplies, learning portfolios, custom forms and surveys out of delivered benefits.

## 2. Page/recovery states

Add branded404 and forbidden/session-expired/subscription-ended/payment-pending/provider-unavailable states, using shared design primitives, accessible focus and role-specific recovery links. Preserve payment recovery/drafts, isolate credentials by role and keep API404 responses JSON. Reuse existing boundaries for unexpected errors/offline retry. No unconditional redirect of unknown paths to the landing page.

## 3. Keep two billing relationships separate

| Relationship | Beneficiary/settings owner | Basis |
| --- | --- | --- |
| SaaS subscription | Platform/super-admin receiving account | Standard/Plus monthly, six-month or annual accepted terms |
| Parent care fees and shop orders | That daycare's configured receiving account | A child-care invoice or Plus shop order; its amount, recipient and billing/service period |

Daycare money should go directly to the daycare. The super admin's SaaS receiving account must never be substituted into a child invoice or shop checkout. Share safe verification code and opaque anti-reuse claims while keeping invoice/child/tenant financial records private to their authorized workspace.

## 4. Proposed receipt-verification flow

1. Daycare admin configures CBE/Abyssinia and optionally Telebirr receiving details, with reason/version/audit and trusted institution endpoints. Sensitive credentials remain server-side.
2. Parent opens an owned bill/order and sees its expected full outstanding amount, beneficiary and period. Create a tenant/parent/purpose-bound payment request with immutable expected details.
3. Parent transfers externally, then supplies the supported bank receipt link/reference. Screenshots may help extract a candidate reference; images alone never prove a transfer.
4. Server obtains authoritative provider evidence and matches success, exact expected amount/currency, recipient/name/account, transaction identity and an explicit invoice/payment acceptance window. Daycare fees may be transferred before the app is opened, so do not blindly copy the SaaS request-created-minus-five-minutes rule.
5. Reject receipt reuse across SaaS, invoices, orders, tenants and providers through one canonical-reference/alias claim service. Ownership and available payer evidence also matter: an unclaimed real receipt could belong to another parent. Unexpected third-party payer cases go to authorized daycare review.
6. Lock/recheck the invoice/order balance and state, claim the verified transaction and apply it once atomically. On conflicting changes, preserve verified money/evidence for reconciliation; never silently double-settle or lose it.
7. Issue an application receipt with explicit provenance (provider verified, cash confirmed or legacy/manual record). Existing manual records must not be retrospectively relabelled as bank verified. Remove misleading unsupported gateway choices from new flows.
8. Incomplete evidence, provider downtime, timeout, failed lookup or mismatch remains pending with visible explanation/retry/review. No automatic debit, transfer, refund or request to pay twice.

Recommended initial scope: one authoritative receipt pays exactly one full invoice balance or order total. Keep existing recorded history and controlled cash handling. Partial/bulk/split transactions need a reviewed allocation model before they are supported; do not reuse a full receipt repeatedly to pay several bills.

Veritas currently documents dedicated CBE, Telebirr and Abyssinia receipt routes and credit consumption even for some failed lookups. Put API limits/credit failure into operational monitoring. Telebirr's last tested live lookup returned upstream502, so it remains an external acceptance prerequisite, not a reason to weaken matching. Sources: https://veritas.et/docs and https://veritas.et/docs/verification.

## 5. Due dates and SaaS expiry

| Event | Existing/proposed behavior |
| --- | --- |
| SaaS approaching expiry | Existing portal warning begins five days before expiry; email requires configured/enabled delivery. Show accepted payable amount and any scheduled next package clearly. |
| SaaS renewal due | Offer receipt verification; never auto-debit. Already verified future terms activate at their agreed boundary after account/capacity checks. |
| SaaS ends without confirmed renewal | Existing expiry policy restricts non-essential/new business writes and Plus automation, while retaining ordinary reads, attendance, authorized pickup, health/incident safety paths and resolution of existing invoice/order obligations. Data is retained; no automatic child removal. Any broader grace period is a separate explicit policy decision. |
| Receipt is uncertain near expiry | Preserve intent/proof/recovery and show pending/review. Do not label it paid or tell an already-paid customer to pay again. |
| Verified renewal resumes access | Restore only the accepted paid period/features once; preserve scheduled-change capacity blocking and any overdue restart agreement requirements. |
| Parent bill reaches due date | Mark outstanding balance overdue and send only enabled reminders; no automatic debit or default late charge. Parent debt must not automatically block authorized pickup or hide health/child records. |
| Parent bill is paid | Apply verified money once, recompute balance, retain receipt and suppress stale reminders. Invoice settlement never renews the daycare's SaaS subscription. |

## 6. Daily, weekly and monthly care fees

- These are daycare invoice frequencies, separate from SaaS billing cycles.
- Add explicit frequency, service-period start/end, due date, rate snapshot, billing basis and request/uniqueness keys. The existing monthly YYYY-MM uniqueness cannot simply be reused for several weekly/daily invoices.
- Define booked care days versus attended days, closure/holiday/absence treatment, weekly start day and invoice timing before implementation. Avoid charging daily and weekly/monthly for overlapping covered service periods.
- Every rule change needs preview/version/audit and must preserve issued invoices. Attendance correction must not silently rewrite historical debt.
- Keep initial automation in Plus; baseline manual financial records and care-fee receipt verification are included in both packages, as confirmed by the user. Daily/weekly billing implementation remains deferred.

## 7. Implementation order after discussion

1. Shared comparison matrix and front-desk scheduler terminology/workflow.
2. Real404/forbidden/session/subscription/payment recovery pages and focused route tests.
3. Document/test subscription expiry and parent due-date behavior with separate clocks/states.
4. Tenant-owned beneficiary settings, common strict verifier and shared opaque reference claims.
5. Parent care invoice verification, then Plus shop verification, with recorded-vs-verified provenance and existing-history compatibility.
6. Daily/weekly service-period invoicing after billing-basis decisions.
7. Four-role disposable UI/API acceptance, wrong-name/account/amount and duplicate/concurrent tests, restore rehearsal, readiness checks and controlled live acceptance. Production destination, real prices/accounts, SMTP recipients and device availability remain explicit prerequisites.

## Team review

- Package comparison: [review](reviews/package-comparison-followup-review.md).
- Subscription lifecycle/daycare finance: [review](reviews/lifecycle-daycare-finance-followup-review.md).
- Route/acceptance reviewer reached a session usage limit; the primary agent completed the direct source review: [report](reviews/routes-acceptance-followup-review.md).
- Primary agent coordinated the fourth role, checked existing implementation evidence and official provider documentation, and prepared this discussion scope. No claim is made that the interrupted review completed independently.
