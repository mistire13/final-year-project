# Ankelba SRS remaining-work audit

Date: 31 October 2026, Africa/Addis_Ababa.
Baseline: `Ankelba_SRS_AI_Readable.md`, version 1.2, including front-desk and practical SaaS clarifications.

**Follow-up:** [API authorization and browser verification](AUTHORIZATION_AND_WEB_FLOW_VERIFICATION_2026-10-31.md) records the subsequent repairs and tests. The six TypeScript errors listed in the original audit below are now fixed; current TypeScript checking passes. Caregiver browser check-in/pickup and message refresh, invoice privacy, AI consent/fallback and billing-state defects found during that pass were repaired. Historical validation rows below describe the initial audit, not the final follow-up state.

## Conclusion and evidence limits

**Latest follow-up:** [AI, native reporting and daycare-admin acceptance](AI_NATIVE_REPORTING_ADMIN_ACCEPTANCE_2026-10-31.md) supersedes the original AI-provider, native-reporting and admin-browser gaps below. Provider recovery controls and richer native reporting are implemented; all 17 daycare-admin areas received browser acceptance coverage and the discovered defects were repaired. Device interaction, external delivery/payments, biometric hardware and production release evidence remain separate validation items.

Core parent, caregiver and administrator functions exist. The app is not yet fully accepted against the SRS. The largest gaps are biometric hardware, native caregiver reporting limitations, release verification, privacy/retention decisions, and deployment recovery evidence. Live digital payments remain conditional on an approved provider. Scheduled push and photos are scope decisions, not automatically mandatory missing features. The owner confirmed on 31 October that platform subscriptions were intentionally removed; restoring trials, packages, renewal billing or enrollment quotas is not outstanding work. The SRS now records this superseding scope decision.

This audit inspected current navigation, screens, routes, services, migrations, and previous verification reports. It ran a new disposable-database deletion regression, current TypeScript checking, a production web export, and the new local migration. It did not repeat every role's browser journey or operate physical Android/iOS devices. Existing reports establish historical evidence only; they do not prove the current version still passes everything. No completion percentage is given because screen presence does not establish requirement acceptance.

## Role coverage

| Account | Implemented surfaces | Remaining work |
| --- | --- | --- |
| Parent | Linked children, profile/care instructions, daily and past reports, attendance history, health notices, messaging, announcements, notifications, calendar, AI guide, store/cart/orders, guardian status, account security and fees screens | Physical-device acceptance; recovery delivery; AI privacy and safety evaluation; live payments if approved; network/retry and child-switch acceptance; resolve type errors. Pickup status is not a working biometric pass. |
| Caregiver, native app | Assigned-child home, daily report creation/history summary, health/incident creation, parent notification, messaging, announcements, calendar, security and web-workspace link | Meal/snack and play categories are incomplete in native reporting; richer report/history review; reliable notification access; native device testing. Front-desk attendance/pickup deliberately opens the web workspace. |
| Caregiver, web workspace | Assigned child/report/health/communication pages and duty-controlled attendance/pickup | Full mutation/permission/reassignment/shift-expiry acceptance and device/provider integration. Native and web reporting capabilities differ. |
| Daycare administrator | Web management of children/families, staff, groups, duties, attendance, reports, health, guardians, messages, events, stock/orders, settings, audit, fees and registration documents; parent–caregiver message oversight added | Full form/error/concurrent-edit acceptance, recovery, accessibility and production configuration. Full native administration is not promised: web administration is an explicit SRS clarification. |
| Platform Super Administrator | Separate owner console, applications, tenant lifecycle, directory, audit, health and broadcasts | Remove obsolete subscription artifacts and inaccurate related statistics; full owner mutation acceptance. Controlled daycare deletion added in this pass. |
| Authorized pickup guardian | Approval relationship/contact record tied to a child | This is a pickup designation, not a missing separate login role. Device verification remains incomplete. |

## Requirements coverage matrix

“Implemented / acceptance open” means there is code and supporting historical evidence, not current end-to-end certification of every clause.

