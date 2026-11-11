# Subscription payment implementation report

## Scope

The backend records confirmed references in a durable, database-unique ledger across registration and renewal. Unverified attempts can be corrected without permanently reserving a reference. Historical confirmed payment intents and manual renewal events are backfilled; an upgrade stops rather than guessing if historical evidence conflicts, is missing, or is inconsistent. Unknown-provider historical spellings receive conservative aliases, while modern CBE tokens and receipt URLs retain case-sensitive handling.

Automatic verification requires successful provider evidence for the exact payment amount, currency, receiver name, receiving account, transaction reference and date. The expected receiver is snapshotted from the operator-configured settings. Inconclusive results remain pending for independent, audited operator review; screenshots only provide candidate references.

Verified renewal and payment-reference claiming occur within the same database transaction. Subscription terms are compared to the accepted package, including its version and capacity. A new operator-authorized restart for a center overdue by more than a full billing period snapshots its terms and lasts seven days. It binds to one payment session; access remains restricted until payment is verified. A pending reference or verified payment must be independently reviewed before another restart agreement can be issued.

## Verification

The subscription suite passed on disposable PostgreSQL databases after the main integration. The final historical-reference migration checks passed **6/6**, covering missing and inconsistent evidence, unknown providers, manual renewal history, normalized collisions, legacy CBE FT identifiers, and case-sensitive modern CBE tokens and URLs. A separate overdue-restart integration test passed using PostgreSQL; it exercises expiry, stale terms and authorization, tenant isolation, one-session binding, operator review of an expired submitted reference, and activation only after verified payment. The tests also cover receiver/amount mismatch, duplicate references, concurrent claims, retries, paid signup and renewal, restricted database roles, and reminders. No live application data is used by these tests.

## Operational limits

The Veritas response fixtures are synthetic. Actual provider-specific responses and identity fields have not been validated against authorized receipts; incomplete responses require operator review. Live SMTP, Tesseract installation and real-money transfers are not established by these tests. The ledger migration must be applied after a backup, and any reported historical conflicts require reconciliation rather than deleting evidence.
