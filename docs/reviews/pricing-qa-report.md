# Pricing page QA report

Verified the package-first journey: homepage registration opens `/pricing`, the customer chooses Standard or Premium, then chooses a billing period from three comparison cards, and continues to payment and the application form. Payment confirmation remains a prerequisite for submitting an application.

## Results

- Package choice precedes three detailed monthly, six-month and annual comparison cards. The period chooser has no radio inputs or radio-group behavior. The selected offer and period reach payment creation unchanged.
- Configured totals appear on the cards. Unconfigured, zero, negative, invalid and unavailable prices have disabled checkout actions. Savings and struck-through comparisons appear only when the configured multi-month total is below the monthly billing baseline; an undiscounted package has no invented promotion.
- Catalog load failure offers a working retry. Checkout does not refresh the catalog over payment-bound terms.
- Pending verification cannot advance to the application. A confirmed payment retains its token, email, package, cycle and terms version. Concurrent creation, verification and status refresh actions are blocked before React rerenders.
- Standalone application submission preserves input and verified payment on server/network failure, ignores duplicate submissions, disables the fieldset while submitting, and sends the confirmed payment binding. While submitting, navigation links and portal route events are blocked and a before-unload guard is installed; guards are removed on completion. An integration test runs the actual portal route handler with the application guard, confirms the route and full URL remain on pricing while pending, and confirms navigation succeeds after submission settles. Success clears payment recovery and links to application status.
- Homepage registration actions navigate to `/pricing`, preserve a footer-provided daycare name, and render no registration dialog. The public pricing route and legacy payment email links mount the pricing journey. Recovery scrubs URL secrets and keeps renewal recovery in the subscription portal.
- Payment recovery preserves the plan-change lock while loading and offers retry after a temporary error. Scrubbed email recovery credentials are retained before loading, so a reload can retry with the rotated token. A successful explicit restart releases the old payment binding and clears its resume credentials before a new package is chosen; stale restart cannot discard a payment confirmed by the server.
- A delayed payment creation reports its busy state through the checkout to the pricing wrapper, which hides the change-plan action until the request finishes.
- Application-to-success transition focuses the updated checkout heading and scrolls the content section into view.

28 focused component/navigation regression tests passed on 2026-11-08:

```powershell
node --test scripts/pricing-page.test.cjs scripts/pricing-navigation.test.cjs scripts/pricing-journey.test.cjs scripts/subscription-payment.test.cjs scripts/registration-lifecycle.test.cjs scripts/subscription-recovery-navigation.test.cjs scripts/subscription-recovery.test.cjs scripts/subscription-restart-ui.test.cjs
```

The frontend TypeScript check also passed (`npx tsc --noEmit`).

## Findings fixed during QA

An initial `onSession(null)` callback could expose the change-plan action while a saved payment was still being restored. The payment component now reports non-null recovered sessions and reports null only after an explicit successful restart. A regression reproducing the original failure now passes, alongside a failed-recovery retry test.

Integration review also identified that a restarted restored payment could retain old resume credentials, and that a slow create request could allow changing plans. Regression checks cover cleared resume credentials and busy-state propagation through all three components. Recovery-token persistence and temporary application navigation guards are also exercised.

## Scope and limitations

Tests transpile the actual components, exercise their callbacks/state with a small hook harness, and use mocked APIs and synthetic credentials. They do not use a production database or prove live provider verification, bank reference uniqueness, actual browser layout, focus, animation or responsive behavior. Visual browser verification belongs to the integration pass. No backend payment behavior was changed by this frontend QA work.
