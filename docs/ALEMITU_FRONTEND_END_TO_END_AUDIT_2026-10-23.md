# Alemitu codex daycare — frontend end-to-end audit

Audit date: 23 October 2026 (Africa/Addis_Ababa).

**Repair follow-up:** see [implementation status and new frontend evidence](./ALEMITU_REPAIR_RESULTS_2026-10-23.md). The findings and tenant state below describe the original audit, before those repairs and additional synthetic tests.

**Status: Completed browser acceptance audit, with outstanding findings and untested coverage.** The core requested journey was exercised through the frontend. This is not a certification that every dashboard function, integration or backend access rule is complete.

**Final tenant state:** Alemitu is **Active** after the lifecycle test. Owner Directory shows Standard / 30 days, 2/50 children and two staff accounts; totals show 25 active and zero suspended. Post-reactivation admin login succeeded. [Reactivated tenant](./screenshots/alemitu-reactivated.png).

## Scope and method

The requested journey starts with a public daycare application, proceeds through platform approval and daycare setup, and ends with attendance and child pickup. Testing uses the application frontend as a user, with separate super-admin, daycare-admin, parent and caregiver accounts. No backend scripts, direct API calls, database inspection or scripted backend tests form part of this acceptance pass.

No application source code was changed during this audit. Actions changed only the authorized test daycare/account records through the UI; this report documents findings before implementation changes.

“Passed” means the listed interaction and its stated visible result were observed. “Inspected” means a page was opened without completing all its actions. A single successful save does not establish concurrency safety, email delivery, tenant isolation or every validation rule.

## Test daycare and retained test data

- Daycare: **Alemitu codex daycare**, tenant ID **25**, approved on Standard for 30 days and **reactivated to Active** after the suspension test.
- Platform account used: `superadmin@ankelba.com`.
- Parent account: `alemitucodex.parent@example.com` (reserved example domain).
- Daycare administrator account: `alemitucodex.admin@example.invalid`.
- Caregiver account: `alemitucodex.caregiver@example.invalid`.
- Caregiver: **Alemitu Test Caregiver**.
- Child: **Alemitu Test Child**, child ID **20**, synthetic date of birth **2022-06-15**.
- Initial setup used one classroom/group, one enrolled child and one caregiver. Admin settings initially showed one child against the 50-child allowance, two staff accounts and one group.
- A second synthetic control family was then created using Enroll New Family and its inline Create group path: **Alemitu Isolation Parent**, `alemitucodex.isolationparent@example.com`, and **Alemitu Isolation Child**, synthetic date of birth **2023-05-10**, in **Alemitu Isolation Classroom**, with no assigned caregiver. The daycare now has two children, two groups, two parents, one caregiver and the daycare administrator. These control records are retained.
- The caregiver's current 07:00–13:00 front-desk duty is scoped to Alemitu Test Classroom and permits attendance and pickup. The revoked earlier duty remains in history; the classroom caregiver assignment is separate.
- Test records include arrival, completed synthetic pickup, a daily report, a low-severity synthetic incident, messages, an announcement, an all-day event, preferences, a guardian request message, a free product and orders **43** and **44**.
- Product starting stock was three; the parent ordered one unit at zero total. The parent displayed order `43`, while the admin displayed `ANK43`. Admin progressed it through Confirmed and Ready to Collected, with payment recorded against the zero-ETB order; no money was transferred.
- Parent then ordered the remaining two units in order **44** for a cancellation/stock-recovery test. Admin saw stock zero while those two units were reserved. Cancelling the unpaid order restored stock to two; saving the unchanged Cancelled state again left stock at two. The cart had prevented increasing quantity above the available two units.
- Test data remains in the application for review. This audit has not performed cleanup. No passwords are included in this report.
- No other daycare was mutated during these test actions. The global broadcast composer was inspected without publishing to other tenants.

## Verified journey and coverage

