# Independent subscription review

Review scope: the reference ledger and migration, Veritas amount/receiver matching, renewal state transitions, operator payment actions, and subscription recovery UI. The review used source inspection and synthetic tests; it did not use live bank receipts, customer data, or provider credentials.

## Findings reported during implementation

1. **Renewal recovery for long-overdue centers.** Creating a renewal was blocked after more than one missed period, but the operator could only apply an already verified intent; no supported action could prepare a new pay-first renewal. This would leave the daycare unable to renew. An audited operator-approved restart offer is needed, without restoring access before payment.
2. **Historical manual-payment references.** The initial ledger migration backfilled confirmed payment intents but did not account for historical manual renewals recorded in `subscription_events.details.payment_reference`. Without preservation or a fail-closed migration check, those references could be reused. Existing ambiguous data must be reconciled instead of silently discarded.
3. **Renewal email recovery navigation.** The landing page dispatches a navigation event from its mount effect while the parent route listener is installed in a parent effect. This ordering needs an actual browser check and, if confirmed, a robust navigation change that retains token secrecy.

The implementation now includes an audited, time-limited restart agreement tied to a single payment intent; it does not restore access before confirmed payment. A PostgreSQL integration test passed for that path, including stale and expired agreements, tenant boundaries, and prior pending evidence. The ledger migration now preserves historical intent and manual-renewal references, adds conservative aliases for unknown-provider and legacy CBE FT records, and stops on missing or conflicting evidence; the final historical migration tests passed 6/6. The recovery-navigation finding requires separate verification by the frontend integration review. See the final integrated test results for evidence and remaining limitations.

## Safeguards observed

- Unverified attempts are separate from the durable confirmed-reference ledger; confirmed references are globally unique and the runtime control role cannot update or delete ledger entries.
- Automatic verification requires a positive provider result, matching reference, amount, currency, receiver name, account and transaction date. Incomplete provider data remains pending.
- The normal verified-renewal path locks the daycare and payment intent and records verification and renewal in one transaction; an already consumed intent is idempotent.
- Manual payment approval requires an independently verified reference, evidence, and an explicit amount-and-receiver attestation. Authorization still relies on the existing super-administrator route guard.

## Verification limits

Strict matching is intentionally conservative, and the real hosted Veritas response formats and account masking are not proven without sanitized real or provider-approved receipt fixtures. Independent end-to-end tests remain necessary for live SMTP delivery, Tesseract extraction, browser recovery navigation, role-limited database access, concurrent reference claims, and long-overdue renewal recovery.
