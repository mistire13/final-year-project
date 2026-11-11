# Plus staff scheduling implementation

## Delivered

- Tenant-scoped weekly templates with multiple caregiver/classroom rules, explicit attendance/pickup responsibilities, enabled/archive state and version checks.
- Dated schedule preview in Addis Ababa time for one to eight weeks. Preview detects internal overlaps, existing duties, approved leave, recorded weekly availability and shifts in the past. Shifts are limited to 16 hours; unconfigured availability remains unrestricted until staff record their weekly availability.
- Review acknowledgement and a fresh preview token are required before publication. A changed template, availability, approved leave or duty invalidates the preview. Duplicate request keys and repeat publication of the same template/version/week range return the recorded publication without creating more duties/messages.
- Publication creates real `front_desk_assignments`; templates themselves grant no attendance/pickup permissions. Caregivers receive in-app messages through the existing inbox. No external messages are sent.
- Caregivers can record their own weekly availability and request their own leave. Administrators can manage staff availability, review leave and arrange substitutes. Caregivers see their own duties/leave only.
- Leave cannot be approved while an active duty overlaps. An administrator must resolve or substitute that duty first. Substitution atomically inserts the replacement and revokes the original with the same classroom/responsibilities, records the reason and notifies both caregivers. The original caregiver may be inactive; the replacement must be active.
- The standalone branded portal component includes template drafting, dated preview/review, schedule tables, availability, leave request/review and substitution controls. UI uses the Ankelba styling skill and portal primitives.

## Integration contracts

- Mount `backend/src/modules/staff-scheduling/staff-scheduling.routes.js` at `/api/staff-scheduling`.
- Render `frontend/src/portal/PlusStaffScheduling.web.tsx` for the appropriate admin/caregiver route. It uses exported `portalClient` directly and derives its role from the server.
- Root's `requireFeature(client, daycareId, 'staff_scheduling')` controls access. Existing Standard manual duty routes remain unchanged.
- Migration `052_plus_staff_scheduling.js` adds templates/rules, publications, availability, leave and a tenant-bound publication link on existing duties. Tables use forced RLS and tenant-bound foreign keys, with tenant runtime sequence/table grants. Historical duties/leave are preserved on rollback.
- No shared app/server/portal/API/package files were edited by this task. Root integrates navigation and migration rollout.

## Validation

- Two backend tests passed, including a persisted isolated-database workflow with real restricted-role writes and cross-tenant RLS reads.
- Two frontend component interaction tests passed, including required preview/review before publication and caregiver-only leave with Addis Ababa timestamps.
- TypeScript passed after the component was added.
- Backend tests cover draft/no-duty behavior, stale preview, repeated publication, preserved capability flags, wrong-tenant caregiver rejection, leave approval with unresolved duty rejection, inactive-caregiver substitution, own-only availability, role enforcement, in-app messages and RLS scope.

## Operational details

- Availability preferences affect future publications/substitutions; they never silently revoke already-published care duties.
- Template rules are immutable: archive a template and create a revised one when the weekly pattern changes. Names/rules are reviewed at creation; enabled/archive updates increment the version.
- Leave intervals are at most 31 days; listing ranges are at most 93 days. Availability intervals are within a single local day. An overnight shift is allowed when no weekly availability is recorded; configured availability must contain the full shift.
- A publication starts in the future and has at most 800 dated shifts. Normal access to existing care assignments remains through the existing Standard staff workspace even if the Plus feature expires.
- No live database migration, user notification, or external email was executed by this subtask. Tests used generated disposable databases and in-memory component transports.

## Additional cross-module review

Pending final review of root-owned package entitlement and shop changes.
