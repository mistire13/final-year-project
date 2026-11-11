# Subscription lifecycle and daycare receipt-verification review

9 November 2026. Read-only code/architecture review for the user's discussion. No product code, environment, receiving account, real payment, provider lookup or notification was changed. This report distinguishes the working SaaS verifier from proposed daycare money workflows.

## Current implementation

### SaaS subscription timing

- `subscription-access.js` lets reads continue after the paid-through timestamp. Operational writes are restricted, with explicit exceptions for attendance, authorized pickup, health/incident recording, safety alerts, required duty assignment, existing invoice payments, existing order completion/refunds and reminder preferences. Authentication, role and tenant boundaries still apply.
- Plus feature policy disables new Plus business activity after the accepted end date. Existing records are retained. Paid cancellation preserves the already-paid period; it does not delete children, reverse payments or immediately erase benefits.
- Scheduled future package terms are recorded separately. Verified future money stays unconsumed until the accepted boundary. Startup/every-minute activation and summary/application recovery recheck status, active-child capacity and the accepted period under locks. A blocked change retains verified money for resolution.
- Ordinary verified renewal extends the accepted end date. A center overdue by more than a billing period requires operator-authorized restart agreement rather than blindly charging for or extending an already-ended period.
- Subscription expiry email infrastructure exists: it queues eligible administrator notices during the five days before expiry, rechecks the period before delivery and caps retries. Delivery requires enabled flags, complete SMTP and frontend URL. It is not proof of a configured live email service. No money is automatically debited on a due date.

### Daycare finances

- `finances.service.js` creates manual/custom invoices, monthly care-fee batches, parent bill/receipt views and manually recorded payments. Parent views bind daycare, the assigned billing parent and the guardian link. Invoice payment recording locks the target invoice.
- **Important gap:** `recordPayment()` trusts an administrator-entered amount/method/reference. It accepts cash, Telebirr transfer, CBE transfer and `digital_gateway`; the reference is optional. It inserts `verified_at=NOW()` without consulting Veritas and without claiming the subscription reference ledger. Thus a manually entered transfer is not provider-verified merely because its record has a verification timestamp.
- Current care-fee automation is monthly only. It uses child `monthly_care_fee`, `YYYY-MM` billing periods and a unique daycare/child/period/type key. Daily/weekly recurrence requires a period/rate model, not another option label.
- Current manual care-fee settlement uses floating-point arithmetic and one-cent comparisons. New receipt settlement should use exact minor units and explicit balance/allocation rules.

### Shop payments

- Live online gateway capability is explicitly false. The working first release is administrator-recorded daycare cash with exact receipt/amount evidence and paid-before-collection restrictions.
- Full independently completed cash returns have immutable evidence, original receipt preservation, explicit goods disposition and atomic order/stock/audit updates. Digital, pending, partial and ambiguous refunds are deliberately not supported by that cash workflow.

### Existing verifier and reference ledger

- `veritas-client.js` supplies the provider transport, safe error classes and bounded responses. `matchesVerifiedPayment` requires successful provider evidence and, in strict mode, the accepted amount/currency/receiver account/name/reference/date. The current local name-and-amount test mode is a development preference, not an acceptable proof standard for real daycare receipts; production ignores it.
- `subscription_payment_references` permanently claims submitted receipt aliases and authoritative references. It is currently tied to SaaS payment intents/events. Daycare invoices and shop transfers do not yet participate in that ledger.
- No successful new live Telebirr lookup is established by this review. The parent's last authorized live diagnostic returned upstream502. This task made no live provider calls.

## Recommendation: reuse verification infrastructure, keep the money purposes separate

Receipt verification is a reasonable fit: the parent transfers money through their bank/wallet, then the app checks authoritative receipt evidence. This is **verification of an existing transfer**, not auto-debit, payment initiation, escrow or an automatic refund processor. A due date creates an obligation/reminder, not permission to take money.

Maintain separate beneficiaries:

1. Daycare→Ankelba SaaS subscription: platform operator's configured account.
2. Parent→daycare care fees: the owning daycare's configured receiving account.
3. Parent→daycare shop order: the owning daycare's receiving account, with the shop feature entitlement required for new orders.

Never send daycare income to the platform subscription account implicitly. Reuse the strict evidence matcher and provider adapter through a common verification service, rather than reusing SaaS subscription intents whose lifecycle and entitlements differ.

### Receiving configuration

- Introduce versioned daycare/provider receiving settings, owned by the authenticated active daycare administrator. Store institution, full receiver account/Telebirr phone and exact holder name; audit all changes. Show the provider and receiving instructions to the paying parent.
- Capture expected beneficiary details, configured-account version, payable amount/currency, invoice/order version, purpose, parent and tenant when the payment request is created. Later account/fee edits must not redirect an already-created request silently.
- Keep the provider API key server-side. A platform-operated key needs quota/rate controls and a clear usage-cost decision; parents should never receive it. Operator health/configuration access should not silently grant access to private child invoices or receipts.

### Payment state and ownership

