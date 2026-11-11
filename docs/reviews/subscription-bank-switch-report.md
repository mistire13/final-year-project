# Subscription bank switch — 8 November 2026

## Delivered behavior

- New signup and renewal payments offer Telebirr, CBE and Bank of Abyssinia when their receiving accounts are configured and enabled by the super administrator. There are no fabricated bank accounts.
- The operator can save separate holder names and full account numbers for the two banks, plus a Telebirr phone number, enable or disable them independently, and retain version-conflict detection and audit records.
- A payment is bound to its selected payment method, amount, currency and receiving details at creation. Settings updates and status reads no longer rewrite pending payment destinations.
- CBE signup and renewal now accept only a full receipt link. The adapter extracts an embedded legacy FT reference and `accountSuffix`, preserves modern receipt URLs, and validates the CBE host and identifier. Customers never enter a CBE suffix. Abyssinia retains its five-digit suffix. See [the receipt-link change report](cbe-receipt-link-report.md).
- All confirmation requirements remain: successful provider evidence and matching amount, currency, recipient name/account, reference and date. Masked, incomplete and mismatched data remain pending. Arbitrary CBE URLs cannot bypass reference matching.
- Existing reference-ledger records remain protected across registration, renewal, refunds and bank changes. Receipt links and their returned authoritative references are claimed together.
- Historical Telebirr sessions remain readable and usable after confirmed payment. Unconfirmed legacy sessions receive review guidance instead of being converted into bank sessions. The operator can manually review an old pending session only with independently verified reference, evidence, reason and explicit amount/receiver confirmation; that action is audited and claims its reference.
- Verification progress and result messages remain visible. No real payment was approved, consumed or fabricated during this work.

## Database and local runtime

Migration 048 adds `bank_accounts` JSONB to the existing RLS-protected settings table and extends reference fields to 2048 characters for CBE links. It retains the legacy settings columns and payment records. All methods use explicit enable controls. New bank accounts and the new Telebirr configuration start disabled; legacy example settings are retained privately without being activated as real accounts.

Before applying it to local `ankelba_dev`, a custom-format backup was written under the ignored `tmp/subscription-backups` directory and its archive listing was checked. A root Git ignore rule now excludes the private backup directory. The migration runner verified that only migration 048 was pending. It compared existing payment IDs, terms, recipients and providers before and after migration; those snapshots were unchanged.

The local backend was restarted after the migration. Its public settings endpoint returned HTTP 200 with the new accounts list and zero configured banks. Browser inspection verified package → billing period → bank/email checkout and confirmed that an unconfigured-bank message prevents starting payment. The user's existing browser payment session was not cleared.

## Validation

- 74 backend subscription/comprehensive checks passed, including persisted isolated-database flows, RLS, matching, long CBE links, bank binding, immutable destinations, duplicate-reference races and old-payment preservation.
- 37 frontend pricing, payment, application, navigation, recovery and receiving-account checks passed after adding Telebirr alongside the two banks.
- A dedicated persisted Telebirr test checks phone normalization, wrong amount/name/account/reference rejection, cross-provider reference reuse and destination preservation.
- TypeScript and production web export passed after the three-method configuration changes. JavaScript syntax and whitespace checks passed. The five affected persisted bank/Telebirr/runtime-role checks passed again after the final settings-merge change.

The user explicitly confirmed keeping Telebirr available alongside both banks. All three require explicit operator configuration and enablement. The versioned settings API accepts only configuration, version and reason; existing payment destinations are never rewritten.

Tests use synthetic receipt responses and disposable databases. Live CBE/Abyssinia receipt validation has not been claimed: the user will provide genuine receipt details or test privately after configuring the receiving accounts. Veritas availability and the completeness of live bank responses remain external dependencies; incomplete responses cannot automatically approve payment.

## References

- https://veritas.et/docs/verification
- https://veritas.et/docs/reference/providers