| SRS requirements | Assessment | Evidence and remaining acceptance |
| --- | --- | --- |
| FR-UAM-01–08, FR-UAM-11 | Implemented / acceptance open | Auth, role checks, account status, parent links, tenant middleware/RLS and separate session storage exist. Native restoration, recovery, account switching and current authorization matrix still need acceptance. |
| FR-UAM-09–10 | Implemented / acceptance open under revised scope | Public applications and operator approval/rejection/suspension exist. Trial activation is intentionally removed by the 31 October scope clarification. |
| FR-CH-01–07 | Implemented / acceptance open | Child/family enrollment, contacts, instructions, links, caregiver/group assignment and versioned updates exist. Recheck permission, reassignment and concurrent parent/admin edits. |
| FR-ATT-01–07, FR-DESK-01–04 | Implemented manual workflow / device integration open | Duty-controlled check-in/out, absence/history, selected adult and approved manual verification exist. Physical biometric success/failure is not implemented. Check active/expired/revoked duty and duplicate operations on devices. |
| FR-DAR-01–08 | Partial across platforms | Web supports meal/activity categories. Native `StaffComposeScreen` saves only one meal as `lunch` and one activity as `learning`; its “Learning or play” label cannot save a play category. Add selectable meal/snack/play types and multiple entries. Current native history only shows date/mood/rest; it has no full-report navigation. |
| FR-HIR-01–06 | Implemented / acceptance open | Health/incident entry, severity, authorized records and explicit parent notification exist. Verify native visibility, unread handling, errors and retries with both roles. |
| FR-COM-01–07 | Implemented in-app / acceptance open | Real contacts, messages, announcements, alerts/inbox and persisted preferences exist. The shared native header exposes the notification inbox to staff as well as parents. Verify unread/read state and refresh behavior on both roles/devices. |
| FR-COM-08 | Optional / TBD | Activity-photo sharing needs advisor decision, authorization/consent and storage design if included. Child profile images/documents do not establish activity-photo sharing. |
| FR-RPT-01–06 | Implemented / acceptance open | Parent current/history/detail views and admin summaries exist. Verify every reporting-completion filter, date boundary and reassignment scenario; improve native caregiver history detail. |
| FR-DB-01–05,08–09 | Implemented / acceptance open | PostgreSQL, relationships, scoped access and transactional/audited mutations exist. New deletion retains historical relationships. Exhaustive referential/permission coverage is not claimed. |
| FR-DB-06–07, section 6.4 | Operational evidence incomplete | Prior notes mention a backup before migration 034. No repeatable selected-pilot backup/restore demonstration was located in the inspected scripts/docs. Produce a runbook and restore a generated backup into a separate database, recording integrity checks and recovery time. |
| FR-AI-01–09 | Interface/provider code present / acceptance open | Parent interface, linked-child lookup, NVIDIA request path, medical redirect, disclaimer and prepared fallback exist. A configured key is not proof of provider availability. Run relevant-question, refusal, failure and cross-family tests. |
| FR-AI-10, NFR-PRV-05 | Policy/design decision open | Provider prompts can include the child's first name, group, age and saved allergy/diet text. Confirm consent and minimization, remove unnecessary identifiers, define provider/history retention. Do not describe the current implementation as anonymized. |
| FR-BIO-01–10 | Partial; major integration gap | Reference enrollment and manual verification exist. Standalone biometric `verify()` explicitly returns 503. Select device/modality, integrate real adult verification, protect references and test success/failure/unapproved adult/device failure/manual fallback. No child biometrics. |
| FR-ECM-01–07,10–16 | Core store/manual operations implemented / acceptance open | Product/stock, cart, server-priced orders, pay-at-daycare, order history/status and transactional retry controls exist. Recheck stock races, cancellations and role access in current code; confirm the final lifecycle status names. |
| FR-ECM-08–09, NFR-TST-03 | Conditional integration open | Payment capabilities report `online_enabled: false`; demo payment is explicitly simulated. Approved gateway checkout, signed/verified callbacks, retries and sandbox evidence remain if digital payments stay in scope. |
| FR-EVT-01–07 | Implemented / acceptance open | Admin create/edit/cancel and parent calendar/list/detail exist. Reminder preferences do not schedule device reminders. Recheck cancellation/date/time and stale-update cases. |
| FR-AUD-01–05 | Implemented / acceptance open | Audit views and transactional evidence exist, including pickup and relationships. New deletion logs actor/target/time/reason and retains records. Check all sensitive legacy mutation paths; this audit does not certify all of them. |
| FR-SUB-01–03,06–09 subscription obligations | Removed from scope by owner | Platform subscription sales, terms, trials, billing/renewal and enrollment quotas are intentionally removed. Existing package/renewal artifacts should be retired as cleanup. Guided setup remains useful and in scope. Do not restore subscriptions to satisfy the superseded baseline. |
| FR-SUB-04–05 | Substantial implementation / acceptance open | Credential-protected application status and separate operator storage remain in scope. Status respects deletion/suspension for staged applications. Verify lifecycle through current UI. |
| FR-COM-09–11, 31 October clarification | Implemented / browser acceptance open | Dedicated administrator-only, tenant-scoped, searchable/paginated parent–caregiver review, audited access without body duplication, unchanged recipient read receipts, and participant visibility notices. Personal inbox rules remain unchanged. |
| NFR-SEC-01–07, NFR-PRV-01–05 | Controls present / policy and acceptance open | Auth/RBAC, hashes, validation, server-side keys and audits exist. Re-run direct authorization tests, approve sensitive-data consent/minimization/retention, and review fresh-install operator bootstrap credentials before deployment. |
| NFR-REL-01–04, NFR-AVL-01–03, CI-02–03 | Core safeguards present / failure matrix open | Transactions, duplicate protections and unavailable-provider/manual fallbacks exist. Lost responses, device outages, concurrent edits and cross-device retries still require complete acceptance. |
| NFR-USA-01–04, NFR-CMP-01–03, UI-01–08, UI-DESK-01 | Interfaces present / usability/accessibility acceptance open | Shared design and role screens exist. Physical devices, browser support matrix, assistive technology, keyboard and reduced motion require validation. |
| NFR-PERF-01–03 | Measured pilot acceptance missing | Targets remain TBD; bundling or page rendering is not a load/performance test. |
| NFR-MNT-01–03, NFR-TST-01–05 | Substantial structure/tests / complete traceability open | Modular code and synthetic test helpers exist. Current type errors, provider/device cases and a per-requirement acceptance evidence register remain. |
| Section 5.2, SI-01–06, CI-01 | Stack implemented / deployment and service acceptance open | PostgreSQL/React/Node/Express and server-side provider code exist. Confirm selected hardware and service interfaces, encrypted deployed transport and device/provider behavior in the pilot environment. Local HTTP does not establish deployed HTTPS. |

