# Order concurrency, cancellation and dependency follow-up

Date: 23 October 2026.

## Implemented

- Orders have edit versions, maintained by a database trigger. The admin form submits the version it opened; stale edits return HTTP 409 rather than replacing a newer status.
- Fulfillment follows `placed → confirmed → ready_for_pickup → collected`. Unpaid/failed-payment orders can be cancelled before collection. Cancelled and collected orders cannot reopen. Collection requires payment to be recorded.
- Cancelling an unpaid reservation returns its stock in the same transaction as the status update. Product rows are updated in a consistent order. Repeated cancellation never returns the same stock twice.
- Cancelled orders cannot accept payment. Recorded paid status cannot be downgraded through this form. Paid/pending cancellation is blocked until payment is resolved through an appropriate workflow; a refund integration is still unavailable.
- Order transitions, including whether stock was restored, are recorded in the tenant audit log in the transaction. Saving an already-paid status does not replace the original payment verification timestamp.
- Event cancellation requires the current version and conflicts with a simultaneous edit. Administrators have a confirmation dialog; cancelled events remain visible in administration but disappear from upcoming-event queries.
- Migration 026 applied to the regular local database (batch 11). Existing records received a version without changing their statuses or adjusting historical stock.

## Dependency and performance changes

Changed the 37 broad Phosphor icon import blocks to the package's supported individual icon imports (73 distinct icons). A TypeScript SVG declaration covers the source entry point's `className` property without weakening type checking globally.

The deferred parent navigator bundle is now **607,397 bytes**, compared with approximately 6.2 MB in the previous pass. Android's Hermes export fell from approximately 9 MB to 3 MB. These are uncompressed build-artifact measurements, not measured frame-rate or load-time claims.

Compatible package updates patched the backend HTTP/validation dependency chain and frontend `shell-quote`, `follow-redirects` and `source-map-js`. Replaced the backend's development-only Nodemon dependency with `node --watch server.js`.

| npm audit | Before | After |
| --- | --- | --- |
| Backend | 10: 1 critical, 5 high, 4 moderate | 0 |
| Frontend | 23: 1 critical, 18 high, 4 moderate | 20: 0 critical, 16 high, 4 moderate |

The remaining frontend advisories propagate through the Expo/React Native/Metro dependency chain, including `braces` and `node-forge`. Some audit suggestions recommend major downgrades to Expo 44 or React Native 0.72; these were not applied to the SDK 57 project. A supported upstream remediation/upgrade and verification are still required. Zero backend audit entries does not certify the entire system secure.

## Verification

- Essentials suite: **111 passed**, zero failed. Includes restricted runtime logins, tenant isolation, missing-version rejection, simultaneous order updates, cancellation stock accounting, terminal-state/payment guards, audit recording and event edit/cancel conflicts.
- Authentication/security suite: **50 passed**, zero failed after compatible dependency updates.
- TypeScript: `npx tsc --noEmit` passed.
- Production web export: passed; the final production bundle was used for browser verification.
- Android JavaScript/Hermes export: passed. Physical-device testing remains open.
- Browser: parent sign-in → store → cart → checkout → unpaid order; administrator sign-in → cancel order → catalog stock restored to original 20; event confirmation → cancellation → cancelled status with further editing disabled.
- Test records belonged only to a generated disposable database and restricted test roles. These were removed after verification. The normal backend was restarted with the updated code/dependencies and returned HTTP 200 from `/health`.

Screenshots: `docs/screenshots/cancelled-order-stock-restored.png`, `docs/screenshots/event-cancelled.png`.

## Still open

Frontend advisory remediation, automated frontend timing/race tests, physical-device and screen-reader acceptance, and broader mutation coverage remain open. Payments/refunds, device-backed pickup verification and push/reminder delivery still require real integrations. These checks do not establish complete release readiness.