| Area | Result | Observed evidence and limits |
| --- | --- | --- |
| Public application | Passed | Created the daycare application; duplicate submission was rejected. |
| Approval gate | Passed | The new administrator could not enter the daycare dashboard before approval. |
| Platform approval | Passed | Owner signed in and approved Standard / 30 days. The tenant directory showed Alemitu as active, Standard, initially 0/50 children. |
| Capacity setting | Passed | Owner changed capacity from 50 to 55 and back to 50; saves were reflected in the UI. |
| Initial tenant dashboard | Passed | The new admin dashboard began empty and showed the expected daycare context. This is a limited scoping observation, not a completed isolation test. |
| Parent onboarding explanation | Inspected | The public flow explains that daycare administrators provision parent accounts. |
| Group and staff setup | Passed | Created a group and caregiver, assigned duty, and enrolled one child with a linked parent. Later created a second family and an unassigned classroom through inline Create group during Enroll New Family. |
| Caregiver account | Passed | Synthetic caregiver login succeeded and redirected to `/staff/workspace`; five staff navigation pages were presented. Email delivery was not tested. |
| Parent account and care wizard | Passed | Parent first login completed the five-step wizard; entered care and allergy information remained visible after completion. Returning login skipped the completed wizard. |
| Arrival | Passed | Caregiver checked the child in at 08:20; parent home reflected arrival. Staff history later showed one check-in and one checkout. |
| Daily report | Passed with quality defect | Breakfast, 45 minutes of rest, happy mood, counting activity and notes were saved. Parent home displayed the report content; additional unsupported wording is recorded below. |
| Health / incident | Passed | A low-severity synthetic incident was saved. Notify was clicked twice; parent displayed one corresponding incident notification. This establishes the visible result for this attempt only. |
| Announcement detail | Passed | Parent announcement opened `AnnouncementDetail` with the correct full body and classroom context. Screenshot: [announcement detail](./screenshots/alemitu-announcement-detail.png). |
| Announcement publishing recovery | Passed with intermittent failure | One save/refresh timed out after 15 seconds. Retry and subsequent publishing succeeded, with no duplicate observed. The underlying failure is not established as fixed. |
| Admin ↔ parent messages | Passed with role-label defect | Parent and administrator exchanged messages and replies. Inbox identified the office correctly; the conversation header mislabeled the administrator as a caregiver. |
| Caregiver → parent message | Passed | The caregiver message appeared for the parent. |
| Event and reminder | Passed | Admin created an all-day event for the audit day; caregiver calendar showed it. Parent calendar/detail opened it and reminder saving succeeded. Push or device reminder delivery was not tested. |
| Guardian request | Blocked after request | Parent request was sent as an ordinary message to the office. No pending guardian row appeared. Admin could read the request, but no approve/reject action or additional-guardian account creation was found. |
| Existing parent pickup permission | Passed with High safety defect | Admin showed the linked parent as Approved. Both admin and staff pickup dialogs preselected that parent, prechecked manual identity confirmation and prefilled a full verification claim. After unchecking, submission correctly required identity confirmation and at least 12 characters. See ALE-07. |
| Duty-based pickup denial | Passed with UI mismatch | Admin revoked pickup duty. Caregiver still saw Verify pickup, but submitting failed with “Your current shift does not permit pickup for this child.” A new 07:00–13:00 attendance/pickup duty was then restored. [Revoked pickup blocked](./screenshots/alemitu-revoked-pickup-blocked.png). |
| Approved-parent pickup | Passed | At 08:36, caregiver completed pickup for the original approved parent with an explicit synthetic-test note; no real child was involved. Staff showed zero at daycare, one collected, the correct parent name, and one arrival/one checkout in history. Returning parent home showed Checked Out at 08:36; pickup status showed Checkout recorded with the matching staff/time. [Parent final pickup state](./screenshots/alemitu-parent-pickup-complete.png). |
| Parent attendance and report archive | Passed | Parent attendance history showed one arrival, one departure and zero absences with matching staff/times. The report archive showed one report. |
| Duplicate pickup | Passed for tested two-tab case | Two caregiver tabs were opened before pickup. After the first completed pickup, the stale second submission was blocked with “Child must be checked in before pickup.” [Duplicate blocked](./screenshots/alemitu-duplicate-pickup-blocked.png). |
| Parent pickup display | Passed with copy defect | The page described status without presenting a working QR pass; QR/device integration was shown as not connected. However, the attendance-history button was still labeled Pickup Pass despite leading to a status page that explains it is not a pass. |
| Store checkout and fulfillment | Passed for free item | Parent placed a one-unit, zero-total order and opened confirmation, receipt and history. Admin progressed Placed → Confirmed → Ready → Collected/Paid. One order was visible at that stage; returning parent history correctly showed order 43 as Collected/Paid. No real payment occurred. A separate second order was subsequently created for cancellation testing. |
| Cart stock ceiling | Passed | With two units available, cart increment was disabled at quantity two. The two-unit checkout created order 44 as Placed/Unpaid. |
| Cancellation and stock recovery | Passed for unpaid order | Admin saw stock zero after order 44 reserved the remaining two units. Cancelling the unpaid order restored stock to two. Saving unchanged Cancelled again left stock at two, with no double restoration observed. |
| Unpaid collection gate | Passed | Attempting Collected while unpaid was blocked with “Record payment before collecting this order.” Payment recording then allowed collection of the zero-ETB order. |
| Stale order update | Passed for tested two-tab case | Two admin tabs opened the Placed order. After one confirmed it, cancellation in the stale tab was blocked with “Order changed. Reload before saving.” [Stale order protected](./screenshots/alemitu-stale-order-protected.png). Successful cancellation/stock recovery was not exercised by this case. |
| Online payment | Unavailable integration | The UI explicitly stated that online payment is unavailable. No live digital payment was attempted. |
| Parent profile | Passed for edits | Phone initially appeared blank despite an enrollment guardian-phone value. Parent edited the phone and a synthetic preference; Save Changes succeeded. Whether these phone fields are intended to share data remains to be clarified. |
| Account security | Inspected | The security page was opened. Credentials were not changed. |
| Help and support | Inspected / gap | Help & Support routed to the inbox. No dedicated help content or support workflow was found in that path. |
| AI assistant | Quality gap | A simple counting question returned a generic list that did not answer the question. The initial example used the static name “Liya.” This does not establish a data leak. |
| Staff admin-URL denial | Passed for tested route | A caregiver opening `/admin/children` was redirected to `/staff/workspace`. |
| Parent staff-URL behavior | Passed for tested route | Opening the staff URL from the parent account showed staff login; no administrator data was shown. |
| Admin report and health details | Passed with report-detail gap | Health details showed the correct incident and notified status. Daily report details showed child, caregiver, date, mood, 45 minutes of rest and notes, but omitted the saved meal and activity details. |
| Admin analytics | Passed for observed counts | One attendance and one report were shown, with zero pending; these figures agreed with the exercised test records. Other analytics scenarios were not tested. |
| Tenant audit history | Inspected with coverage gap | Reviewed 14 entries over two pages in the fresh tenant. Entries covered enrollment, user registration, duty assignment, arrival, health/notification, profile save, order status changes and owner plan/approval. Report/group/event/product creation and order placement were not found. Owner actions displayed an Unassigned actor. See ALE-09. |
| Dashboard page inventory | Inspected | All 16 admin pages, all five staff pages and all seven owner navigation pages were visited. Owner pages: Overview, Directory, Applications, Global Accounts, Audit, Health and Broadcast. Page visits do not establish that every action on each page passed. |
| Parent logout | Passed for observed account view | Logout returned to Splash and cleared the visible parent account view. Cross-role cache isolation beyond these observations remains to be checked. |
| Within-daycare caregiver assignment filter | Passed for tested lists | After creation of a second child in a classroom with no caregiver, fresh caregiver login showed only the original Test Child in attendance (collected), with no unassigned child or not-marked entry. Daily Reports child selection also contained only the original assigned child. This establishes the tested list/selector behavior, not cross-daycare isolation or direct-record authorization. |
| Control-parent family isolation | Passed for tested pages | Fresh control-parent login showed only Isolation Child in the wizard, home and My Children. Home showed no report for today, My Orders was empty, and Health & Incidents was empty rather than showing the first family's incident. No cross-family record exposure was observed on these pages. |
| Parent classroom-change attempt | Passed with misleading control | The control parent's wizard offered both classrooms. Selecting the original Test Classroom and completing the profile did not change the administrator-assigned Isolation Classroom shown afterward, and no other-classroom announcement appeared. The observed outcome preserved assignment boundaries; the editable classroom control nevertheless suggested an operation the parent could not complete. |
| Owner global accounts | Passed for tested search/filter | Searching alemitucodex and applying the Caregiver filter returned the test caregiver only. The account table was read-only; no mutative account actions were available in the inspected view. Full account census/pagination is unverified. |
| Owner global audit | Passed for observed governance entries | The page displayed 50 recent governance events, including four Alemitu registration/approval/plan-change events with the actual owner attribution. This differs from tenant audit entries showing Unassigned for owner actions. |
| Owner system health | Inspected with misleading claims | UI displayed Operational, 16 ms, uptime, Node information, 25 tenants, 83 user accounts, 19 child profiles and 61 audit entries. These are UI-reported values, not independently verified measurements. Security/biometric assertions were also displayed; see ALE-13. |
| Owner broadcast | Inspected only | Preview, composer, status and type controls were inspected. A global broadcast was not published, avoiding messages to unrelated daycares. Delivery and audience behavior remain untested. |
| Tenant suspension and restoration | Passed | Owner suspension changed the row to Suspended and totals to one suspended / 24 active. A new admin sign-in with the test credentials was rejected: “Account or daycare is inactive or unavailable.” Owner reactivation persisted despite a UI action timeout: reacquiring the tab showed Active / Standard / 30 days / 2/50 children / two staff, with totals 25 active / zero suspended. Post-reactivation admin sign-in succeeded. |
| Final admin reconciliation | Passed for observed dashboard | Restored admin dashboard showed two enrolled children, two groups, zero at daycare, one not marked, one of two reports and one Safe Pickup. The original pickup displayed the correct parent and 08:36; the control family remained unassigned. These states agree with one completed attendance/pickup journey and one untouched control child. |
| Admin → platform-owner boundary | Passed for tested route/login | A daycare admin opening `/super-admin` saw only the owner sign-in form. Submitting the correct daycare-admin credentials there was explicitly rejected because the account lacked Super Administrator privileges. |

