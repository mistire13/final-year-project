# Package comparison follow-up review

9 November 2026. Read-only product-code review requested for the four-person team discussion. Product files, prices and receiving-account settings were not changed. This review does not re-run tests or establish provider availability.

## Current implementation

- `frontend/src/landing/PricingPage.web.tsx:162` renders two public price cards. Each card calls `packageBenefits()` at line169; a differences FAQ is at line178. There is no row-by-row comparison matrix.
- `frontend/src/portal/subscriptions.ts:7` defines five shared care/communication/classroom/event bullets. `plusFeatureLabels` at line9 adds four Plus capability summaries only when the catalogue flags are true.
- `frontend/src/portal/PackageCards.web.tsx:10` uses the same shared benefit labels, but the repository search found no current consumer importing this component. The public `PricingPage` is therefore the main comparison surface; do not modify only the unused component and assume the customer page changed.
- Server policy in `backend/src/modules/saas/package-features.js` enables shop, business analytics, billing automation and staff scheduling for effective Plus terms, with expiry and accepted-feature checks. Legacy paid Standard shop access is a bounded paid-promise exception, not a new Standard shop entitlement.

## Findings

### 1. Customers cannot directly compare equivalent capabilities

The included-only lists omit explicit distinctions between manual and scheduled invoicing, basic and comparative reports, or individual and recurring duties. Shared bullets also omit implemented manual invoices/payment records/receipts, basic financial overview and explicit child/guardian profiles. This makes Standard look smaller than its actual implemented scope.

Recommended change: retain the prominent configured monthly price cards, then add a detailed Standard/Plus matrix beneath them on the package-selection stage. Use the same canonical comparison data for public and portal surfaces so labels and flags cannot drift. The full matrix should remain reachable before choosing a billing period.

### 2. Scheduler labels still describe general staff scheduling

The shared label says “Recurring staff schedules and leave management”; the public FAQ says “advanced staff scheduling.” The existing scheduler publishes front-desk duty records, but its UI still includes classroom/date/template language. The user's proposed focus is rotating attendance/check-in and pickup coverage while classroom assignments remain stable.

Suggested comparison label: **Repeating attendance and pickup duty schedules**. Describe the actual weekly calendar, conflicts, leave and substitutes. Keep the UI-specific refocus as an implementation item rather than implying the rename/reorganization is already complete.

### 3. Reminder/online-payment expectations need a short qualification

“Scheduled invoices and payment reminders” is implemented, including in-app jobs and email consent. External email delivery is configuration-dependent and currently disabled in the local delivery. A public claim must not imply automatically enabled email/SMS or automatic bank debits.

Current shop settlement is administrator-recorded cash, with full independently completed cash-return evidence. `payments.service.js` still returns `online_enabled:false`. Veritas subscription verification is separate from online shop collection. Do not list automated receipt verification for daycare shop/weekly/daily fees as already delivered; this is the user's new proposal for discussion.

Suggested notes: “Email reminders require configuration and parent consent.” “Shop payments currently use cash recorded by the daycare.” “You initiate subscription payments; Ankelba does not debit your account automatically.”

### 4. Capacity must be displayed from configuration

The cards correctly use `offer.max_children`. The FAQ's “higher child capacity” is unconditional even though the operator can configure capacities. Use actual configured values in the matrix; avoid hardcoding50/150 or stating Plus is always higher unless validated by configuration.

Monthly/six-month/annual prices are already taken from catalogue configuration. Current development values were deliberately preserved; price presence is not evidence that they are launch-ready. Do not silently replace the observed1ETB Plus monthly value.

### 5. Proposed features must remain outside the included matrix

Expenses/profit, internal consumables, learning portfolios, custom forms and surveys were discussed as ideas. They are not implemented package entitlements and must not appear as included. Admissions/waitlists were explicitly excluded.

## Suggested customer comparison content

| Capability | Standard | Plus |
| --- | --- | --- |
| Child and guardian profiles; classroom/caregiver assignments | Included | Included |
| Attendance, authorized pickup and individual front-desk duties | Included | Included |
| Daily reports and health/incident records | Included | Included |
| Parent messaging, announcements, events and calendar | Included | Included |
| Manual care-fee invoices, payment records and receipts | Included | Included |
| Basic operational/financial overview and audit history | Included | Included |
| Active child limit | Configured Standard limit | Configured Plus limit |
| Shop catalogue, categories, stock and new orders | Unavailable | Included when shop flag is true |
| Shop cash collection/return evidence and inventory history for new sales | Historical obligations only | Included when shop flag is true |
| Comparative business reports, week/month grouping and management CSV/PDF | Unavailable | Included when business analytics flag is true |
| Scheduled monthly care-fee invoices and payment reminders | Manual workflow | Included when billing automation flag is true |
| Repeating attendance/pickup duty calendar, leave and substitutes | Individual duties | Included when staff scheduling flag is true |

Footnotes should explain:

- The super admin configures each package's prices and capacity.
- Features are identical across monthly, six-month and annual periods within a package.
- Existing invoices, orders, receipts and valid resolution obligations remain available after a downgrade; this does not allow new Standard shop sales.
- Email delivery and supported receiving methods require configuration. Cash-return records do not transfer funds.
- Initial subscription periods begin on approval; renewals are initiated by the customer and accepted next-period package changes preserve current paid access until their boundary.

## Suggested layout and acceptance

Use the existing cream/navy/Quicksand pricing style, retaining the price-first cards. Add a clearly titled comparison table with true row/column headers, visible Included/Unavailable text alongside icons and a keyboard-focusable horizontal wrapper if required on small screens. A mobile comparison must retain both package labels rather than relying on color or bare ticks. Display feature availability from server catalogue flags, not hardcoded assumptions about the package name.

Acceptance checks should verify the real pricing route (not only the currently unused PackageCards component), configured prices/capacities, unavailable flags, all three periods, no advertised proposed features, keyboard/screen-reader table labels and mobile readability. Compare the new copy with effective backend access tests and the approved expiry policy before publishing it.
