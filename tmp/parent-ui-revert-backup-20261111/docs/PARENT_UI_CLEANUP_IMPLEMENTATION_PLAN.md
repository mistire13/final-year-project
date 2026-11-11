# Parent UI cleanup — implementation plan

Approved scope: implement the parent UI audit in `reviews/parent-ui-full-audit-and-proposal-20261110.md`.

## Fixed constraint

Preserve Today's Highlights card colors exactly: meals `#FFF7CF / #DD7B13`, sleep `#F1EDF6 / #6745AF`, learning `#E8F6F3 / #008794`, play `#F0F6E8 / #3B813C`, mood `#FFF0E9 / #CC423E`, observations `#FDEDED / #BD4264`. Preserve icon, text, background and decorative watermark colors. No global color remapping.

## Implementation order

1. Shared foundation: opaque surfaces, readable Quicksand typography, heading semantics, usable controls, quiet transitions and clear focus states. Keep the warm cream/navy identity.
2. Announcements: compact previews, correct type and unread state, persistent read tracking, separate open/dismiss controls, useful search/error/empty states, a clear reading view.
3. Home and reports: child status first, useful shortcuts, remove fabricated identity/activity photographs and repeated observations. Preserve all six Highlights palettes.
4. Fees, account and forms: balance before preferences, remove duplicate destinations and ornamental labels, consistent input typography, explicit accessibility labels and selected states. Preserve historical orders, consent, payment recovery and authorization boundaries.
5. Verify: TypeScript, relevant frontend regressions, new behavioral tests, disposable-data browser journeys and visual checks. Check normal local app after cleanup.

## Acceptance

- Existing destinations and parent actions remain reachable, including past orders when Shop is unavailable.
- Opening an announcement updates its read state; a previously read item never acquires a false NEW badge. Search misses and request failures are distinct.
- Photos imply actual people or records only when sourced from real uploaded data.
- Main actions, form labels and navigation are readable; keyboard focus is visible.
- No payment/provider calls, production data mutations, pricing changes, session-boundary changes or deployment.
- Report exactly what was tested and any physical-device or font limitations.
