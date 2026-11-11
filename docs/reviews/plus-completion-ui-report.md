# Plus completion: calendar and analytics

Date: 2026-11-09

## Delivered behavior

### Staff calendar

- Replaced the dated-duty table with a Monday–Sunday weekly calendar, previous/next/current-week controls, and a date jump. Requests still use the existing role-filtered staff scheduling endpoint; the UI does not supply or infer a caregiver permission scope.
- Each day shows dated duties, caregiver, local times, and status. Keyboard-operable disclosure elements reveal classroom, full timestamps, and attendance/pickup responsibilities. Overnight shifts appear on each overlapping Addis Ababa date, with an exclusive end boundary at midnight.
- Below 800px, the same ordered day sections form an agenda. Larger screens use a seven-column layout, with an intermediate wrapping layout. Focus outlines, labeled controls, status announcements, minimum control heights, and existing portal primitives/colors are retained.
- Week changes keep navigation mounted, announce loading, hide the prior week's duties, and disable actions until the server responds. Request cleanup prevents an earlier week response replacing a later selection. Failed reads expose the existing retry path. Publication review, conflicts, leave, availability, and substitution controls remain intact.

### Analytics

- Added Today, This week to date, Last week, This month to date, and Last month presets, resolved from the current Addis Ababa calendar day.
- Added the optional API query `attendance_grouping=day|week|month`, defaulting to `day`. The response adds `filters.attendance_grouping` and `current.attendance.grouped` / `previous.attendance.grouped` rows. Existing daily data, classroom data, totals, and comparison fields remain available.
- Grouped rows contain `from`, `to`, `present`, `absent`, `recorded_child_days`, and `present_percent`. Weeks start Monday; months follow calendar boundaries. Edge groups are clipped to the report's actual period. Groups sum deduplicated recorded child-days from the existing Addis-aware attendance query; no missing record becomes an inferred absence.
- The chart, selected/previous attendance tables, CSV, and printable report use the selected grouping. CSV download follows the displayed server report's filters, rather than unsaved form edits. Printable data remains HTML-escaped and CSV formula escaping remains in place.

### Refund accounting coordinated with integration owner

- Added `shop.gross_collected` and `shop.refunds`. Existing `shop.collected` now represents net collections: original verified non-demo payment events minus recorded cash returns.
- Original gross collections retain the original payment date after a full refund, including the now-cancelled/refunded order. Cash returns use the ledger's attested `refunded_at` in Addis Ababa date boundaries, separately from audit `recorded_at`.
- UI, CSV, and print display gross collections, recorded cash returns, and net collections, explicitly explaining that the app does not transfer money. Best-seller queries exclude fully refunded orders.
- Corrected negative sub-birr formatting (`-0.25 ETB`) so refund-only periods preserve their sign.

## Files

- `frontend/src/portal/PlusStaffScheduling.web.tsx`
- `frontend/src/portal/StaffWeekCalendar.web.tsx`
- `frontend/src/portal/plus-staff-calendar.css`
- `frontend/src/portal/PlusAnalytics.web.tsx`
- `frontend/src/portal/plus-analytics.css`
- `backend/src/modules/analytics/plus-analytics.service.js`
- `frontend/scripts/plus-staff-scheduling-ui.test.cjs`
- `frontend/scripts/plus-analytics.test.cjs`
- `backend/scripts/plus-analytics.test.cjs`

## Validation

- Focused frontend calendar/analytics suites: **6 passed** after final changes. Covers administrator publication review, caregiver leave scope, week navigation requests, Monday/Sunday ordering, overnight/midnight boundaries, presets across year/month/leap-day boundaries, grouping requests, displayed-report CSV filters, printable escaping, and negative/large currency values.
- All Plus frontend component suites: **9 passed** in the broader run, including billing schedule review and parent email preference behavior.
- Persisted backend analytics suite on a disposable latest-schema PostgreSQL database: **3 passed**. Covers existing tenant/RLS/role isolation and monetary reconciliation, grouping sums, clipped weeks/calendar months, and a later cash return that retains original gross revenue while producing a negative net collection in the later period. It also confirms the original payment remains paid and the fully refunded order leaves best sellers.
- Frontend `tsc --noEmit`: **passed** on the final rerun.
- Scoped `git diff --check`: **passed**.

The first sandboxed database attempt was denied local socket access; the approved escalated disposable-database run passed. No application data, real payment, email, or message was created by this work.

## Limits and integration notes

- The analytics cash-return query depends on migration `055_shop_cash_refunds` supplied by the integration owner. Disposable fixtures used that migration; this agent did not run live migrations.
- No live browser/device visual pass was performed by this agent. The responsive agenda and focus behavior were inspected in code and exercised through component behavior tests; integration acceptance should verify actual layouts and keyboard interaction in the fixture browser.
- Admissions/waitlists, SMS, online refunds, and immediate subscription prorating remain outside this scope.
