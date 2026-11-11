# Standard / Plus local delivery

9 November 2026. Core implementation and local migration rollout delivered; no production deployment performed. A subsequent line-by-line [plan reconciliation](plus-plan-gap-audit.md) identifies remaining workflow/UI and live-validation work. Earlier completion language applies to the delivered modules, not every planned detail or launch readiness.

## Delivered

- Public Premium naming changed to **Plus**, preserving internal `premium` identifiers and accepted historical terms.
- Server-owned feature policy and new-payment feature snapshots; Standard/Plus differences appear in pricing, portal and parent navigation.
- Plus-only new shop/catalogue activity, exact admin-recorded cash settlement and receipt reference, paid/unpaid order reporting, low stock and immutable inventory movement evidence.
- Plus business reports with attendance/occupancy, fee collections, shop activity, filtered CSV and printable PDF.
- Reviewed recurring monthly invoicing and reminder jobs, delivery/aging history, parent email consent and visible platform availability.
- Staff templates, preview/publication, availability, leave and substitutions. Existing care/safety duties remain available in Standard; approved leave is respected by manual duty creation too.
- Existing orders, invoices and receipts remain accessible for resolution after downgrade/expiry. Prior paid Standard shop promises are preserved only until their recorded paid-through deadline.
- Admissions, enquiries and waiting lists remain excluded.

## Review and verification

- [Independent review](plus-final-review.md): three actionable findings fixed with regressions: manual leave bypass, catalogue entitlement transaction race and exhausted billing-run recovery.
- [QA report](plus-final-qa.md): 70 Plus/security/payment/isolation checks and 77 subscription checks passed, with zero skips. CBE parser/export and cash SQL parameter defects discovered during QA were fixed.
- Full existing essential regression suite: **119/119 passed**, including child safety, authorized pickup, front desk, health/report metrics, communication and profile reliability. The communication isolation fixture was updated to use Plus shop eligibility and retain immutable inventory evidence in its disposable database.
- Full frontend suite: **69/69 passed**. Final analytics follow-up: backend 2/2 and frontend 2/2; final TypeScript `--noEmit` passed.
- [UI report](plus-ui-final-report.md), [staff report](plus-staff-report.md), [analytics report](plus-analytics-report.md), [billing report](plus-billing-report.md).
- Browser check: Standard/Plus names and differentiated benefits displayed; selecting Plus opens monthly, six-month and annual comparison cards. Checked mobile and desktop layouts and restored the original viewport. No payment session or application was created.
- Running backend health/catalogue returned 200. Anonymous analytics, billing, scheduling and feature routes returned 401.

Logs: `tmp/plus-essential-final.log`, `tmp/plus-frontend-final.log`, `tmp/plus-qa-features-isolation-final.log`, `tmp/plus-qa-subscriptions-final.log`. Browser evidence: `tmp/plus-pricing-desktop.png`, `tmp/plus-billing-desktop.png` and `tmp/plus-billing-periods.png`.

## Database and runtime

Created private custom-format PostgreSQL backups in ignored `tmp/subscription-backups/`, verified archive contents, restored a disposable copy and rehearsed migrations 049–053. The first conservative preservation comparison detected expected update-trigger audit version/timestamp changes. The corrected check permits only the intended catalogue naming, legacy access column and associated audit version/timestamp differences. It confirms prices, capacity, receiving settings, accepted terms, payment intents and reference/payment history remain unchanged. A fresh rehearsal and comparison passed before applying the same migrations locally. Temporary restored databases were removed.

The backend verifies its restricted runtime roles before listening on port 5000. The frontend serves on port 8081. The local billing worker is enabled, with zero daycare schedules enabled at rollout; external billing email remains disabled. No real payments, paid applications or external messages were created by these tests.

## Operational limits

- SaaS subscription payments remain separate from daycare shop income. Shop settlement is administrator-recorded cash at the daycare; live online shop payments and external refund processing are unavailable.
- Existing super-admin configured prices were preserved, including Plus monthly at **1 ETB** in this development database. Change test prices on the super-admin page before offering real subscriptions.
- Existing `SUBSCRIPTION_NAME_AMOUNT_TEST_MODE=true` remains development-only, as requested for local receipt testing. Production ignores it and uses strict evidence matching; disable it locally before accepting real subscriptions.
- External reminder email needs configured SMTP, an enabled platform flag, daycare opt-in and explicit parent consent. Real SMTP/provider delivery was not tested in this rollout.
