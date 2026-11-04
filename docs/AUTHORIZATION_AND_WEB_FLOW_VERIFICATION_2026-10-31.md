# API authorization and parent/caregiver browser verification

31 October 2026, Africa/Addis_Ababa.

## Scope and result

Tested the running web experience at `/app` for parents and `/staff` for caregivers, as requested. Current routing sends caregiver web sign-in to the staff workspace; this is not a claim that the separate native caregiver screens or Android/iOS binaries were exercised. No administrator UI acceptance was performed in this pass. Administrative API permissions and setup were exercised with synthetic fixtures.

The listed browser journeys passed after repairs. The active legacy API exposed **176 mounted method/path combinations**, including aliases. **707 automated missing-session, malformed-session and explicitly forbidden-role checks passed**, along with server-side logout revocation and a new valid login afterward. The exact inventory and public exceptions are in [ENDPOINT_AUTHORIZATION_MATRIX_2026-10-31.json](ENDPOINT_AUTHORIZATION_MATRIX_2026-10-31.json).

This establishes the listed checks, not a proof that every possible input, race, role/record combination, provider or device works. Resource ownership and two-daycare isolation received additional regression coverage. Feature-flagged preview authentication was tested separately; the endpoint inventory describes the active legacy runtime.

## Parent browser journeys

| Journey | Observed result |
| --- | --- |
| Sign-in validation and account session | Empty sign-in showed an email validation message. Synthetic parent sign-in and browser reload restored the correct account. |
| Home and linked child | Correct child/classroom and factual attendance/report states. After caregiver pickup, home showed checked out and the recorded collection time. |
| Current report and full detail | Caregiver-created breakfast, 45-minute rest, play activity, mood and observation appeared in the parent's report/detail and home highlights. |
| Report archive | Saved daily report appeared in the archive with its actual caregiver/date/rest details. |
| Parent-to-caregiver messaging | Parent question saved; caregiver could read it and reply. Parent notification/chat displayed the incident notification and caregiver conversation. |
| Health/incident notice | Saved synthetic incident, severity, actual staff/date and notified state appeared on the parent's health screen. |
| Store/cart/order | Product added; quantity increased to two; server-priced total 200 ETB; pay-at-daycare order confirmed once; cart cleared; history/receipt retained items and the order note. No money moved. |
| Care fees | A synthetic invoice showed 100 ETB outstanding and the correct child/due date. Loading/error states no longer claim that bills are settled. No real payment was recorded. |
| Guardian authorization | Existing approved and unapproved guardians were distinct. Parent submitted a new pickup-contact request; success explicitly said approval was pending, and Guardians showed Pending. No pickup permission or new app account was granted. |
| Pickup/attendance status | Parent saw recorded checkout and the actual attendance history. Guardian approval was distinguished from evidence of who performed pickup. |
| Contact/profile preferences | Synthetic name/phone/cuisine saved; account display refreshed. Notification preference remained checked after browser reload. |
| Child care editor | All five steps completed; retained emergency contact, saved dietary/general care notes, returned to home; caregiver child profile displayed those notes. Pickup approval is now read-only and comes from the daycare record. |
| Calendar/event/reminder | Calendar and event detail loaded. Save reminder changed to Saved/Turn Off. This is a persisted reminder preference, not scheduled push delivery. |
| AI guide | Initial provider wait exceeded the client timeout and failed. After repair, an unavailable provider returned prepared activity guidance within the client timeout. Medical/dosage prompt produced a safety redirect. Header described the observed provider/fallback state accurately. |
| Help/support | Guidance rendered; Open daycare contacts routed to the actual message contacts. |
| Backend outage | Opening order history while the isolated backend was stopped showed a connection error and Retry, without presenting empty history or forcing logout. |
| Invalidated session | Retry against a replacement fixture rejected the old session and returned to sign-in. |
| Sign-out and unlinked account | Parent sign-out returned to the welcome screen. Signing in as an unlinked synthetic parent showed enrollment guidance and no previous family's child. |

## Caregiver browser journeys

