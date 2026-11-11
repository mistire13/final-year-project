# Plus billing automation implementation report

Integration report prepared by the primary agent, 9 November 2026.

Delivered monthly fee configuration, child-specific fee precedence, reviewed recurring discounts, expiring preview confirmation, versioned settings, idempotent invoice generation, balance aging, before/after reminders and delivery history. Recipients, balances, active accounts, parent links, subscription rights and consent are checked before delivery. Existing manual billing and payment recording remain available without Plus.

Migration 051 adds scoped settings, previews, runs and durable reminder jobs with leases, bounded retries and unique invoice/channel keys. The worker discovers only tenant identifiers via a restricted function and scopes actual financial work per tenant. In-app reminder delivery and message creation are transactional. Reviewed settings changes can reset only failed current-month generation, preserving existing invoices and audit evidence.

Parents can load and change explicit billing email consent from their bills screen, including after a package downgrade. GET/PATCH queries bind the active parent account and daycare; load/save failures expose retry feedback. Platform scheduler/email availability appears in the admin settings UI.

Validation: billing service integration tests 2/2, separate preference privacy test 1/1, frontend billing/preferences tests 3/3, TypeScript clean. The final 70-check Plus/security/isolation run passed after the review fixes. Tests use disposable databases and mocked email transports; no live parent messages or email were sent during validation.

Local rollout: `BILLING_AUTOMATION_ENABLED=true`; `BILLING_AUTOMATION_EMAIL_ENABLED=false`. There were zero enabled daycare schedules at activation. Each Plus administrator must deliberately preview and enable a schedule. External email requires complete SMTP configuration, the platform email flag, daycare email enablement and parent opt-in. Invoice automation does not debit anyone or transfer money.

Limits: SMTP delivery is implemented but has not been exercised against a real recipient. Like ordinary SMTP, a process crash after the mail provider accepts a message but before the local success update can cause a duplicate retry; the deterministic Message-ID helps identification but cannot guarantee exactly-once external delivery. SMS is excluded.