## Confirmed bugs and observed gaps

Severity reflects the impact of the observed behavior, not an assertion about its technical cause.

| ID | Priority | Finding | Expected behavior / required follow-up |
| --- | --- | --- | --- |
| ALE-01 | High | Additional-guardian journey has no discoverable completion path. The request becomes an ordinary message; no pending parent row or admin approval/rejection action was found. The child “Link guardian” selector contains the existing parent, and no additional-guardian account creation was found. | Provide an explicit pending request and a staff review/provisioning path, followed by an auditable approval state and pickup enforcement. Confirm whether another existing page supplies this capability before treating it as absent everywhere. |
| ALE-02 | Low | Administrator chat header identifies the office contact as “Early Learning Caregiver,” while the inbox identifies it correctly. | Use the recipient's actual role and identity consistently; verify admin and caregiver conversations separately. |
| ALE-03 | Medium | Report presentation added “Child rested comfortably during scheduled nap time” and home activity context “DaycareRoom” without those descriptions being entered. The control parent's empty health page also claimed “All Clear & Healthy!” based only on absence of records. | Display recorded facts or explicitly label defaults/derived summaries. Use an empty-record state such as No health updates recorded instead of implying an unrecorded observation or health assessment. This is a UI accuracy finding, not a clinical audit. |
| ALE-04 | Low / response quality | AI answer did not address the requested counting activity; the static introductory example used “Liya.” | Answer the user's question and use neutral or correctly scoped example copy. No cross-tenant disclosure has been demonstrated. |
| ALE-05 | Low | Owner approval plan and duration controls lacked accessible labels. | Associate readable labels with the controls and verify keyboard/screen-reader operation. |
| ALE-06 | Low / completeness | Help & Support opens the inbox without dedicated help information or a clearly identified support destination. | Explain who receives support messages and provide the help content required for the supported journey. |
| ALE-07 | **High — pickup safety** | Both admin and caregiver pickup dialogs open with an approved parent selected, the manual identity checkbox already checked, and a full verification claim prefilled. This lets a user submit an identity assertion without actively making that assertion. [Default-confirmed pickup dialog](./screenshots/alemitu-pickup-default-confirmed.png). | Require a deliberate identity confirmation and factual operator-entered verification information for each pickup. Do not precheck a safety attestation or prefill a claim that identity was verified. Validation after manually unchecking worked, but does not remove the unsafe default. |
| ALE-08 | Medium / completeness | Admin daily report details omit saved meal and activity content, even though the parent report displayed the recorded report content. | Show the relevant saved fields in admin review so staff can inspect the complete care record. |
| ALE-09 | Medium / accountability | The UI audit history omitted report/group/event/product creation and order placement within the fresh tenant's tested window. Owner plan/approval entries displayed actor Unassigned. | Verify audit capture and UI filtering for these actions and preserve attributable actors. This finding is based on the two-page UI history, not backend log inspection. |
| ALE-10 | Low | After pickup duty was revoked, caregiver still saw Verify pickup; submission correctly denied the action. | Reflect current duty permissions in available actions and refresh the permission state. The tested authorization gate did block pickup. |
| ALE-11 | Low | Attendance history labels its pickup-status action Pickup Pass, but the destination correctly explains that no working pass is available. | Rename the action to Pickup status or another label matching the destination. |
| ALE-12 | Low | Parent profile onboarding offers an editable classroom selector, but attempting another classroom leaves the administrator-assigned classroom unchanged. | Show the actual assignment as read-only, or explain the approval/request workflow if parents are intended to request a change. The tested attempt did not transfer the child or expose another classroom's announcement. |
| ALE-13 | Medium / misleading capability claims | Owner Health asserted Verified daycare_id across all queries, Stateful Revocation Enforced and Biometrics Ready with multi-factor/manual fallback. Actual pickup screens explicitly reported that device integration was not connected. [Owner health claims](./screenshots/alemitu-owner-health-claims.png). | Distinguish configured integration state, live measured checks and design assertions. Do not present a dashboard label as security verification or claim biometric readiness when the user-facing device integration is disconnected. No security certification was established by this browser test. |

