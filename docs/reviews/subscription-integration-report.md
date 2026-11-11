# Subscription recovery and operator integration report

Date: 7 November 2026.

## Implemented

- Added a super administrator action for a daycare that is more than one billing period overdue. The form requires a reason and explicit confirmation that the daycare agreed to restart its billing period. It calls the operator-only renewal-restart endpoint with the reviewed subscription version.
- The interface states that authorization permits payment but does not restore access. It shows the authorization's expiry, and a new period starts only after a matching payment is verified. Errors and stale changes remain visible for review.
- Confirmed the production portal route gate synchronizes the current URL after installing its navigation listener. This catches a renewal recovery link dispatched by the landing page before the listener mounts.
- Added focused frontend checks for the explicit restart agreement, request payload, and recovery-link navigation ordering.

## Verification

- `cd frontend && npx tsc --noEmit`: passed.
- `cd frontend && node --test scripts/subscription-recovery-navigation.test.cjs scripts/subscription-restart-ui.test.cjs scripts/subscription-recovery.test.cjs scripts/subscription-payment.test.cjs`: 8 passed.
- Read `frontend/AGENTS.md`, the Ankelba UI styling skill and the requested Expo SDK 57 reference before modifying the frontend. Existing portal styling and operator session boundaries are retained.

## Limits

- The frontend checks use a simulated component environment and API calls. They do not prove the emailed recovery journey in a real browser or payment verification against a live Veritas account.
- No live database was altered during this integration work. SMTP delivery and provider receipt verification require separately configured services and authorized test data.
