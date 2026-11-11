# Modern CBE response mapping — 8 November 2026

The user supplied a genuine modern CBE receipt link that failed in the application. Two read-only Veritas lookups returned HTTP 200 and `success: true`. The response used top-level `receiver` and numeric `amount`, with `payer`, `payerAccount`, `receiverAccount`, `date`, `reference` and `reason` fields. The verified amount matched the current Standard monthly amount, and the returned receiver name matched the configured CBE holder.

The application's matching function recognized `receiverName`, `creditedPartyName` and `beneficiaryName`, but omitted CBE's `receiver`. Consequently the correctly configured local name-and-amount test policy rejected the receipt as `name_amount_mismatch`.

The shared matcher now accepts the `receiver` alias. Explicit existing name fields retain precedence, and only a string with the exact normalized expected name can pass. Numeric amounts already supported exact minor-unit comparison. Missing status/currency are not fabricated: the user's explicit development test policy handles this response, while strict mode retains its complete-evidence requirements.

An anonymized regression fixture reproduces the observed CBE response shape. Persisted test-mode coverage now uses that shape and verifies wrong receiver rejection, successful matching, identifier claims and transaction reuse prevention. All nine affected matching/bank/paid-flow checks passed.

The genuine receipt was not approved, consumed or claimed during diagnostics. The user's current session was still unexpired and the confirmed-reference ledger remained empty before restart. The backend was restarted to load the fix. No sender details, full account numbers, real receipt token or API keys are retained in this report or regression fixture.

Primary response-format reference: [Veritas verification documentation](https://veritas.et/docs/verification).
