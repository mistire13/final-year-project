# Standard / Plus plan reconciliation

9 November 2026. Read-only product-code review against `docs/STANDARD_PLUS_PACKAGE_PLAN.md`; only status documentation changed. This is a scope audit, not a new full security audit, device test or rerun of all tests.

## Subsequent implementation status

The user subsequently authorized implementation. The workflow/UI items identified below have now been implemented locally: staff calendar/agenda, grouped reporting/presets, accepted next-period package changes, full independently completed cash-return records and authenticated browser walkthroughs. Migrations054/055 were backed up, rehearsed and applied. See [completion delivery](plus-completion-delivery.md) and [release runbook](../PLUS_RELEASE_RUNBOOK.md). The original findings below remain as the audit snapshot; live providers, real email, physical devices and production rollout are still prerequisites, not completed acceptance claims.

## Implemented locally

- Standard/Plus public names, server-side feature checks, entitlement snapshots, administrator-configured prices and package-before-period pricing flow.
- Plus shop creation/catalogue controls, stock locking, cash payment recording/receipt references, inventory history and historical order access after downgrade.
- Business reports, custom date/classroom filtering, comparable periods, genuine occupancy evidence, separate care/shop accounting and CSV/print-to-PDF.
- Reviewed monthly invoice automation, persistent reminder jobs, aging/history, parent email consent and runtime availability messages.
- Staff templates, preview/publication, availability, leave review, substitutions and duty-bound safety permissions.
- Duplicate subscription-reference claims and protected signup/renewal/recovery workflows.

The recorded automated results are 119 core backend checks, 77 subscription checks and 69 frontend checks, plus focused Plus regressions and TypeScript. These results do not establish live provider availability or complete human/device acceptance.

## Remaining workflow and UI items

| Item | Current implementation | Remaining work |
| --- | --- | --- |
| Next-period package change journey | `subscriptions.service.js` rejects `change_package` while the current paid-through date is future. After expiry an operator can record new terms and take verified renewal payment. | No ability to agree/schedule a future package change while the current period is active. Finish that journey if changes must be arranged ahead of expiry, preserving current benefits, binding payment to accepted future terms and rechecking downgrade capacity at activation. Immediate prorating stays excluded. |
| Staff calendar | The staff portal lists dated duties in a table with range filters; recurring scheduling/leave/substitution logic exists. | Add the planned week/calendar presentation, usable on narrow screens and with keyboard navigation. Preserve role scope and existing responsibilities. |
| Analytics grouping | Custom ranges supply selected-period totals, daily attendance series and equal-length comparisons. A seven-day/month-long report can already be exported. | Dedicated week/month chart aggregation and convenient period presets are not implemented. These finish the explicit daily/weekly/monthly presentation; existing monthly downloadable reporting is available. |
| Paid shop order resolution | Unpaid cancellation safely restores stock. Paid/pending orders cannot be cancelled; recorded payments cannot be reversed from the order editor. | Add an independently evidenced, audited refund/reconciliation record and corresponding admin/parent states before claiming full paid-order resolution. Recording an actual refund must not imply the app transferred money. No external refund processor exists. |
| Final interactive acceptance | Public pricing was browser-checked at mobile/desktop widths; other modules have API/component tests. | Walk the authenticated super-admin, daycare-admin, caregiver and parent journeys against disposable fixtures, including failed network requests, stale sessions, reload recovery, keyboard access and real Android/iOS behavior where available. |

The next-period change row is a practical workflow limitation relative to the plan's next-paid-period policy; the backend currently protects the paid period rather than silently applying an early change.

## Remaining live integration and rollout items

1. **Telebirr:** the latest authorized direct lookup returned HTTP 502 despite API health returning 200. The app classified it as upstream failure and made no payment-state change. External recovery must be confirmed with a genuine successful lookup; do not weaken matching or approve inconclusive evidence.
2. **CBE and Abyssinia:** bank adapter tests pass; an earlier CBE receipt lookup succeeded. A fresh controlled end-to-end check for each selected live provider, including mismatches/reuse and activation/renewal, remains outstanding. Do not re-use an unrelated old receipt as a new real payment.
3. **Strict matching:** local development intentionally still has name-and-amount test mode. Turn it off and validate full receipt evidence before real subscription acceptance. Production already ignores the development bypass.
4. **Email:** billing email delivery is disabled; configure SMTP and verify delivery/opt-out using controlled consenting recipients. Daycare enablement and parent opt-in remain required. SMTP acceptance followed by a process crash can still cause a duplicate retry; deterministic Message-ID alone does not guarantee exactly-once delivery. Resolve or explicitly accept that limitation before claiming crash-proof external email delivery.
5. **Configuration:** review the six real package prices and receiving-account details through the super-admin interface. Existing development values were preserved, including the previously observed Plus monthly price of 1 ETB. Do not overwrite these without an authorized configuration choice.
6. **Production deployment:** staging/production configuration, durable worker operation, backup scheduling, monitoring and deployment checks remain unperformed. Local migration backups/restore rehearsals and runtime-role checks have passed.

## Scope boundaries

Live online shop payment processing, SMS, automatic report email, profit/cost accounting and immediate prorated upgrades were deferred or excluded. Cash settlement was the agreed first shop-payment implementation, so absence of an online gateway is not itself an unfinished first-release requirement. Parent enquiries, admissions and waiting lists were explicitly removed and must not be reintroduced.

## Suggested execution order

1. Complete authenticated frontend walkthroughs and address concrete issues found.
2. Finish the staff calendar and reporting controls.
3. Finish next-period package-change and evidenced paid-order resolution journeys, with backend concurrency/ownership tests and matching UI.
4. Complete strict live payment and controlled email acceptance when provider/configuration prerequisites are available.
5. Prepare a reviewed staging/production rollout.