| Journey | Observed result |
| --- | --- |
| Sign-in and role routing | Caregiver opened its own `/staff` workspace with assigned child and staff navigation. Parent session in another tab remained separate. |
| Reporting | Saved a daily report with breakfast, play, rest, mood and notes; report history/detail showed the saved data; parent saw the same report. |
| Incident/notification | Saved a synthetic incident and notified linked parents in-app; parent saw it. Notifications to multiple linked guardians are distinct records. |
| Messages | Received parent question, marked it read and sent a reply. After repair, entering Communication fetches current messages; Refresh updates message/history state; participant names make conversation direction clear. |
| Announcements/calendar | Daycare announcement and upcoming event rendered. |
| Arrival | The initial Check in button incorrectly opened an attendance-history dialog. Repaired form submitted a check-in and table changed to At daycare. |
| Pickup duty | Without pickup duty, Verify pickup was absent. After synthetic administrator setup assigned an active pickup duty, it appeared. |
| Manual approved pickup | Dialog started with no adult selected and identity confirmation unchecked. Selected approved parent, explicitly confirmed identity and entered verification notes. Checkout succeeded, table showed the actual collecting parent, and another pickup action was absent. |
| Child safety/profile/history | Contact details, guardian status, actual attendance history and saved care notes rendered. Corrected dietary-note omission and removed fallback that displayed one parent's phone for another guardian. |
| Sign-out | Returned to staff sign-in. |

## Repairs and hardening

- Every explicit role middleware now exposes immutable policy metadata for automated route-coverage tests; the server still enforces permissions normally.
- Closed unversioned order-status updates at validation and service layers. Stale editors cannot silently bypass the reviewed order version.
- Fixed the missing caregiver check-in/absence/pickup forms and stale caregiver communication/history state.
- Removed the platform authentication role's direct financial-table access and added financial tables to startup privacy checks. Migration **042_private_financial_records.js** applied locally, batch 26. Composite foreign keys constrain new/updated invoice-child, invoice-parent, payment-invoice and payment-actor tenant relationships. Existing historical rows were not rewritten or fully validated by those NOT VALID constraints.
- Invoice creation requires any selected parent to be linked to that child, preventing an unrelated parent from receiving another child's invoice. Financial mutation endpoints now validate input bodies.
- Legacy logout now invalidates previously issued sessions **for that account**, including other devices; it is not limited to clearing a browser cookie. A fresh login remains possible. Password reset/change require at least 12 characters; existing credentials remain usable for login.
- The historical migration's shared demo operator credential is explicitly rejected at login. If that account still exists with the demo password, it needs secure recovery/provisioning before use; no password was changed automatically.
- AI provider context now honors saved consent and excludes saved child/classroom names. Free-text questions are still sent when the parent uses the provider. External provider wait has a shared eight-second budget before prepared fallback, below the app's 15-second request timeout. A deterministic timeout test covers this behavior.
- Parent care editing no longer offers an apparent self-approval pickup toggle. It shows the server-recorded approval status.
- Corrected billing loading/error claims, profile display refresh, consent's initial unchecked state, caregiver dietary-note display and guardian phone attribution.
- Fixed the six TypeScript errors previously reported: ScrollView instance refs and the account role union.
- Kept lifecycle operations compatible with older migration-based authorization fixtures; updated the child-isolation fixture's current API fields without skipping its pre-RLS upgrade checks.

## Validation

| Check | Result |
| --- | --- |
| Essential security/reliability suite | 119 passed after repairs |
| Authentication/security suite | 50 passed |
| Mounted endpoint authentication/role matrix | 176 endpoints/aliases; 707 denial checks passed; logout/re-login checks passed |
| Focused daycare deletion, invoice privacy and AI privacy/fallback regressions | Passed |
| TypeScript | `npx tsc --noEmit` passed |
| Production web export | Passed; `tmp/flow-acceptance-web-20261031` |
| Browser flows | Listed parent and caregiver flows exercised with generated synthetic accounts/database and restricted tenant/control runtime logins |

An interrupted final combined run encountered a local `fetch failed` after an unusually long execution pause. The endpoint matrix was rerun independently with bounded request timeouts and passed all 707 checks. Earlier baseline failures were investigated and repaired; they were not counted as passes.

## Environment and limits

Both disposable UI databases and their temporary logins were removed, including the interrupted fixture. The regular backend was restored on port 5000; the existing frontend remains on port 8081. No real daycare/family messages, orders, invoices, passwords or attendance records were modified for UI testing. The schema migration restricts access and adds relationship constraints without deleting records.

Actual biometric hardware, live digital payments, external mail/SMS/push delivery, scheduled reminders, physical Android/iOS behavior, exhaustive accessibility/responsive coverage and every possible concurrency case are not certified. Successful password-change/reset lifecycle is covered by backend tests; the browser run did not change an account password. Platform subscriptions remain intentionally removed from scope.

Evidence: [parent home](screenshots/parent-flow-home-20261031.png), [caregiver care review](screenshots/caregiver-care-review-20261031.png).
