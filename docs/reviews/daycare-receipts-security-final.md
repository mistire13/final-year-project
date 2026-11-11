# Daycare receipt security review — final

10 November 2026. Review owner: receipt_security_review.

The reviewed receipt and shared-ledger paths have no outstanding actionable findings after the two narrow fixes below. This is a source review with synthetic disposable-database verification, not a live-bank or production certification.

## Scope

Reviewed migration backend/src/db/migrations/056_daycare_receipt_verification.js, daycare payment service/routes, the SaaS receipt matcher and reference ledger, tenant/control database roles, and the existing receipt QA scripts/report. Care receipt verification belongs to both Standard and Plus; new shop business remains Plus-only; existing financial obligations remain reconcilable after expiry/downgrade. Daily/weekly care billing stays deferred.

## Confirmed findings and fixes

1. **[P1, fixed] No active receipt administrator rolled back confirmed funds.** backend/src/modules/daycare-payments/service.js:102 previously threw after the provider evidence and reference claims had been written in the same transaction. A valid matched receipt then remained checking with verified_at=NULL and no permanent claims, rather than preserving received money for reconciliation. A generated database reproduction confirmed this under SET ROLE ankelba_tenant. The branch now commits verified_unapplied with receipt_admin_unavailable, preserves the authoritative reference, provider provenance and global aliases, clears the lease, and leaves the invoice unpaid until authorized reconciliation. Regression: backend/scripts/daycare-receipts-service.test.cjs:46.

2. **[P2, fixed] SaaS preflight merged case-sensitive modern CBE tokens.** backend/src/modules/saas/subscription-payments.service.js:338–340 previously applied uppercase/whitespace comparison to every known reference. A different modern CBE receipt token that varied only in case was rejected before provider lookup, despite the canonicalizer and shared ledger correctly preserving both identities. Preflight now canonicalizes each submitted alias, matches current references exactly, and uses conservative case/space comparison only for non-URL historical provider=legacy records. Regression: backend/scripts/subscription-bank-switch.test.cjs:107 proves distinct modern tokens both verify, an exact existing token alias is blocked before lookup, and a historical unknown-provider spelling variant is blocked before lookup. The existing cross-provider collision fixture now uses an identical uppercase canonical identifier for both providers.

The parent authorized these product fixes after the initial read-only findings. No other product paths were changed by this review.

## Verified controls

- Tenant runtime role can create settings, accept a strict bank result, claim its aliases and apply a care invoice. Control runtime role cannot read daycare receiving settings, requests, resolutions or the private global claim table.
- A control-role SaaS ledger insert successfully invokes the security-definer global-claim trigger. Reusing a daycare-owned identifier through that path fails with 23505, without exposing another tenant's receipt.
- Canonical modern CBE token case survives migration/runtime processing. Existing unknown-provider references retain conservative spelling protection. Shared historical conflicts roll back migration rather than rewriting past payment evidence.
- Full remaining invoice balance, accepted destination snapshots, payer matching, explicit currency/account/status/reference/date evidence and locked target checks protect automatic settlement. Local SaaS diagnostic matching cannot weaken daycare verification.
- Concurrent balance changes and revoked guardianship during lookup retain confirmed money as verified_unapplied; they do not issue a second payment or discard the reference claims.
- Late proof enters independent timing review using the original accepted account snapshot. Account-setting edits affect future requests. Manual approval requires independent transaction evidence and amount/receiver/payer/timing confirmations; its provenance remains independent_review, while historical recorded transfers retain manual_recorded.
- Confirmed money cannot be rejected. Independent refund/credit resolution requires existing verified unapplied money, records full-amount evidence and actor, has an immutable resolution row, and retains permanent reference claims. The application records the external resolution without moving money.

## Validation

Final focused run: **19 tests passed, 0 failed, 0 skipped**, using only helper-generated, owned disposable databases and synthetic provider responses:

~~~powershell
$env:NODE_ENV='test'
$env:SUBSCRIPTION_NAME_AMOUNT_TEST_MODE='false'
& 'C:/Users/Mistire/AppData/Local/OpenAI/Codex/bin/5b9024f90663758b/node.exe' --test --test-concurrency=1 --test-reporter=spec scripts/subscription-bank-switch.test.cjs scripts/daycare-receipts-service.test.cjs scripts/daycare-receipts-ledger-qa.test.cjs scripts/daycare-receipts-independent-qa.test.cjs
~~~

Working directory: backend.

Additional independent runtime-role reproduction/check script: ignored backend/tmp/daycare-receipts-security-final.cjs. Its final run passed tenant application, missing-administrator evidence preservation, control read denials, control SaaS trigger/collision handling, and distinct modern CBE preflight checks. Its transport throws locally rather than contacting a bank.

Independent QA then reported **23/23** passing on its strict serial receipt/bank/ledger rerun, including the new regressions.

The configured application database, real financial data, live bank services and email were not used as mutation or delivery targets. Separate QA owns broader regressions and browser acceptance.
