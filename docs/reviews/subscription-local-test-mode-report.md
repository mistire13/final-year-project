# Local reference reset and name/amount testing — 8 November 2026

The user requested clearing registered subscription references and temporarily testing verification using the receiving account-holder name and amount only.

## Applied local reset

- Target: `ankelba_dev` on localhost. The maintenance script refuses other databases or non-development environments.
- Before: seven payment sessions, four unconfirmed session references, 16 attempts and zero confirmed ledger claims. No sessions were linked to applications/daycares; no paid renewals existed.
- A custom-format PostgreSQL backup was created under the Git-ignored `tmp/subscription-backups/` directory, and its archive listing was checked before mutation.
- After: zero references and attempts; all seven payment sessions remained. Four affected sessions were reset to pending with their verification results cleared and ten minutes to retry.
- Prices, receiving-account settings, daycares and applications were verified unchanged. An audit event records the operation. Confirmed or linked payment history would have blocked this blanket reset.

## Temporary matching policy

`backend/.env` sets `SUBSCRIPTION_NAME_AMOUNT_TEST_MODE=true`. Only `NODE_ENV=development` honors this option. Production continues strict matching even when the flag is present.

The test policy requires a trusted successful provider response, exact receiver-name matching after case/whitespace normalization, and exact payable amount. Explicit failed/pending statuses remain failures. Account number, currency, date and reference binding are not approval requirements in this diagnostic mode. This deliberately weaker policy is intended only for the user's controlled local testing.

Receipt input validation and session/bank binding remain enforced. Confirmed receipt URLs, extracted receipt identifiers and authoritative provider transaction references are claimed in the permanent ledger. They cannot be reused after a successful test verification. Failed attempts do not reserve a reference. Stored verification metadata identifies `name_amount_test`, and mismatch messages describe the name/amount check specifically.

To restore full local checks, set `SUBSCRIPTION_NAME_AMOUNT_TEST_MODE=false` and restart the backend. The example environment defaults to false.

## Validation

- 76 backend subscription/comprehensive checks passed.
- After the final mismatch-message adjustment, all 11 affected matching, persisted bank-flow and provider-adapter checks passed again.
- Tests cover correct/incorrect name and amount, failed provider envelopes/statuses, production/test-mode isolation, identifier aliases, cross-link reuse and authoritative transaction reuse.
- No genuine receipt was submitted to Veritas and no live payment was approved during this work. The user will perform the genuine receipt test privately.

## Subsequent pending-request cleanup

At the user's later request, a fresh verified backup was created before deleting all seven unconfirmed local payment sessions and their two subsequent verification attempts. After the transaction there were zero payment sessions, reference claims, attempts or pending daycare applications. No confirmed or linked payment history existed. Prices, receiving settings, daycares and application records were verified unchanged. An audit event records the deletion and backup filename.

The maintenance command now supports `--remove-pending --apply`. It refuses non-pending, confirmed or linked payment history and remains restricted to local development. Browser recovery now offers an explicit “Return to pricing” action for a deleted saved session; network failures continue to retain recovery credentials and offer retry. The name-and-amount test setting remains enabled locally.

All 40 frontend pricing/payment/recovery checks, TypeScript and production export passed after the missing-session recovery fix.