## Issues requiring confirmation

| ID | Observation | Current conclusion |
| --- | --- | --- |
| ALE-C01 | Application review displayed requested plan “Trial” despite Standard being the form default. Actual approval was correctly Standard. | Possible intake default/submission/display mismatch. Reproduce with an explicitly selected plan before attributing the cause. |
| ALE-C02 | Lazy-loaded module/page failures occurred in two contexts, including `/super-admin`, where “This page could not open” appeared. Reload recovered access. | Recurring intermittent development-runtime issue. Recovery is verified; the issue is not fixed. No production-environment conclusion follows from this local-browser evidence. |
| ALE-C03 | Announcement save/refresh timed out once after 15 seconds; retry/publish succeeded. | Intermittent reliability issue. No duplicate was observed, but repeat-submit and lost-response safety are not proven. |
| ALE-C04 | Parent personal phone was blank while enrollment guardian phone existed. | Possible data mapping/usability mismatch; the fields may represent separate contacts. Saving an edited personal phone succeeded. |
| ALE-C05 | Parent enrollment rejected `.invalid` email while the application/staff test accounts accepted that synthetic domain. | Validation differs between entry points. This complicated test setup; it is not evidence that valid real parent email addresses fail. |
| ALE-C06 | A zero-total order initially appeared unpaid and required recording payment before collection. | The payment gate and manual payment recording worked. Confirm whether zero-total orders should require this manual step and whether the wording is appropriate. |
| ALE-C07 | Parent home displayed a stock child photograph although no photograph was uploaded for the synthetic child. | Optional identity/placeholder improvement: use a neutral avatar or clearly labeled placeholder. This does not establish disclosure of a stored child's photo. |
| ALE-C08 | Global Accounts navigation/All Accounts and Directory showed counts of 50 without visible pagination, while Health reported 83 user accounts. | Provisional completeness/count discrepancy: definitions or limits may differ. Confirm whether users beyond the displayed 50 are reachable and explain count semantics before concluding records are missing. |

