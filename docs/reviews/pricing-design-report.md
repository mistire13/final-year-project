# Pricing page implementation report

## Scope

- Added `frontend/src/landing/PricingPage.web.tsx` and its scoped `pricing.css` stylesheet.
- Followed the Ankelba UI styling skill, existing public home-page design and Expo 57 versioned reference required by `frontend/AGENTS.md`.
- Reused the landing-page typography, cream/navy/green palette, pill navigation and `HeroAtmosphere` clouds, sun, kite, rainbow and motion controls. Decorative artwork on the package cards uses existing brand tokens and icons.

## Resulting journey

1. The first view compares Standard and Premium in full package cards, showing the configured capacity and complete care features. There are no billing-period controls at this point.
2. Choosing a package reveals three full comparison cards: Monthly, 6 months and Annual. Each has a distinct illustration, period total, period details and explicit Continue action. These cards are normal articles, without radio inputs, radio roles or toggle selection behavior.
3. The parent supplies checkout and the accepted offer/period snapshot. Payment, application and submission stages stay inline on the same branded page. The optional change-plan action can be omitted once a payment intent exists.

## Price integrity

- Catalog prices and capacities come from the existing public packages API. Missing, invalid and nonpositive prices cannot proceed to checkout.
- No amount or discount is invented. The exact configured payable amount remains the prominent total, with an explicit total-period caption.
- For a longer period genuinely cheaper than the configured monthly price multiplied by its duration, the card shows that comparison total with a strikethrough and an accurately rounded-down saving percentage. The explanation reads “Compared with monthly billing.” Monthly pricing has no fabricated discount.
- The parent checkout summary receives accepted payment terms, rather than replacing a recovered payment’s snapshot with the current catalog.

## Accessibility and responsive behavior

- Includes a skip link, semantic card headings, registration progress with `aria-current`, visible keyboard focus and focus/scroll management on stage changes.
- Motion honors reduced-motion preferences. Reused atmosphere controls support pause, tab visibility and offscreen pause.
- Package and period grids stack into complete cards on smaller screens. Payment/application fields use full-width touch targets and the application form becomes one column.
- Loading, empty catalog and API failure states provide clear feedback and an explicit retry action.
- Checkout input, verification, recipient, error, application and success styles are scoped to the pricing page and reuse existing tokens.

## Validation

- `node node_modules/typescript/bin/tsc --noEmit` — passed.
- `npx tsc --noEmit` — passed.
- Parent browser inspection confirmed the desktop hero and period-card presentation. Adjusted stage scrolling to preserve the selected-package summary and change-package action below the sticky navigation.
- The independent QA agent owns behavioral checks; the parent owns route wiring, payment/session logic, application submission and final browser inspection.
