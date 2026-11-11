# Daycare receipt frontend completion review

Reviewed on 2026-11-10. Scope: parent receipt interaction, daycare account settings and independent review/resolution, frontend API and DTO contract, and their screen mounts.

## Completed behavior

- The parent card recovers saved requests and their submitted proof before requesting current receiving accounts. Disabled or unavailable current accounts do not hide the receiving details accepted for an existing request.
- Completion callbacks remain current without restarting the load effect. Switching invoice/order targets resets local proof, payer bank selection and idempotency key; delayed work for the previous target cannot replace the current request or invoke its callback.
- Duplicate button presses share one in-flight operation. Failed creation or verification responses trigger a saved-status lookup; proof remains entered and the latest request version is retained for retry. Backend keys and reference claims remain authoritative.
- Checking requests expose status refresh rather than another verification submission. Expired requests can submit their original proof for timing review with an explicit warning against a new transfer. Verified unapplied, resolved and applied requests cannot initiate another payment through this card.
- Admin request refresh, review and pagination reload requests independently of receiving settings. Unsaved receiving-account edits and the accepted optimistic version survive those actions. An explicit “Discard edits and reload receiving settings” action is available after an error. Failed initial settings loads cannot expose a blank save form.
- The request table shows the DTO's `submitted_reference` and expected payer. Independent approval requires actual transaction evidence, confirmations and an entered date, interpreted in Addis Ababa time. It does not default the transaction date to today.
- Verified unapplied money exposes only independent refund/credit resolution, requiring evidence, reconciliation reason, full-amount confirmation and the current version. The UI does not offer proof rejection for confirmed money.
- Parent APIs use `apiClient`; admin management uses `portalClient`. Parent design components use `System.tsx`; portal actions and surfaces use `ui.web.tsx`.

## Mount review

- `ParentBillsScreen`: the bank card uses the selected invoice ID; applied payment reloads balances via a stable callback.
- `CheckoutScreen`: nonzero bank-transfer orders navigate to payment verification; zero-total orders skip payment.
- `AccountScreens`: outstanding, uncancelled orders can reopen payment options.
- `DaycareFinances.web.tsx`: management is mounted inside the live finances view, before the loading content. `onSettled={loadData}` changes callback identity on rerender but does not change management's effect dependencies or unmount it, preserving unsaved receiving settings. Preview mode excludes management.

No integration screen files were changed by this completion pass.

## Verification

Node executable: `C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe`.

- `node --experimental-strip-types --test scripts/*.test.cjs` from `frontend`: **91 passed, 0 failed** at this pass's final run. Log: `tmp/daycare-receipts-frontend-tests.log`.
- `node node_modules/typescript/bin/tsc --noEmit` from `frontend`: **passed**.
- New `frontend/scripts/daycare-receipts-ui.test.cjs`: **12 focused tests** covering saved-proof recovery, callback identity, duplicate opens and lost responses, stale target response isolation, retained proof/version on verification failure, checking/verified/resolved actions, expired proof, exactly-once applied callback, pagination with unsaved settings, failed settings initialization, independent resolution, independent approval dates/evidence, and role-specific API payloads.

Tests execute transpiled components with a deterministic React-hook harness and mocked API boundaries. They exercise rendered controls and their handlers, without calling a bank provider, sending email, moving money or modifying the application database. The required frontend `AGENTS.md`, Expo v57 documentation, UI styling skill and session isolation rules were read.

## Limits

This pass did not perform a browser or physical-device visual acceptance run. Provider matching, tenant enforcement, permanent reference claims and accounting atomicity are backend responsibilities and require their separate integration tests. If status recovery also fails during a transport interruption, the card keeps the entered proof and directs the parent to refresh the saved request instead of paying again.
