# Daycare receipt and lifecycle QA

9 November 2026. Independent QA owner: `plus_qa_final`. Independent receipt/lifecycle/migration checks pass 7/7; combined regressions and frontend acceptance are in progress.

## Confirmed scope

Care-fee receipt verification belongs in both Standard and Plus. New shop purchases/verification remain Plus-only. Daily/weekly daycare billing rules remain deferred; tests preserve the existing monthly/manual invoice model. Daycare receiving accounts must remain distinct from platform SaaS accounts. No live provider/email requests or application database mutations are part of this QA work.

## Lifecycle regression prepared

Added `backend/scripts/daycare-lifecycle-qa.test.cjs` with two executable checks:

- SaaS new-business writes are allowed immediately before the exact paid-through instant and denied at/after that instant. Reads, authorized care/safety operations and resolution of existing invoice/order obligations continue. The middleware must not invent a new payment or automatic renewal.
- Care invoice overdue balances/filtering must use Addis Ababa calendar dates even when a connection runs in a different timezone. Today's bill is not overdue; earlier unpaid and partially paid balances are overdue; paid/cancelled bills are excluded. Reads must preserve invoice history, daycare subscription state and authorized pickup.

The first meaningful run passed the paid-through boundary test and reproduced a finance date defect: the overview counted 400 overdue instead of 300 under `Pacific/Kiritimati`, because `CURRENT_DATE` treated the bill due today in Addis as overdue. Root was sent the exact `finances.service.js` locations: `getOverview()` overdue summary and `listInvoices()` overdue filter. Root owns the product fix; QA has not edited overlapping product files. Synthetic fixture setup was corrected to meet existing required/unique monthly billing periods before evaluating this defect.

Command, working directory `backend`:

```powershell
$env:NODE_ENV='test'
$env:SUBSCRIPTION_NAME_AMOUNT_TEST_MODE='false'
& 'C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe' --test --test-reporter=spec scripts/daycare-lifecycle-qa.test.cjs
```

All mutable integration connections use the existing generated/owned disposable database helper. The configured application database is never a write target.

## Receipt acceptance matrix awaiting backend readiness

Backend owner supplied `createDaycarePayments(pool, {lookup, now})` with settings/account, create/get/list, verify and review operations. Independent checks will cover:

- Active admin receiving settings reason/version/audit; parent access only to safe destinations; snapshots unaffected by later account edits; tenant destination never falls back to the platform destination.
- Standard and Plus full-outstanding care invoices; parent/guardian ownership and tenant privacy; Plus shop and retention of existing obligations after expiry/downgrade.
- Authoritative success, exact cents/currency, full receiver name/account, transaction reference binding and explicit acceptable dates. SaaS name-and-amount test mode must not relax daycare verification.
- Missing/mismatched payer and late proof requiring authorized review; unsupported/failed/timeout evidence never becoming paid; clear pending/recovery records rather than duplicate-payment demands.
- One opaque canonical/alias claim across SaaS, child invoices, shop orders and tenants; no private child/invoice data exposed by cross-purpose claims. Duplicate/concurrent proofs and legacy ledger migration preflights must fail safely.
- Invoice/order balance lock and atomic claim/payment/audit/balance application; racing cash or another proof preserves evidence for reconciliation without double settlement or lost verified funds.
- Provider-verified, cash-confirmed and legacy/manual provenance visibly distinct. Historical manually entered transfers must never be retroactively relabelled provider verified.

## Independent tests and findings during implementation

- `daycare-receipts-ledger-qa.test.cjs` upgrades a generated database through 055, seeds actual pre-056 manual transfer/cash/shop records and prior SaaS claims, then tests 056. It checks preserved provenance/history, protected legacy claims, distinct modern CBE token case, runtime ledger privacy and transactional rollback on historical cross-purpose reuse.
- `daycare-receipts-independent-qa.test.cjs` checks concurrent initial account settings, Standard care settlement after SaaS expiry, full remaining balance, receipts predating app opening, destination snapshots, strict matching despite local SaaS testing flags, and concurrent balance changes preserving confirmed money and global claims.

Independent review found and reported the following defects to the implementation owners:

1. `CURRENT_DATE` caused care-fee due-state drift outside the Addis timezone. Root replaced the overview/filter date expressions; both lifecycle tests now pass.
2. Migration 056's JSONB `?` operator was mistaken for a Knex binding. Backend owner replaced it with `jsonb_exists`.
3. Initial global canonicalization uppercased case-sensitive modern CBE identifiers. Backend owner preserved exact modern CBE case and protected legacy aliases.
4. First receiving-settings saves could overwrite an absent-row version race. Backend owner serialized that path; the independent concurrent test now proves one success and one 409.
5. Guardian/assigned-parent changes during checking could hide a request even from daycare admins. Backend owner added historical admin reconciliation access and preservation of confirmed money on ownership changes; focused tests are planned.
6. Bound raw SQL in the legacy backfill also contained the regex `https?`, causing an extra placeholder count (`Expected 6 bindings, saw 7`). Backend owner replaced the optional regex syntax; the independent migration checks now pass.

QA also corrected its own setup assumptions: CBE proof uses a full trusted receipt URL with a provider token response, and the old ledger's unknown-provider marker is `legacy` (the old ledger provider column is not nullable; intent provider is nullable). No product assertion or strict verification requirement was weakened.

## Independent execution result

The following final focused command passed **7 tests, 0 failures, 0 skips**, with generated disposable databases and mocked provider results only:

```powershell
$env:NODE_ENV='test'
$env:SUBSCRIPTION_NAME_AMOUNT_TEST_MODE='false'
& 'C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe' --test --test-concurrency=1 --test-reporter=spec scripts/daycare-lifecycle-qa.test.cjs scripts/daycare-receipts-ledger-qa.test.cjs scripts/daycare-receipts-independent-qa.test.cjs
```

Working directory: `backend`. Detailed output: ignored `tmp/subscription-backups/plus-ui-acceptance/daycare-receipts-independent.log`. It proves exact expiry/date boundaries, one successful first-settings write, accepted full remaining care balances on Standard after SaaS expiry, old-before-app receipt timing, destination snapshots, strict account matching despite the local SaaS diagnostic flag, preserved verified/unapplied money under balance races, cross-SaaS reuse denial, manual provenance retention, opaque runtime claim privacy and atomic migration-conflict rollback. Daily/weekly billing was not introduced.

## Current limits

A larger combined backend regression is in progress. A pre-existing disposable authenticated browser fixture is available, but requires a clean schema/service restart after migration 056+ stabilizes. Browser, live provider, real SMTP/device and production readiness must be reported separately. Root must approve fixture shutdown/restart while browser acceptance is underway. All provider evidence in this QA is synthetic; no bank endpoint, live email, real receipt or application financial record was used.
