# Veritas Telebirr investigation — 8 November 2026

Investigation only. No product code or payment state was changed in this investigation. No API key, customer reference, recipient details or session token is included in this report.

## Live recheck — 9 November 2026

At 12:18 UTC (15:18 Addis Ababa), made one diagnostic Telebirr lookup through the application's actual `lookupVeritas` adapter, using the configured key and the reference previously provided by the user. Current official documentation still specifies `POST /verify-telebirr`, JSON `{reference}`, the hosted `verifyapi.leulzenebe.pro` API and the `x-api-key` header; these match the application configuration.

- Public API health: HTTP 200.
- Authenticated Telebirr verification: HTTP 502 in approximately 2.4 seconds.
- Application classification: `upstream`, retryable; no successful receipt evidence returned.
- No payment intent was created, verified, consumed or updated; no reference was claimed. The diagnostic called only the provider adapter, without the payment-state service.

This live check does **not** establish functioning automatic Telebirr verification. The tested lookup still fails at the external API gateway/lookup path despite a healthy API health endpoint. It does not prove that all references fail or identify Veritas's internal cause. No automatic fallback or security-policy change was made. Official references: https://veritas.et/docs and https://veritas.et/docs/verification. The public status page timed out during the documentation check, so no status-page claim is made.

## Follow-up implementation

After the user authorized fixes, the application-side issues were addressed:

- `veritas-client.js` classifies upstream, authentication, credit, rate-limit, invalid-response, timeout and connection failures separately. It handles HTTP failure before JSON parsing, cancels unused error bodies, bounds successful response reads, rejects redirects and does not perform automatic retries that could consume credits.
- Payment attempts retain safe failure codes, HTTP status and retryability metadata. The status endpoint and verification response return application-owned explanations, including after reload. Raw HTML, keys and provider exception messages are never shown to customers.
- Signup and renewal show checking/result notices. Signup errors receive focus and scroll into view. Expired-session guidance now tells an already-paid customer to contact support instead of promising a verification form that is unavailable.
- Recipient names require exact equality after Unicode, case and whitespace normalization. Prefix-only matches are rejected. Exact amount/currency, full normalized phone, reference/date checks and the durable reuse ledger remain enforced.

Additional investigation: a second HTTP client also received HTTP 502 from Veritas. A direct read from Telebirr's official receipt host timed out after 30 seconds from this machine. A replacement receipt scraper would encounter that connectivity problem too. No unvalidated automatic fallback was enabled and no real payment was approved or consumed.

Validation: 33 backend subscription regressions passed, including disposable-database signup, approval, renewal, runtime permissions and duplicate-reference tests. All 22 selected frontend lifecycle/payment/recovery regressions passed; the eight payment-component tests also passed after adding error focus. Final TypeScript, production web export, syntax and whitespace checks passed.

## Documentation comparison

Official sources:
- https://veritas.et/docs — hosted API base and JSON conventions.
- https://veritas.et/docs/authentication — `x-api-key`, 401/403 authentication failures, feature access.
- https://veritas.et/docs/verification — `POST /verify-telebirr` with `{ reference }`, nested Telebirr `data`, verification credit behavior.
- https://veritas.et/docs/reference/providers — Telebirr uses a ten-character reference.
- https://veritas.et/docs/reference/errors — distinguish transport, authentication, credits, receipt matching and provider failures; avoid blind retries.

The configured host, HTTPS, request method, endpoint, API-key header and JSON body match those documents. The most recent stored Telebirr reference has ten alphanumeric characters. Correct format does not establish that a receipt exists or is payable.

## Live observations

1. Public `GET /health`: HTTP 200, JSON `status: ok`.
2. Public `GET /`: HTTP 200, API version 3.0.3, Telebirr verification endpoint advertised.
3. One diagnostic lookup using the latest submitted reference and configured key: HTTP 502 after about 2.6 seconds, `text/html`, Cloudflare server and a gateway error page. No transaction data returned. The call did not update the local payment record.
4. Negative authentication control using an intentionally invalid synthetic key/reference: HTTP 403, JSON `success: false`, `Invalid API key`. No real key or receipt was sent for this control.
5. The latest stored local session is now expired. This is separate from the direct upstream 502 and can block the normal application verification endpoint before a lookup.

These observations indicate that the API is reachable and its authentication rejection path works, while the tested authenticated Telebirr lookup fails at the external gateway/lookup path. They do not identify Veritas's internal fault, conclusively establish key entitlements, prove receipt validity, or establish a permanent outage affecting all references.

## Confirmed application issues

- `lookupVeritas` calls `response.json()` before handling an unsuccessful HTTP response. An HTML 502 page throws into a generic unavailable catch, losing the HTTP status and useful failure classification.
- Verification persists only a generic `needs_review` result. Transport failures and mismatched receipt evidence become indistinguishable in the stored outcome and customer response.
- The payment component saves the returned session but does not render the backend's `message`, so a pending lookup looks silent once the brief loading state ends.
- The page describes verifying an already-paid transfer after expiration, while its expired-session branch hides verification and the backend enforces its expiration rule. This needs one explicit recovery policy and consistent guidance.

## Proposed fixes after presenting the investigation

1. Preserve safe HTTP status and failure categories; handle HTML/non-JSON gateway errors without losing their cause. Never expose the key, raw receipts or provider HTML to customers.
2. Display persistent checking/result notices, including service unavailable, invalid reference, mismatch, and pending operator review. Keep entered references available for correction.
3. Validate the documented Telebirr reference format before spending a provider verification credit.
4. Keep automatic confirmation conditional on complete, matching amount, currency, recipient phone/name, reference and date evidence, plus the existing reference-reuse ledger. Do not weaken verification to bypass the 502.
5. Make paid-but-expired recovery guidance consistent. Never ask a customer to pay a second time merely because verification failed.
6. Do not add uncontrolled retries: Veritas documents that failed verification attempts may consume credits. A continuing external 502 requires recovery on the Veritas side; local changes can handle and explain it, not manufacture a verified receipt.
