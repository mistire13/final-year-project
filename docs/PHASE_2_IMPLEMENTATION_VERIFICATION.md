# Phase 2 implementation and verification

Date: 22 October 2026

## Delivered

- Redesigned the public Ankelba website with a cream/green palette, editorial headings, existing childcare artwork, clear parent/daycare/caregiver entry points, feature explanations, application form and practical FAQs. Removed visible SaaS landing labels.
- Added Motion for React to web shared buttons, cards, page transitions and dialogs. Native shared cards, controls and screen transitions use React Native Animated. System reduced-motion preferences disable movement; entrances run once rather than looping continuously. Existing decorative native motion is preserved.
- Separated parent and staff screens. Caregivers can write assigned-child daily reports and health records, notify linked parents, read announcements/events and exchange messages. Platform owners use the web governance console.
- Added authenticated announcement details with the same audience, expiry and tenant rules as announcement lists. Fixed parent announcement navigation and replaced hardcoded chat recipients with actual daycare contacts.
- Replaced notification shortcuts with a real unread-message/alert inbox. Saved notification choices, event reminder preferences, alert receipts and food preferences in the database. Reminder preferences are saved choices, not scheduled device push notifications.
- Replaced the local-only guardian draft with a message requesting administrator approval. Parents cannot grant their own pickup permissions.
- Saved checkout notes and displayed them on parent receipts and administrator order lists. Removed the offered digital checkout method while its provider is unavailable. Payment information and biometric copy now describe the supported manual process.
- Added order retry identities, payload comparison and consistent product locking. Duplicate concurrent submissions return the existing order instead of creating another order or decrementing stock twice.
- Added edit versions for products, events and center settings; stale saves return HTTP 409. Routed the parent wizard through the existing atomic care-profile endpoint. Older replacement routes return HTTP 428 rather than bypass conflict checks.
- Added visible errors/retry paths for important parent views, no-linked-child states and request guards so delayed dashboard/report responses cannot replace a newly selected child's records.
- Removed default platform-login credentials from the interface.

## Evidence

All database tests used generated disposable databases and separate restricted application roles. The configured application database was not a test write target.

| Check | Result |
| --- | --- |
| Full essentials suite | 108 passed, zero failures before adding one additional migration test |
| Final essential-security test file | 12 passed, including the new migration rollback/reapply test |
| Authentication/security suite | 50 passed, zero failures |
| Frontend TypeScript | `npx tsc --noEmit` passed |
| Production web export | Expo export completed successfully |
| Parent browser | Sign-in; correct parent-only tabs; announcement detail; actual caregiver contact; send message; place pay-at-daycare order; health notification and caregiver reply visible in notification inbox |
| Caregiver browser | Sign-in; assigned-child report saved; health record saved; parent notification recorded; parent message visible/read; reply sent; sign-out |
| Administrator browser | Sign-in and essential child, report, health, event, stock, order and settings pages render |
| Public website | Desktop and 390px responsive inspection; no horizontal overflow at 390px; application dialog labeled and initial focus managed; screenshots in `docs/screenshots` |
| Backend negative/concurrency cases | Wrong daycare, wrong role, unlinked child, audience/expiry restrictions, stale saves, repeated checkout, health-notification retries and preference ownership covered |

The first disposable browser fixture bypassed the normal database module's calendar-date parser, making SQL dates appear one day earlier in administrator tables. The fixture now registers the same date-only parser as the normal application. This was a fixture mismatch, not a database record correction.

## Local database setup

The local `.env` had reverted to template credentials. The corrected user-supplied provisioning credential was restored only in the ignored local file and its connection verified. Migration 025 applied successfully (batch 10, one migration). Independent strong runtime passwords were generated locally, and `npm run db:runtime:setup` verified the restricted tenant/control logins. The regular backend started successfully on port 5000. No PostgreSQL administrator password was reset. No credentials are included in this report.

The disposable PostgreSQL cluster was stopped. Automatic approval review rejected removal of its temporary directory without supplying a further reason; `tmp/phase2-db` remains on disk and should not be committed.

## Remaining acceptance and integrations

- Native Android/iOS device runs, multi-device behavior, screen-reader coverage, reduced-motion device testing and comprehensive offline/network-failure journeys have not been completed. Browser testing is not a substitute for device testing.
- Browser checks cover the listed core journeys; they do not certify every operation on every administrator/platform page. Platform governance and authentication have automated backend coverage; full owner-console browser acceptance remains open.
- Digital payment providers, physical biometric devices and scheduled push/reminder delivery remain integrations to complete. The UI must not report these as operational.
- Optimistic edit protection applies to the named edit endpoints and atomic child profile. This is not a claim that every legacy administrative mutation now supports stale-edit detection.
- Saved preferences are durable settings; delivery channels must consume them when providers are connected. No external SMS, email or push delivery was claimed or used in this acceptance run.
- The production JavaScript bundle is approximately 7.9 MB before compression. Route/icon code splitting and measured load-performance work remain worthwhile before release.
- Runtime installation reported existing dependency vulnerabilities and an Expo Node engine warning on the system Node version. Expo browser testing used the bundled compatible Node 24 runtime; dependency upgrades need their own compatibility review.

The implementation is reviewable locally. Full release acceptance remains open until the remaining device/integration checks pass.
