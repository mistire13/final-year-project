# Package comparison, front-desk shift UI and recovery pages

9 November 2026. Implemented the approved frontend follow-up scope. Prices, receiving accounts, backend finance and parent payment/receipt screens were not changed by this task.

## Package comparison

- Added a detailed comparison matrix beneath the public price-first package cards, with real configured child limits and capability cells derived from server catalogue flags.
- Expanded shared Standard benefits to include child/guardian access, individual front-desk duties, manual invoices/payment records/receipts and basic financial/audit features. Plus copy distinguishes comparative reports/CSV/PDF, scheduled **monthly** invoicing and repeating attendance/pickup shifts.
- Added proper table caption and row/column headers, explicit Included/Not included text and a compact three-column mobile presentation. Color and check icons are supplemental, not the only availability indicators.
- Retained package-first/billing-period-second selection, actual configured prices, genuine savings comparisons and all existing recovery behavior.
- Clarified that email requires configuration/parent consent and existing obligations survive downgrade. Proposed expenses/profit, consumables, learning portfolios, forms and surveys are not advertised. New daycare receipt verification is not advertised before backend integration.

Files: `PricingPage.web.tsx`, `pricing.css`, `subscriptions.ts`.

## Front-desk scheduler reframe

- Reworded the scheduling UI around attendance/check-in and authorized pickup coverage. It now explicitly says caregivers retain their regular classroom assignments.
- Renamed the classroom selector to **Children covered by this duty**, with an all-classroom front-desk option. This retains the backend duty-scope contract; it does not move children or rewrite caregiver classroom assignments.
- Updated template, review, calendar-detail and substitute copy for front-desk coverage. Weekly scheduling, role-filtered records, preview/review, leave and substitution checks remain intact.
- Navigation labels in shared `Portal.web.tsx` remain with the primary integration owner; requested labels are **Front-desk shifts · Plus** and **My front-desk shifts · Plus**.

Files: `PlusStaffScheduling.web.tsx`, `StaffWeekCalendar.web.tsx`.

## Branded recovery pages

- Added `SurfaceRecovery.web.tsx` with `kind` values `not-found`, `forbidden`, `session-expired`, `subscription-ended`, `payment-unavailable` and `unavailable`. Props also support safe application-owned `message`, `onRetry`, `workspaceHref` and `embedded` rendering.
- Reused portal Card/Button/Icon primitives and brand variables. Pages have role-appropriate workspace destinations and visible keyboard focus. A context-free session-expired route offers parent/staff/platform sign-in choices rather than silently choosing the wrong account surface.
- Recovery pages never read/write token storage, clear a payment session or initiate a transfer. Default Retry reloads the same address, preserving its query/hash and saved recovery details; callers can supply their own status retry callback.
- `SurfaceBoundary` now renders the branded unavailable page after a rendering error.
- `PortalGate` now returns a real branded not-found surface for unknown public paths and unsupported nested operator/caregiver/parent paths instead of silently rendering landing/home. It supports `/404`, `/403`, `/session-expired`, `/subscription-ended` and `/payment-unavailable` (plus named404/403 aliases), including trailing slashes.
- Legacy `subscription_resume` links are still routed to the pricing recovery flow before unknown-path classification. Production-only forbidden preview handling is branded too.
- Unknown admin/staff page and authenticated-role forbidden panels inside `Portal.web.tsx` remain the primary integration owner's responsibility through the exported component contract. Recovery is UI behavior; the SPA's static hosting must separately configure actual HTTP404 responses if required.

Files: `PortalGate.web.tsx`, `SurfaceBoundary.web.tsx`, new `SurfaceRecovery.web.tsx` and `surface-recovery.css`.

## Validation

- Full frontend suite after the main changes: **77/77 passed**, zero failures/skips. Log: `tmp/frontend-comparison-recovery-tests.log`.
- Focused pricing/front-desk/recovery tests: **13/13 passed**.
- Final context-free sign-in chooser follow-up: recovery suite **2/2 passed**.
- TypeScript `--noEmit` passed after the main changes; the final chooser uses the same typed component contract.
- Scoped diff whitespace check passed (existing Windows LF/CRLF warnings only).

The initial new matrix test exposed the mock renderer stringifying React's false conditional children; its text helper was corrected to match React semantics rather than weakening comparison assertions. Tests now verify real catalogue flags/capacity, unavailable capabilities, manual-versus-Plus distinctions, absence of proposed features, table headers, classroom-assignment separation, role-specific sign-in, unchanged payment address/session storage and recovery-link precedence.

No live payment, email, account configuration or database change was made. Browser/device visual acceptance remains with the primary integration walkthrough; physical-device behavior is not claimed by these component tests.
