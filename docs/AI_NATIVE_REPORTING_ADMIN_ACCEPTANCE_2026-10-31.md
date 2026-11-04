# AI reliability, native caregiver reporting and admin acceptance

Completed 31 October 2026. This follow-up covers the daycare administrator workspace, all 17 navigation areas, the separate native caregiver reporting implementation, and the parent AI flow. Platform subscriptions remain intentionally removed.

## Changes and findings

### AI provider

The previously configured NVIDIA vision model appeared in the provider catalog but returned HTTP 404 on completion requests. Catalog presence alone was not a valid health check. A live completion check found `nvidia/nemotron-3.5-lightning-30b-a3b` working. The local ignored environment and example configuration now select that model; credentials were not changed or printed.

The provider adapter now has a shared eight-second request budget, optional distinct fallback model, a concurrency limit of two per server process, invalid-model quarantine, transient failure cooldown, authentication failure cooldown, and bounded Retry-After handling. Empty, malformed, truncated and excessively long responses fall back to prepared guidance. There are no shared family answer caches. Logs contain failure category/model/status, not questions, answers, child context or keys.

An initial live UI answer was too long and suggested small sensory-play materials. The final service adds a stricter play prompt and rejects specific hazardous play materials and answers over 130 words. A subsequent live service check returned a short supervised drawing activity. These checks reduce known failures; they are not a comprehensive AI safety evaluation or a provider uptime guarantee. Consent/minimization and medical redirects remain enforced. Requests completing after a child/account switch can no longer populate the new child's conversation.

### Separate native caregiver screens

Daily report composition now supports multiple meals/snacks with portions, multiple learning/play activities with locations, report date, rest duration and notes, mood, behavior and general observations. Empty entries are omitted, dates and rest values are validated, failed saves retain the draft, changing child clears the draft, and successful saves link to the saved report. Child-selectable history and complete report details replace the previous minimal history. The old duplicate report composer was removed from the health screen.

The native payload was validated against the real API schema, saved into a disposable database, and read back as caregiver, linked parent and admin. Both meals, both activities, locations, rest notes, behavior and duration were preserved. Unlinked parent access and duplicate child/date saves were rejected. Native navigation and session separation were retained.

### Daycare admin fixes

Many existing save handlers had no matching form: their actions opened a generic attendance-history dialog. Added forms for classrooms, duties/revocation, account status, emergency contacts, care instructions, guardian linking/requests/review, events/cancellation, announcements, messages, products, order status and daycare settings.

Acceptance testing also found and fixed:

- Blank child labels in pickup-guardian requests.
- Stale form input submission/date persistence in billing and family enrollment. Forms now use submitted field values and synchronize input events. A child's configured monthly fee still correctly takes precedence over the fallback fee.
- A document field rendered as an unsupported text input. It now accepts an image/PDF through the existing uploader.
- Dietary and medical care notes omitted from overview, child-list and attendance summaries.
- Sleep/behavior notes omitted from admin report details.
- Audit search failing to match displayed action names containing spaces.
- Missing recipient identification in the admin's own message list/details.
- Billing KPI wording suggesting period-filtered totals when the overview is across billing periods.

## Browser acceptance coverage

All actions used synthetic accounts and a disposable database with restricted runtime logins, accessed through the existing web frontend on port 8081. No real family records, credentials, messages, invoices or orders were changed. Caregiver report/incident/message and parent order inputs for admin review were seeded through real authenticated APIs; the admin review and mutations below were exercised in the browser.

