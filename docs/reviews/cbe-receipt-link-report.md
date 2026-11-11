# CBE receipt-link checkout — 8 November 2026

## Delivered behavior

- CBE signup and renewal ask for one complete HTTPS CBE receipt link. There is no CBE suffix input or screenshot reference extractor.
- The backend validates the exact CBE receipt host and receipt identifier. Bare references, unrelated hosts, missing receipt identifiers, duplicate `id` parameters, credentials, fragments and unsupported ports are rejected before verification.
- Legacy links containing an FT reference and eight-digit suffix are parsed into Veritas's `reference` and `accountSuffix` fields. Modern receipt URLs are preserved intact. The configured receiving account is never used to guess a suffix.
- Reference matching binds the provider result to the receipt identifier, rather than accepting arbitrary query values. The link, extracted identifier and authoritative verified reference are checked against the permanent reference ledger. Alternative links for the same confirmed receipt cannot be reused.
- Existing amount, currency, receiver name/account, date, success and session-binding checks remain required. Parsing a link never marks a payment paid.
- Telebirr and Abyssinia retain their separate verification requirements. Existing historical payment records are preserved.

## Validation

- 74 backend subscription/comprehensive tests passed, including legacy-link extraction, modern links, wrong-host rejection, identifier binding, historical alias protection and reuse across different link formats/providers.
- 39 frontend tests passed, including CBE link-only signup and renewal, no CBE suffix/screenshot controls, and unchanged Abyssinia suffix behavior.
- TypeScript, production web export and whitespace checks passed.
- Browser inspection confirmed the real CBE checkout displays the receipt-link field, its no-suffix explanation and verification action. One unpaid local test session was created using an `example.invalid` email. No receipt was submitted, provider credits spent, money transferred or application submitted by this browser check.

Genuine receipt verification remains for the user's private live test. Incomplete or mismatched provider evidence remains pending.

## Primary references

- [Veritas provider formats](https://veritas.et/docs/reference/providers): legacy CBE links can carry the suffix; modern receipts use tokens/URLs on the CBE receipt host.
- [Veritas verification API](https://veritas.et/docs/verification): dedicated CBE verification uses `reference`, with `accountSuffix` for bare legacy FT references.
