# Manual MVP acceptance test

Prepared 24 October 2026. Perform these steps yourself through the live interface. Mark each result PASS or FAIL; record the page, role, action, expected result, actual result and screenshot for failures. A running server alone does not establish MVP readiness.

## Clean starting state

- Local database: `localhost / ankelba_dev`.
- Preserved unchanged: `superadmin@ankelba.com`, system roles, schema and migration history.
- Removed: 86 other users, 27 daycares, and all operational test records, including children, groups, attendance, reports, guardians, messages, orders and test audit history.
- Full pre-cleanup PostgreSQL backup: `C:\Users\Mistire\AppData\Local\Ankelba\database-backups\before-manual-mvp-2026-10-24T20-08-41-729Z.dump`.
- No new test accounts or daycares were inserted after cleanup. Numeric IDs can continue from their previous values.
- Use live pages, avoiding preview routes because those can display sample data.
- Use separate browser profiles/browsers for owner, daycare admin, caregiver and parent. Private windows in the same browser can share one session; normal tabs share login state and can log each other out.

## Test identities to enter manually

Use fictional names and contact information. Record passwords privately; use unique passwords of at least 12 characters.

| Record | Suggested value |
| --- | --- |
| Daycare | Sunrise MVP Daycare |
| Administrator | Hana Tesfaye / hana.mvp@example.com |
| Caregiver | Selam Bekele / selam.mvp@example.com |
| Classroom | Toddlers A |
| Parent A | Sara Alemu / sara.mvp@example.com |
| Child A | Liya Alemu / birth date 2023-05-14 |
| Parent B | Dawit Bekele / dawit.mvp@example.com |
| Child B | Noah Bekele / birth date 2022-08-20 |
| Pickup-only adult | Meron Alemu, aunt of Liya |

These email addresses are suitable for local login tests, but do not receive mail. Use an inbox you control when specifically testing actual email delivery/recovery. Do not enter real child data for this rehearsal.

## 1. Apply for a daycare

1. Open http://localhost:8081/ and choose **Choose your package**. Compare Standard and Premium, select monthly/annual billing and choose a package. Both include their displayed free trial; Trial is not a separate package.
2. Review the selected terms in the registration form, complete daycare/contact/administrator details and submit once. The success screen should show application review/status and daycare login, with no operator-console button. Open http://localhost:8081/application-status with the submitted credentials to verify pending status.
3. Expect an application-submitted/pending-review result. Try signing into http://localhost:8081/admin/login before approval: access must be blocked.
4. Submit the same administrator email again: expect a useful duplicate error and no duplicate daycare/account.

## 2. Approve as superadmin

1. In the owner browser, open http://localhost:8081/platform/login and sign in as `superadmin@ankelba.com` using your existing password. The operator session is separate from the daycare session.
2. Locate Sunrise MVP Daycare in pending applications. Check the application details and preferred plan.
3. Approve it and confirm the accepted package is retained. Confirm the active daycare status and trial dates. The operator must not silently substitute another package at approval.
4. Return to the admin browser and sign in. Expect the new center's workspace, with no old children, families, staff, orders or reports.

## 3. Set up staff, classroom and families

1. Review **Center profile & plan** and save the center's contact details.
2. Open the caregiver management page and **Register Caregiver**. Create Selam with a login password.
3. Create **Toddlers A** on the classroom/group page and set Selam as lead caregiver where available.
4. Open **Children → Enroll New Family**. Enter Sara's parent login/phone/relationship/password and Liya's details. Select the classroom and caregiver; complete required fields and save.
5. Open Liya's profile: confirm the parent link, pickup authorization, classroom and caregiver. Add an emergency contact and a clearly synthetic allergy/care instruction such as “TEST ONLY: avoid peanuts”.
6. Enroll Dawit and Noah as a second, separate family. Assign the same classroom/caregiver. The second family is needed to check parent privacy.
7. On the duty assignment page, choose **Assign staff**. Set Selam's duty date to the current Addis Ababa date, start before the current time and end after it, within a maximum 16-hour shift. Select Toddlers A and enable **Record attendance** and **Verify and complete pickups**.
8. Confirm both children are active and Selam is assigned to them. Classroom lead status and front-desk duty permissions are separate.
9. Reopen the dashboard. The setup checklist should reflect these saved records, including the current permitted duty. Open **Center profile & plan** to inspect the separate package, subscription phase, terms and history.

## 4. Parent first login

1. In the parent browser, open http://localhost:8081/app and sign in with Sara's newly created credentials.
2. Complete every onboarding/profile step offered. Review Liya's date of birth, contact, care and emergency details; save and reload.
3. Confirm Sara sees Liya only, no Noah, no other family's messages, reports or orders, and no old test data.
4. Request Meron as a pickup-only guardian through the authorized-guardian page. Confirm **pending** status; she must not yet be eligible for pickup.
5. In the admin browser, review and approve Meron. Refresh the parent page and confirm the approved status. This pickup-only adult does not receive an app login.

## 5. Morning attendance

1. In the caregiver browser, open http://localhost:8081/staff and sign in as Selam.
2. Confirm the current duty and assigned children. Check Liya's allergy/care information before check-in.
3. Check in Liya and Noah for the current day. Refresh: both remain present with the correct timestamps.
4. Attempt a repeated check-in: it must be blocked without creating another record.
5. Refresh the admin dashboard and Sara's attendance/home page. Confirm the correct child status and time.
6. If duty controls are unavailable, check the assigned children, date, shift time and duty permission boxes before changing anything else.

