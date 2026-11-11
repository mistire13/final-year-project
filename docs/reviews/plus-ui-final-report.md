# Plus UI completion review

Date: 2026-11-09

## Delivered

- Added a parent billing reminder preference card to Care Fees & Receipts using the native Ankelba System primitives, color tokens, and authenticated `apiClient`.
- The card reads the saved preference before exposing its switch. It never opts the parent in automatically. The parent explicitly saves changes; loading, saving, retry, success, and failure states are visible. Failed saves retain the pending choice for retry. The switch is disabled during saving and overlapping requests are blocked.
- Added `GET /api/billing-automation/my-reminders/preferences`. Both preference reads and updates require the authenticated active parent account and matching daycare. Neither accepts a user or daycare identifier from the request body. Updates retain unrelated notification preferences.
- The copy explains that email reminders also require daycare enablement. Recording consent does not send an email.

## Pricing and shop review

Read-only code review of `PricingPage.web.tsx`, subscription benefit labels, `ShopAccess`, the mobile tab navigator, Profile, and Order History:

- Package cards show the configured monthly price and capacity. Billing-period cards show the configured total and monthly equivalent. Savings are calculated against actual monthly pricing.
- Standard retains core care, pickup, health, communication, classrooms, events, and audit history. Plus displays catalog-enabled shop, analytics, billing automation, and staff scheduling benefits.
- The package selection precedes billing-period comparison cards. Journey progress and focus transfer support the flow. The page uses the shared public navigation and atmospheric hero components.
- Native Shop, cart, and checkout screens are guarded; Shop navigation is hidden without the feature. Failed feature discovery exposes a retry state in guarded screens. Order History remains available after a downgrade.
- Minor copy issue communicated to the integration owner: the empty Order History description still invites browsing supplies when Shop is unavailable, although its Visit Store button is correctly hidden.

This was a code and component-behavior review. No visual browser/device pass was performed by this agent.

## Validation

- Frontend TypeScript: `tsc --noEmit` passed.
- Frontend Plus suites: 7 tests passed across analytics, billing settings, parent preference, and staff scheduling tests.
- New backend preference unit suite: 1 test passed, covering authenticated account/daycare isolation, active parent role, invalid input, explicit opt-out, and preserving unrelated preferences. This uses a mock pool; persisted SQL coverage remains with the backend QA agent.
- The frontend preference tests exercise actual component handlers with mocked API responses: saved opt-in, explicit opt-out, duplicate-save prevention, save failure/retry, load failure/retry, and no consent write on mount.

No real emails/messages, payments, or live migrations were triggered. Admissions and waitlists are excluded from this implementation.
