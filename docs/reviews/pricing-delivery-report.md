# Public pricing journey delivery — 8 November 2026

## Delivered behavior

Homepage registration actions and the footer lead to `/pricing`, which uses the landing-page brand, animated clouds and illustrations. Standard and Premium appear first as complete package comparison cards. Choosing a package reveals Monthly, 6 months and Annual as three detailed comparison cards with explicit Continue actions. Period cards have no radio inputs, radio roles or toggle behavior. Payment and daycare application continue inline on the branded page.

Displayed totals and availability come from the operator-managed catalog. Missing or invalid prices cannot start checkout. A crossed-out comparison total and savings appear only when a longer period costs less than the configured monthly price over the same duration; the card labels this comparison. No artificial original prices or discount percentages were added.

Payment recovery, accepted terms, paid-email binding, reference verification and pending-review handling remain intact. Review fixes preserve a recovery token through initial connection failures, prevent changing plans during intent creation, reset old recovery on an explicit restart, preserve the mounted form during pending submission navigation, and focus the success heading after submission. Synchronous guards prevent duplicate payment and application requests.

## Team reports

- Design implementation: [pricing-design-report.md](pricing-design-report.md).
- Independent source review: [pricing-review-report.md](pricing-review-report.md). All five integrated-review findings are fixed and rechecked in source.
- QA: [pricing-qa-report.md](pricing-qa-report.md). All 28 focused component, navigation and recovery regressions pass; final TypeScript check passes.

## Final validation

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- Production export with bundled Node 24: `node node_modules/expo/bin/cli export --platform web --output-dir .expo/pricing-review-export` passed after the final navigation/focus fixes. The build output stays in the ignored `.expo` directory.
- Browser: inspected the hero, package comparison and period comparison at desktop and narrow widths, including 390px and 320px. Cards stack without horizontal overflow; the selected-package summary remains below the sticky navigation after transitions.
- Browser: homepage Register opens `/pricing`; the pricing journey has zero dialogs and zero radio controls. The animation pause control sets `data-playing=false`.
- Browser viewport overrides were reset. Preview remains available from the local development server on port 8083. A desktop hero screenshot is saved at `frontend/.expo/pricing-hero-review.jpg`.
- `git diff --check` passed. No backend payment, package-price or receiving-account settings were changed for this redesign.

## Limits and setup

The local public catalog currently has no configured period prices, so browser inspection verifies the unavailable state. Numeric prices, genuine savings, payment creation, recovery and application behavior are covered by isolated API-mocked regression tests. Live payment-provider, email delivery and OCR integrations were not exercised for this UI change. The super administrator must configure package fees and receiving details before customers can pay. Production hosting must serve the SPA entry for direct `/pricing` navigation, as for the existing public and portal routes.