## Not tested or unavailable

- Cross-daycare isolation with a second tenant, and broader direct-object/backend authorization rules. **No cross-tenant leak was confirmed; absence of leakage in the tested pages is not proof of every isolation rule.**
- Concurrency coverage beyond the exercised duplicate pickup, stale order status/cancellation conflict and unchanged Cancelled resave. Duplicate check-in, same-tab retries after a lost response and other simultaneous record edits were not exercised during this browser audit.
- Exhaustive role-by-route checks and account-switch cache isolation. The caregiver-to-admin, parent-to-staff and admin-to-owner boundaries listed above were tested; other routes were not comprehensively probed.
- A completed additional-guardian approval/rejection/pickup path, including pickup attempted with a pending guardian: the missing review/provisioning workflow blocked that full scenario.
- All edit/delete/export actions, sibling management and every dashboard action. Page visitation is not equivalent to testing all available operations.
- Parent receipt/status reconciliation for cancelled order 44; admin cancellation and stock restoration were verified.
- Physical Android/iOS devices, native permissions, native navigation and background delivery.
- Real email invitation/reset delivery: synthetic or reserved addresses were used.
- Actual digital payment processing, payment provider webhooks and paid settlement.
- Biometrics, working QR/device pickup verification and connected pickup hardware.
- Push notification delivery; a saved reminder is not proof that an operating-system notification will fire.
- Subscription expiry, renewal/payment collection and lifecycle controls beyond the completed suspension/reactivation test.
- Application rejection was not run; only the approval path was completed.
- Global broadcast publication and delivery were not run; unrelated tenants received no audit broadcast.
- Every account security action, password reset/change and session revocation path.
- Exhaustive accessibility, mobile viewport and slow/offline network behavior.
- Backend persistence, transaction boundaries or authorization enforcement beyond results observable through this frontend-only pass.