- Suggested states: awaiting proof → checking → verified/applied, or pending review/failed lookup/expired request. Use clear persistent feedback, safe retry and reconciliation paths. HTTP200, OCR text or a screenshot alone is insufficient.
- Parents can submit only for their own assigned invoice/order. Administrators can resolve only their own daycare's obligations. Platform operators maintain SaaS/provider infrastructure; a separate explicit support policy would be needed for private daycare receipt access.
- Before applying money, lock the request and target balance/order, recheck current ownership/status and expected amount, claim canonical authoritative references/aliases, insert the payment and update the balance/status/audit atomically. A rejected claim or changed balance must roll back the entire settlement.
- Extend the durable reference-claim architecture across SaaS, care-fee and shop purposes, preserving existing claims and aliases. A global narrow claim operation can reject reuse without disclosing another tenant's parent/invoice/intent identifiers. Do not create three independent reuse ledgers.
- For phase1, use one transfer for exactly one full outstanding invoice balance or one full order total. Preserve existing manual cash support. Partial payments or one transfer covering siblings/multiple bills need a single authoritative transfer plus explicitly reviewed allocations; do not permit reference reuse as a shortcut.
- Keep manual independent receipt review distinct from provider verification. Require a reason, checked amount/recipient/reference and external evidence. A provider outage must not become “paid”; retain proof and advise the parent not to pay twice.
- Reference uniqueness prevents reuse, but cannot prove that the first claimant owns an otherwise unclaimed receipt. Where reliable payer evidence exists, compare it against an accepted payer/guardian relationship; unexpected/third-party payers should enter review instead of silently linking another family's transfer.

### Receipt timing needs a decision

The SaaS matcher presently accepts dates no earlier than payment-request creation minus five minutes. Parents may pay daycare fees before opening the app. Blind reuse of that timing rule would reject otherwise legitimate older daycare receipts. Define a receipt window tied to the issued obligation/accepted payment request, retain uniqueness checks, and route out-of-window evidence to review. Do not relax date checks globally.

## Suggested due/expiry behavior for discussion

| Event | Recommended behavior |
| --- | --- |
| SaaS approaching paid-through date | Persistent administrator banner with actual date/package/amount and renewal action; queue controlled enabled reminders. |
| SaaS boundary, future period already verified | Activate the accepted package only after status/capacity checks; consume that payment exactly once. If blocked, show the reason and preserve money for resolution. |
| SaaS boundary, unpaid/unconfirmed | Show expired/read-only business state, retain history/renewal and existing financial obligations; preserve the documented care/safety exceptions. No auto-debit, child deletion or fabricated renewal. |
| Paid SaaS cancellation | Finish the accepted paid period, then restrict new business operations. Do not cancel an outstanding verified future contract/money silently. |
| Daycare fee due date arrives | Show due amount and invoice clearly; send only enabled consented reminders. Payment receipt verification applies actual received funds. No automatic wallet/bank debit. |
| Daycare fee remains unpaid | Compute/display overdue from due date and balance, notify the responsible admin/parent, retain payment access and care/safety records. Do not automatically block authorized pickup or declare the SaaS subscription expired because a family's fee is late. |
| Receipt lookup unavailable | Keep payment pending with explanation/retry/review and preserved proof. No second-payment demand. |
| Account changes while proof pending | Verify against the captured original destination or independently reconcile; never silently substitute the new account. |

## Daily, weekly and monthly care-fee scope

- Keep SaaS monthly/six-month/annual packages separate from parents' daycare billing cadence.
- Add explicit service-period start/end, cadence, amount/rate snapshot and due date, with unique per-child/charge/service-period generation. Migrate existing monthly period meaning without rewriting amounts or receipts.
- Monthly can preserve the existing calendar-month model. Weekly needs a documented week start/end and due day. Daily needs an agreed service-date rule. Use Addis Ababa dates consistently.
- Decide whether daily means a contracted fixed day fee or attendance-based charges, and how holidays, absences, late check-ins, cancellations and advance payments behave. Attendance logging alone does not define a billable service contract.
- Standard can retain manual invoicing/cash and verified bank settlement; safe verification should not be weakened for Standard. Plus can retain automated recurrence, reminders and advanced reports. Shop remains Plus-only for new sales.
- Use a reviewed preview before enabling daily/weekly generation, with idempotent jobs and reruns after downtime. Check that changing cadence cannot generate overlapping daily/weekly/monthly debts for the same service.

## Concrete staged implementation after agreement

1. Confirm beneficiary ownership, allowed providers, whether initial verification is full-balance only, and the daily/weekly billing rules.
2. Build versioned daycare receiving settings and a shared strict verifier/reference claim API with minimal cross-tenant disclosure.
3. Add parent invoice transfer-proof submission, status/retry/review and atomic settlement; preserve cash, receipt history and manual provenance.
4. Add the same receipt workflow to Plus shop orders, including stock reservation/expiry decisions and refund recording for actual completed digital returns (not automatic transfers).
5. Add explicit recurring service periods and reviewed daily/weekly/monthly schedules, then update package comparisons to describe actual delivered capabilities.
6. Validate role/privacy, wrong receiver/amount/date/payer, global reference collisions, concurrent balance changes, account edits, provider outages, late proof, cadence overlap, refunds and expiry exceptions with disposable data. Perform separately authorized real-provider acceptance later.

This proposal needs user agreement on billing/allocation behavior before financial schema/product changes. Existing receipt verification code is reusable infrastructure, not proof that all three money flows currently work end to end.
