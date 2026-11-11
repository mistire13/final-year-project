# Subscription QA report

Date: 7 November 2026. All database tests used generated disposable local PostgreSQL databases; no application data was changed.

## Results

- `cd backend && npm run test:subscriptions`: **22 passed**. Includes a real database paid signup and approval, expected amount and configured receiver-name matching, wrong recipient, corrected pending reference, concurrent cross-provider reference claims, prevention of reuse after refund, automatic renewal and idempotent retries, overdue checkout guard, restricted runtime roles and ledger migration/backfill. Veritas responses are synthetic.
- The same suite includes persisted reminder tests: cancellation and resumption for one period, concurrent workers, stale lease ownership and timestamp comparison with PostgreSQL microsecond precision. Numeric-only receipt extraction, queue search/pagination beyond 200 entries and platform plan statistics were also checked against disposable data.
- `cd backend && npm run test:essentials`: **119 passed** after making the tenant-isolation calendar fixture derive future dates from PostgreSQL and adding the 034/041 fields read by current HTTP middleware to the 017-to-018 profile migration fixture. The historical profile upgrade checks remain intact. The first sandboxed run failed with local-network `EACCES`; the complete successful run used approved local database and HTTP access.
- `cd frontend && node --test scripts/registration-lifecycle.test.cjs scripts/subscription-payment.test.cjs scripts/subscription-recovery.test.cjs`: **9 passed**. The registration tests now enter the application form through a verified-payment stub, while retaining pending-request close/Escape and duplicate-submit checks, payment intent binding, error/input preservation and draft reset. Payment and recovery component tests use mocked APIs. `npx tsc --noEmit` also passed.

## Limitations

- No live Veritas receipt or merchant account was available. The response fixtures are synthetic and are not proof of each provider's actual production response or transaction authenticity.
- Tesseract and SMTP are external deployment dependencies. These tests do not establish installed OCR capability, actual screenshot recognition, or delivery of real reminder/recovery emails.
- Reminder tests simulate delivery. SMTP cannot guarantee exactly-once delivery after an ambiguous network failure; processing and lease ownership are checked, not external-provider delivery semantics.
- Existing expired-daycare HTTP testing covered check-in, incident and authorized manual pickup with synthetic data; biometric hardware and every operational path were not exercised.