## Recommended next work

1. **Correct pickup defaults first.** Start identity confirmation unchecked, require an operator's deliberate factual attestation, and remove prefilled verification claims. Recheck admin and caregiver dialogs, duty revocation and duplicate pickup afterward.
2. **Complete the additional-guardian workflow.** Add a discoverable request, pending status, administrator approval/rejection and authorized identity/provisioning path, then test the complete guardian-to-pickup journey.
3. **Repair accountability and displayed data.** Fill the observed audit-history gaps and owner attribution, expose saved meal/activity in admin reports, remove unsupported care/health claims, and correct role labels, misleading controls and health-dashboard capability assertions.
4. **Address reliability and remaining UI quality.** Reproduce lazy-page failures and timeout recovery, verify account-list pagination/count semantics, label owner controls, improve support guidance and check AI response relevance.
5. **Plan the unimplemented integrations and remaining acceptance coverage.** Scope real email, digital payment, biometric/QR devices and push delivery against actual requirements; then complete physical-device, second-tenant, broader authorization and concurrency scenarios without presenting disconnected integrations as ready.

These are recommendations for the next implementation pass. No application fixes were made during this audit.

## Completed audit assessment

The core application → approval → admin setup → parent/caregiver care → arrival → original-approved-parent pickup journey was completed through the UI. Parent/staff pickup and attendance states agree; parent/admin order 43 states agree. Duplicate pickup and a stale order update were correctly blocked. Order 44 cancellation restored stock once. Caregiver lists excluded an unassigned child, the control parent's tested pages excluded the first family's records, and a classroom-change attempt preserved the administrator's assignment. All 16 admin, five staff and seven owner navigation pages were visited. Suspension denied new admin login; reactivation restored admin access, and the admin-to-owner login boundary rejected daycare-admin credentials.

The audit records **13 observed findings**, with two High-priority issues: the preconfirmed pickup identity assertion and the incomplete additional-guardian journey. Provisional observations remain separately labeled rather than promoted to confirmed security defects. Alemitu remains Active with retained synthetic test records; no other daycare was mutated, no global broadcast was published and no application source code was changed. Outstanding untested coverage is listed above, so this completed browser audit should not be read as a complete-app or backend security certification.

Final administrator attendance evidence: [retained test records and completed pickup](./screenshots/alemitu-final-admin-attendance.png).