| Area | Browser actions and observed result |
| --- | --- |
| Overview | Roster, attendance/pickup state, updated enrollment and dietary alert displayed. |
| Analytics | 14-day range, classroom filter and daily-bar mode update the chart and counts; CSV downloaded and contents inspected. |
| Finances & Fees | Monthly generation, chosen due date, duplicate generation (0 new/2 skipped), period filter, partial cash payment, saved receipt breakdown, transfer-reference required validation, final transfer reconciliation and zero balance/paid status. |
| Children & Families | Standalone child creation; existing-parent link; unified new-family enrollment; individual classroom/caregiver reassignment; profile display; image document attachment and persistence. Required enrollment fields/policy metadata enforced using fictional test data. |
| Emergency contacts/care | Invalid phone rejected; valid contact and dietary instruction saved and shown in child profile. |
| Caregivers & Staff | Caregiver registration, professional profile editing, roster deselection/persistence, deactivate and reactivate. |
| Groups & classrooms | Create/edit classroom, lead caregiver selection, apply assignment to active children, dedicated group assignment save. |
| Front-desk duties | Overlong shift rejected; valid attendance/pickup shift saved; duty revoked and action disabled afterward. |
| Attendance & pickups | Absence saved; check-in saved; pickup list excludes pending guardian; identity checkbox/evidence required; approved manual pickup produces collected status and verification history. |
| Daily reports | Submitted/missing tabs match children; detailed report includes both meals/activities, rest, mood, behavior and observations. |
| Health & incidents | Caregiver incident and notification status visible; detail shows recorded description/severity and parent informed. |
| Guardian verification | Pickup request saved as pending; approved with evidence; permission revoked with reason; final decision/history displayed. |
| Communication | Classroom announcement saved with correct audience; admin message sent/read with sender and recipient shown; parent–caregiver review displays messages and unread-recipient status; corresponding oversight audit entries found. |
| Events & calendar | Create, edit and cancel event; cancelled event shown and editing disabled. |
| Products & stock | Product creation and price/stock persistence; stock/availability editing. |
| Orders & payments | Parent order visible; confirmed → ready for pickup → collected/paid persisted. A second stale browser form receives “Order changed. Reload before saving.” |
| Audit history | Mutation and oversight-read records displayed; pagination works; search by displayed action name works after repair. |
| Center profile & info | Contact phone/address update persisted; success reported. |
| Session/error handling | Sign-out returns to login; direct protected navigation requires login; fresh login works. With backend stopped, refresh shows explicit Network Error and Retry loading, rather than empty successful data. |
| Parent AI web flow | Real provider answer received; medical question redirected. Final stricter response checks also verified through tests and a live service completion. |

## Automated verification

| Check | Result |
| --- | --- |
| Essential backend security/reliability suite | 119 passed. |
| Provider failure/recovery, privacy and native report round-trip tests | 7 passed. Covers invalid model, fallback, rate-limit cooldown/recovery, auth rejection/config reset, malformed/empty/truncated output, deadline/concurrency, consent/minimization, medical redirect, unsafe/overlong output rejection, timeout fallback, report persistence/access/duplicate validation. |
| TypeScript | `npx tsc --noEmit` passed after repairs. |
| Android JS/Hermes export | Passed: `tmp/caregiver-native-report-export`. |
| Production web export | Passed: `tmp/admin-reliability-web-export`. |

Test logs: `tmp/admin-reliability-essentials.log`, `tmp/ai-native-reliability-final.log`, `tmp/admin-reliability-web-export.log`. Reproducible review-input helper: `backend/scripts/prepare-admin-review.cjs` (refuses a normal daycare).

## Scope and remaining validation

The browser acceptance pass covers all current daycare-admin areas and the listed workflows, not every input combination. Platform operator governance is separate; its prior deletion/authorization tests are documented in the earlier verification report. This pass did not rerun every platform-operator console workflow.

Per the requested web testing scope, physical Android/iOS interaction was not performed. Separate native caregiver screens received type, Android bundle and real persistence checks; an interactive device pass remains before a native release. Browser print/save dialogs, live money movement, biometric devices, external mail/SMS/push delivery and production load/uptime are not certified here. No external payment or real agreement was executed. The synthetic uploaded document was a screenshot of test data, not a real identity document.

Disposable UI data/logins were cleaned up and the normal backend restored on port 5000. Frontend remains on port 8081. Expo export reported that the installed Node 22.11.0 is below its recommended minimum 22.13.0, although both exports completed; update the build runtime before release.

Evidence: [admin report](screenshots/admin-rich-report-20261031.png), [admin overview](screenshots/admin-acceptance-overview-20261031.png).
