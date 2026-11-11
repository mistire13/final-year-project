# Final subscription security review

Review scope: payment reference claims and migration 047, provider amount and receiver checks, overdue restart authorization, renewal concurrency, and operator API/UI contracts. This review used source inspection and existing synthetic test evidence; it did not use real payments, customer data, provider credentials, or the application database.

## Findings and disposition

- The initial migration inserted only the original spelling of historical confirmed intents with a missing provider. The corrected migration preserves an additional normalized alias for unknown/non-CBE providers and protects recognized legacy CBE FT references while keeping modern CBE tokens and receipt URLs case-sensitive. An isolated PostgreSQL test confirmed both original and normalized legacy FT references are reserved, duplicate use is rejected, and modern mixed-case tokens/URLs remain unchanged. Migration fails rather than silently discarding conflicting evidence.
- No additional confirmed bypass or data-loss issue was found in this focused review. This is not a claim of a comprehensive security audit or a guarantee that payments cannot be fraudulent.

## Safeguards observed

- Failed or unverified attempts do not claim durable reference identifiers. The confirmed reference ledger uses a global unique constraint, retains records after refunds, and grants the runtime control role only select/insert access.
- Automatic confirmation requires successful provider status and matches the expected amount, currency, receiver name, destination account, reference, and transaction date. Incomplete or inconsistent evidence remains pending. Manual confirmation requires a separate verified reference, evidence, and an explicit operator attestation.
- Renewal verification and application use the same database transaction, lock the daycare before the intent, check the complete accepted terms, and treat an already consumed intent as an idempotent replay.
- Overdue restart requires a platform operator's acknowledgement and an explicit expiry-bound authorization tied to one intent and its agreed terms; issuing authorization alone does not change the subscription end date or grant access. A separately audited operator action can resolve a verified payment that could not be applied automatically.
- Payment, restart and operator review routes have the appropriate authentication and role checks; tenant renewal actions are scoped to the authenticated daycare.

## Limits

- This review does not establish that actual Veritas responses contain all required fields or that real bank payments are authentic. SMTP, Tesseract and real provider operation require separate configured-service testing.
- The restart and reference flow uses synthetic integration fixtures. Final application-wide results and live deployment prerequisites are reported separately by QA and integration; no production transaction or external provider was exercised here.
