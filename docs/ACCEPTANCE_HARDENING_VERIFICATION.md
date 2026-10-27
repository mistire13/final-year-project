# Acceptance and hardening follow-up

Completed: 23 October 2026 (Africa/Addis_Ababa).

This pass continues the two-phase implementation with production-build acceptance, honest pickup status, request-failure handling and initial-load performance.

## Changes

- Replaced the decorative QR pickup pass, locally generated pass code and unconditional “Valid Today” badge with server-backed guardian approval and the last recorded attendance event. Missing guardians never default to authorized. Selecting an unapproved adult shows “Approval pending.” A checkout event is not treated as proof that the currently selected adult performed pickup.
- Removed hardcoded fallback child IDs from child profile, report detail/archive, attendance, health and pickup screens. Accounts without a linked child receive explicit enrollment guidance. The home screen no longer fabricates a child's attendance summary for those accounts.
- Added a shared asynchronous-resource hook that rejects responses from superseded requests, clears earlier records during loading, and ignores completions after unmount. Applied it to child profile, report details/archive, orders, calendar/event details, attendance, health and pickup records.
- Failed order, calendar and archive requests show a visible error and Retry rather than a successful empty list. An unavailable requested report no longer silently opens another report. Event details re-fetch the selected event instead of trusting a passed snapshot or selecting event ID 1.
- Platform refresh now requires successful responses before replacing its snapshot or updating its refresh time. Failures show a persistent notice. Temporary session-check connection failures preserve the stored session; invalid/forbidden sessions still clear it.
- Removed the remaining platform test-password autofill button, connected login labels to inputs, and made the console's home/admin links keyboard-accessible anchors.
- Added viewport scroll containers for HTML staff/platform workspaces, extending the landing-page scroll repair without unlocking the native app body.
- Deferred the parent navigator, staff/admin portal and platform console into separate web bundles. Loading text and a reloadable web error boundary cover deferred-screen failures.
- Missing product stock defaults to unavailable instead of an invented quantity of ten.
- Expanded the disposable acceptance fixture with pending-guardian and unlinked-parent accounts, an optional loopback test port, and a graceful `stop` command. Verified startup and cleanup with exit code 0.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | `npx tsc --noEmit` passed |
| Production web export | Passed, with separate navigator/portal/platform bundles |
| Android JavaScript/Hermes export | Passed; this is packaging validation, not a device run |
| Essentials regression suite | 109 passed, zero failures |
| Administrator production browser | All 16 navigation pages rendered with no page-error notices |
| Caregiver production browser | All 5 navigation pages rendered with no page-error notices |
| Platform-owner production browser | All 7 governance pages rendered with no page-error notices |
| Parent pickup | Approved guardian and pending guardian displayed distinct actual authorization states; no generated pass |
| Unlinked parent | Enrollment guidance; health view explicitly reports no linked child |
| Backend outage | Opening orders with the disposable backend stopped showed a connection error and Retry, with no empty-history claim or forced logout |
| Cleanup | Disposable browser/backend stopped; generated fixture database and test roles removed; regular backend restored on port 5000 with HTTP 200 health |

Page smoke checks verify navigation and rendering, not every form mutation. Browser operations used only synthetic disposable accounts and records. No external delivery providers were invoked.

The first regression run crossed Addis Ababa midnight and exposed a time-dependent fixture: “30 minutes ago” was yesterday while the test expected today's attendance. The fixture now places today's event at the business-day boundary and separately verifies that a previous-day event is excluded. The targeted test and final full suite passed.

## Measured web payload

The previous production HTML referenced 7,880,423 bytes of initial JavaScript. The final HTML references three initial scripts totaling 1,527,139 bytes, approximately **80.6% less initial JavaScript** before compression. The parent navigator still has a roughly 6.2 MB deferred bundle. This is a payload measurement, not a claim about measured load time, frame rate or total download size. Icon optimization and finer parent-route splitting remain useful work.

Expo's supported web async-import splitting is documented in the [SDK 57 Metro reference](https://docs.expo.dev/versions/v57.0.0/config/metro/#bundle-splitting).

## Remaining release work

- Physical Android/iOS journeys, multi-device acceptance, screen-reader testing and reduced-motion checks on devices.
- Payment-provider integration, physical biometric/QR verification, scheduled push notifications and reminder delivery. The current interface describes their availability honestly.
- Full mutation/error/race coverage for every administrative form; this pass does not certify all legacy mutations against stale edits.
- Automated frontend timing tests, measured loading/frame performance and dependency vulnerability remediation with compatibility checks.

Evidence: `docs/screenshots/pickup-approval-pending.png` and `docs/screenshots/orders-network-error.png`.