## 6. Care during the day

1. As caregiver, create Liya's daily report. Record a meal with actual portion information, a rest/nap duration and note, an activity and mood as supported by the form. Save/submit.
2. Reload and reopen it as caregiver and administrator. The saved values must match, with no duplicate report or invented care details.
3. As Sara, open the daily report/history: verify each saved detail appears under Liya and the correct date.
4. Record a clearly synthetic minor health observation in **Health & incidents**. Check its saved details and parent visibility. Test the configured alert/notification path if offered; do not assume background push delivery from an in-app alert.
5. Send Sara a caregiver message; reply as Sara. Confirm both messages and their sender roles. Create a classroom announcement and check the intended audience.

## 7. Other MVP features, if included in your release

1. As admin, create a future event. Check its date, time and details as parent. Edit/cancel it and verify the update.
2. Create one product priced at 100 ETB with stock 3. As Sara, place a quantity-1 **Pay at Daycare** order. Verify the total, items, owner and stock change in the admin portal; record payment/fulfillment using the supported controls.
3. If testing demo payment, verify the interface explicitly describes it as simulated. This does not prove real payment processing. Cancel a separate order and verify stock is restored once.
4. Open parent help and the AI guide. Check their availability and any provider/fallback disclosure. Prepared guidance does not establish a connected generative service.

## 8. Afternoon pickup and checkout

1. As caregiver, open Liya in **Attendance & pickups** and begin pickup.
2. Confirm no adult is preselected, the identity checkbox starts unchecked, and verification notes start blank. Pending/rejected/revoked adults must not be offered.
3. Deliberately choose approved aunt Meron. Simulate checking photo ID/parent authorization and enter a truthful rehearsal note of at least 12 characters, such as “TEST ONLY: simulated photo ID checked against approved aunt”. Confirm the identity checkbox and complete pickup.
4. Check out Noah separately using his own authorized parent. Do not use Liya's adult for Noah.
5. Refresh caregiver and admin attendance. Each child must have one check-in and one checkout with the correct adult, actor and time; both must be collected rather than currently present.
6. As Sara, verify Liya's pickup status/history and final report. She must not see Noah's pickup or private family records.
7. Attempt another pickup for Liya. It must be blocked with no second checkout/audit release.

## 9. Negative checks before calling the MVP ready

- Blank required fields, invalid email and invalid dates produce useful errors without partial records.
- A pending/rejected daycare cannot enter a live daycare workspace.
- Parent B sees only Noah's family records. A direct link copied from Liya's private detail must not grant access to Dawit.
- A caregiver without an active permitted duty cannot record attendance or complete pickup, including from an already-open form.
- Before checking out Noah, open his pickup form, revoke the selected pickup-only adult in an admin browser, then submit the old form. Release must be blocked and Noah must remain present. Use a separate approved adult/contact for this test so the successful path remains available.
- Reports, messages and child profiles cannot be read by another daycare. For this check, manually register and approve a second daycare with a different admin email, then inspect both centers.
- Logging out clears private screens; reload/back navigation does not restore authenticated access.
- Test small-screen layouts, keyboard navigation and actual target phones. Browser tests do not establish native permissions, push notifications, biometric hardware, mail delivery or real payment integration.

## 10. End-of-day reconciliation and result

1. Select today's date consistently across screens. Confirm two active enrolled children, zero still present, two collected and no duplicate attendance.
2. Confirm saved reports, health notes, communication, guardian decisions and any orders match the actions you performed.
3. Check **Audit history** for actor-attributed check-in, report, guardian approval, checkout and other supported operations. Export attendance/children/audit where needed and verify the export belongs only to the current daycare.
4. Record every failure. Any unauthorized child access, unauthorized release, lost report, duplicate checkout or incorrect order/payment total blocks MVP acceptance until fixed and retested.
5. Mark only the features you actually exercised as passed. Retain the new manual records for investigating failures; do not rerun seed or audit/fixture scripts during this clean manual test.

Suggested result log: `Step | Role | PASS/FAIL | Actual result | Screenshot | Follow-up`.

## Subscription acceptance

1. As operator, open **Subscriptions & packages → Package catalog**. Configure your chosen monthly/annual prices and record a reason. Blank prices mean unconfigured, not free. Catalog changes apply to future applications and do not silently alter existing terms.
2. Select the approved daycare in **Subscriptions**. Verify trial status, package, capacity, accepted price and dates. Extend the trial with a reason and verify one history record.
3. If renewal price was unconfigured at application time, use **Change package / agree renewal terms** after agreeing the configured terms with the daycare. Existing paid terms cannot change before their paid period ends.
4. Record a manually verified payment using the exact accepted amount and a unique receipt reference. Confirm one renewal and one history entry. Reusing the reference, changing the amount or submitting a stale subscription must be rejected. This does not transfer money.
5. Cancel future renewal, verify the recorded decision and preserved paid-through date, then resume with a reason. The explicit pilot policy keeps care and pickup accessible while expiry/cancellation requires renewal review.
6. As daycare admin, refresh **Center profile & plan** and verify the same terms and changes. Parent/caregiver accounts must not gain subscription-administration access.

Local server logs are in `C:\Users\Mistire\AppData\Local\Ankelba\manual-mvp`.