## Prioritized remaining work

1. **Completed in follow-up — Type-check failures.** Fixed ScrollView instance/ref types and the account Role union. `tsc --noEmit` now passes; see the follow-up verification report.
2. **P2 — Retire obsolete subscription artifacts.** The owner has confirmed removal and the SRS is updated. Remove leftover package/trial/renewal UI, unused APIs and obsolete lifecycle tests in a cleanup pass. This is not a missing subscription feature or an instruction to restore quotas. Parent store payments and daycare tuition remain separate.
3. **P1 — Complete native caregiver daily reporting.** Allow breakfast/lunch/snacks and learning/play categories, multiple entries, useful detail/history review and any agreed correction workflow. The SRS does not explicitly require a separate edit-report screen, so treat editing as a workflow decision rather than inventing a mandatory requirement.
4. **P1 — Finish adult biometric integration or obtain an explicit scope decision.** Manual fallback is implemented; it does not fulfill real biometric verification by itself.
5. **P1 — Demonstrate backup restoration and decide retention/consent.** Define backup frequency, restricted storage, retention and recovery procedure. Define child/health/messages/biometric/AI/order retention and controlled eventual erasure. Soft daycare deletion does not settle long-term erasure policy.
6. **P1 — Run physical Android/iOS acceptance.** Cover parent and caregiver sign-in, restored sessions, secure storage, child switching, reports, messages, health notifications, cart/order retries, guardian status, background/foreground and portal opening. Use at least two devices/accounts and two daycare scopes. An Android JavaScript export is not a device run.
7. **P2 — Recovery and stronger-auth integration.** The active frontend calls legacy `/auth/login` and reset-token endpoints. Backend MFA/session preview exists behind a feature flag and is development/test gated; its existence does not mean the app has an accepted MFA journey. Complete actual recovery delivery and user-operated reset/password-change acceptance. MFA is a hardening item, not a new mandatory requirement invented from the original SRS.
8. **P2 — Validate failure/concurrency/accessibility.** Lost successful responses, simultaneous parent/admin edits, revoked caregiver responsibility/duty, suspension/deletion with an existing session, midnight/date boundaries, keyboard/focus, screen readers, font scaling, narrow layouts and reduced motion remain a full matrix to execute.
9. **P2 — Correct platform summary figures.** `getPlatformStats` still returns obsolete trial/package statistics. Remove those figures under the confirmed no-subscription scope. Historical users/children remain in aggregate totals after daycare deletion; label the retained-record totals clearly.
10. **P2 — Measure pilot performance and release configuration.** Agree response-time/concurrency targets (TBD-08), measure common pages, review dependencies and establish supported browsers/OS versions, HTTPS and release configuration. Local Node 22.11 emits the Expo minimum-version warning. No new vulnerability assessment was run in this audit.

