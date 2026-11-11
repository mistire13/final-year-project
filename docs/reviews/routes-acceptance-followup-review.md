# Routes and acceptance follow-up review

Read-only review by the primary agent, 9 November 2026. The assigned fourth reviewer encountered a usage limit before delivering; this report records the primary agent's direct source/evidence review, not a completed independent fourth-agent audit. No product code, prices or payment state changed.

## Confirmed findings

- `frontend/src/portal/PortalGate.web.tsx` falls back to the landing page for unknown public paths. Unknown paths under broad `/admin`, `/staff`, `/caregiver`, `/platform` and parent prefixes are not fully validated at this gate.
- `frontend/src/portal/Portal.web.tsx` chooses a default workspace page when the normalized path is unavailable. This hides the difference between an unknown page and a known page forbidden to the current role.
- Backend unknown routes already return HTTP404 JSON. Preserve that API contract; add consistent error codes/request identifiers where useful rather than returning the public HTML404 from API routes.
- Existing surface error boundaries and feature-unavailable states should be reused/styled consistently rather than replaced with a catch-all redirect. An expired subscription, missing feature, missing resource, expired session and provider outage need distinct recovery paths.

## Proposed pages and route policy

1. Branded404 with role-appropriate Home/Workspace/Back links and keyboard focus; validate all public and workspace routes. Known login aliases/recovery links must continue to work.
2.403 for an authenticated user opening a known, disallowed role route. Do not clear unrelated role credentials or pretend the page never existed solely to redirect incorrectly; resource APIs may still use404 to protect foreign-record existence.
3.401/session-expired recovery with sign-in for that surface only, preserving safe drafts and existing payment recovery credentials.
4. Subscription-ended state with current renewal status, next action and preserved critical-care/history access; do not equate a Plus feature restriction with a logged-out account.
5. Payment checking/pending/unavailable/mismatch/confirmed recovery, including safe expired-link guidance and no request to pay again after an uncertain transfer.
6. General error/offline retry using existing boundary primitives and no exposure of stack traces, credentials or raw provider pages. Planned maintenance should be shown only when a real maintenance state exists.

## Acceptance evidence and limits

The prior completion report records158 backend checks,119 core care/security checks,73 frontend checks,29 real-auth API checks and browser walkthroughs of operator/admin/caregiver/parent against a disposable database. Grouped reports, next-period package changes and cash-return records are implemented; they are not missing just because an older checklist is quoted.

Those tests are not a claim of exhaustive page/error/device acceptance. Missing route cases need new focused route tests; native physical-device behavior, preview/MFA authentication, actual bank verification and SMTP remain unvalidated. The release readiness inventory/runbook exists; real prices, deployment secrets, production destination, email setup and offsite backup configuration require the actual operator's configuration choices.

## Proposed implementation priority

Shared comparison data and public matrix → front-desk scheduler presentation → route/error states → explicit subscription/due-date acceptance tests → tenant receiving settings and shared receipt-claim foundation → parent invoice verification → Plus shop verification → daily/weekly billing semantics → controlled integration and release acceptance.
