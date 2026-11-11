# Daycare receipt final QA

10 November 2026. QA owner: `receipt_qa_finish`.

## Scope and isolation

Care-fee verification is available on Standard and Plus; new shop purchases remain Plus-only. Daily/weekly billing remains deferred. All integration suites create randomly named, owned disposable databases through `backend/scripts/helpers/auth-test-database.cjs`; the configured application database was never a mutable target. No main application server was started or stopped. Provider evidence and delivery were mocked; no real payment, receipt, email or bank request was used.

The sandbox initially denied localhost PostgreSQL with `EACCES`; the same command was rerun with approved escalation for local disposable test connections. That initial infrastructure failure is not counted as a product test result.

## Final backend results

- Broad serial strict suite: **229 passed, 0 failed, 0 skipped**, 144.1 seconds. Includes receipt service, independent receipts, independent ledger migration, lifecycle, every Plus suite, subscription suites, comprehensive subscription checks, Veritas client and essentials (security, legacy authentication, payment-disabled endpoints, tenant isolation, child safety, attendance/pickup, reporting, communications and profile reliability).
- Additional cash provenance regression run: **6 passed, 0 failed, 0 skipped**, 13.3 seconds. It verifies new care cash rows retain `cash_confirmed`, direct manual bank-transfer recording fails before inserting a payment, no bank request is created for physical cash, and Plus shop cash settlement after downgrade retains `cash_confirmed`.
- Receipt/lifecycle rerun after the no-active-admin security fix: **15 passed, 0 failed, 0 skipped**, 22.4 seconds. This includes provider-confirmed money surviving removal of all active administrators, permanent reference claims, cash provenance, strict evidence, immutable refund evidence, guardian removal, migration rollback and exact SaaS/Addis date boundaries.
- Independent final rerun after both security fixes: **23 passed, 0 failed, 0 skipped** across receipt service, independent receipt/cash, subscription bank-switch and subscription ledger migration. The persisted new SaaS preflight test accepts distinct modern CBE tokens while blocking exact and historical aliases before provider lookup. The no-active-admin retention regression passes again. Execution experienced a long host/tool delay (reported wall time 2,807.9 seconds); no failure or skip was suppressed.
- After browser acceptance found the immediate care cash receipt response omitted provenance, root added the missing response field and QA extended the persisted cash regression to assert both `recorded.receipt.verification_source` and `recorded.payment.verification_source` equal `cash_confirmed`. The independent receipt/cash suite then passed **4/4, 0 failed, 0 skipped**, 11.3 seconds. Root separately owns the frontend full-receipt mapper and due-today date helper fixes and their frontend validation; this agent did not claim browser coverage of those changes.

All commands used Node 24 at `C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe`, `NODE_ENV=test`, `SUBSCRIPTION_NAME_AMOUNT_TEST_MODE=false`, the strict environment preload and `--test-concurrency=1`.

Ignored evidence files under `tmp/subscription-backups/plus-ui-acceptance/`:

- `daycare-receipts-final-combined.log`
- `daycare-cash-provenance-final.log`
- `daycare-receipts-final-focused.log`
- `daycare-receipts-post-security-final.log`
- `daycare-receipts-response-provenance-final.log`

## Disposable browser fixture

Updated `backend/scripts/plus-ui-acceptance-fixture.cjs` for schema 056 by configuring a separate daycare receiver through the real service, seeding an unpaid care invoice and unpaid shop order, and retaining the existing cash-paid shop order. Daycare receiver `1000000901` differs from platform SaaS receiver `1000000001`. The fixture uses restricted runtime database roles, the real legacy password/JWT flow, a generated disposable database and port 5300. Live bank lookup returns unavailable; SMTP transport throws and all delivery/automation settings are disabled. It never falls back to live provider calls.

Expanded the authenticated API checker with receiving-settings privacy, parent-safe destination, cross-tenant destination isolation, caregiver denial and platform-operator denial probes. **35 authenticated/API acceptance checks passed**, including real password login, role-specific reads, destination separation, logout and token revocation.

The fixture was started successfully and remains available to the integration owner at `http://localhost:5300/api`: Node PID `36356`, generated database `ankelba_auth_test_36356_1794316265625_d126afd3`, exec session `26264`. Parent care invoice ID is `1`; unpaid shop order ID is `2`. The final checker proved this running API is reachable and authenticated. Root owns browser acceptance and coordination of exact fixture shutdown; use `backend/scripts/stop-plus-ui-acceptance.cjs` after that work finishes. This cleanup targets only the recorded fixture PID and its generated owned database.

The fixture's ignored `fixture.json` contained its generated account password and IDs; credentials are not copied into this report. After browser acceptance, the integration owner stopped the exact fixture and independently confirmed its database and credential artifact removed. Normal application servers were restored on 5000/8081. See [integration acceptance](daycare-receipts-integration-final.md) for browser coverage. These backend results do not establish live-provider, SMTP or physical-device readiness.