## Scope decisions that should not become accidental blockers

- TBD-01: biometric modality/device and privacy design remain unresolved.
- TBD-02: approved gateway/live merchant availability; pay-at-daycare already works, demo transfers no money.
- TBD-03: AI provider/model, minimization and retention need explicit baseline approval.
- TBD-04: activity photos are optional until confirmed.
- TBD-05: in-app notifications meet FR-COM-07; external SMS/email/push and scheduled reminders are additional delivery work if selected. Durable toggles do not prove delivery.
- TBD-06: caregiver responsibility rules are implemented through assignment/duty controls, but need policy sign-off and acceptance.
- TBD-07: record retention and eventual erasure are still decisions.
- TBD-08: measurable pilot load and response target remain to agree and test.
- Guardian pickup authorization is a designation, not an additional independent account type.
- Fees and registration documents are newer features beyond the main original functional matrix. Their presence does not close biometric, privacy or backup requirements.

## Daycare deletion delivered in this pass

Platform Super Administrator → Daycares → Delete daycare. The action requires the exact daycare name, a reason of 12–2000 characters and the reviewed record version. A transaction marks the center deleted/suspended and writes `DAYCARE_DELETED` audit evidence. The normal directory excludes it; staff/parent login is blocked by the existing active-daycare authentication checks. Reactivation and subscription changes are rejected. Repeated successful deletion does not append a duplicate audit event. Child records and other history are retained; account/email identities remain reserved. This is logical deletion, not permanent erasure. Daycare admins cannot delete other tenants.

Migration 041 was applied locally (batch 25). No existing daycare was deleted. Recovery from logical deletion is not exposed as an owner action; a future controlled restoration/erasure policy is separate work.

## Verification performed now

| Check | Result |
| --- | --- |
| New `node --test scripts/daycare-deletion.test.cjs` | Passed against a generated disposable database; unauthorized/tenant actor denial, wrong name, stale version, audit-failure rollback, retry, retained child, directory/count removal, denied new login and blocked reactivation/database active-state constraint |
| `npx tsc --noEmit` | Failed with six existing errors in unchanged files, listed above; no error reported in the modified owner components |
| `npx expo export --platform web --output-dir ../tmp/srs-audit-web-20261031` | Passed, including the final deleted-status copy adjustment; 1,532 modules bundled |
| `npm run migrate` | Passed; only migration 041 was pending/applied |
| `git diff --check` | Passed at review; Windows line-ending notices only |
| Physical devices/full role browser matrix | Not performed in this audit |

Previous evidence reviewed: `PHASE_2_IMPLEMENTATION_VERIFICATION.md`, `ACCEPTANCE_HARDENING_VERIFICATION.md`, `PRACTICAL_SAAS_IMPLEMENTATION.md`, `ALEMITU_REPAIR_RESULTS_2026-10-23.md`. Reuse their cases as a starting checklist, then rerun against the present version.

### Same-day message oversight follow-up

The owner requested that daycare administrators review parent–caregiver messages and confirmed removal of platform subscriptions. Both scope changes are recorded in the SRS's 31 October clarification. The Admin → Communication page now has a separate searchable/paginated message review view, preserving the administrator's personal inbox. Parent chat and caregiver communication screens disclose administrator review. Review queries enforce administrator role and daycare scope, append access audit records containing message IDs but no message bodies, and leave recipient read receipts unchanged.

`node --test scripts/phase6-communication-audiences.test.cjs` passed with the new review/isolation/pagination/audit/receipt cases and existing communication checks. The production web export passed with 1,533 modules. TypeScript still reports the same six errors listed above; none were reported in the added review component. Full browser/device review acceptance remains open. No existing messages were modified or deleted for acceptance: fixture writes used a generated disposable test database.
