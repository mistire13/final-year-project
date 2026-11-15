# Parent app page review

3 October 2026. Scope: finish the approved parent design pass, review remaining pages against project requirements, add restrained motion, and preserve a complete admin/staff delivery plan.

## Sources and planning

Read the root SRS/proposal, `feature_design_plan_v2`, backend architecture, frontend API documentation and actual relevant backend routes/services. The active cross-project checklist is [DELIVERY_PLAN.md](../../DELIVERY_PLAN.md). The SRS now includes the user's confirmed web-admin and date/shift-specific front-desk staff requirement.

The feature plan already specifies three role-specific web portals and login redirects. The SRS already permits authorized staff attendance and adult guardian verification. Temporary front-desk duty is the newly clarified assignment model; it must be implemented separately from ordinary caregiver-to-child responsibility.

## Completed changes

| Area | Result |
| --- | --- |
| Reports | One dated preview dataset; correct today/week/month filters; distinct historical activity and checkout; absent report state |
| Child/profile | Consistent Liya photo and 2022 birth date/age-four fixture; concise buttons on small screens |
| Events | Selected month/day filters; holidays show closure information; event message action opens the daycare office; reminders survive navigation within the preview session |
| Messages | Searches conversation and announcement tabs; no-results state; fixed chat/AI back toolbar during scrolling |
| AI | Authenticated request path corrected to `/ai/guide`; local preview response remains explicitly a preview |
| Store/cart | Stock-aware quantity clamping; unavailable/max-stock controls; total remains correct |
| Checkout/orders | Local order preview, not-submitted and not-paid labels; order-history navigation |
| Guardians/account | Name/phone/email validation; unknown-record states; draft wording; no parent approval/verification/checkout action |
| Pickup | Connected three-step vertical line; authorization, identity verification and checkout are distinct; enrolled guardian remains awaiting staff verification |
| Shared motion | Short entrance fades/translations, press/release feedback, onboarding slide transitions, stack fades; fixed toolbar and bottom navigation remain outside scrolling content |
| Illustration | Small original nurturing heart/leaf vector in the guide; two gentle cycles then rest; approved supplied images remain in place |

Motion uses one shared platform reduced-motion preference, reacts to preference changes, stops offscreen and removes listeners on cleanup. Reduced motion disables decorative motion, animated scrolling and stack transitions. No animation changes operational state or implies an unrecorded successful pickup/payment.

Both supplied `.lottie` archives were structurally inspected and retained. They contain vector animation JSON without external image assets. The installed Lottie native package lacks its optional web player; this pass uses a small original cross-platform animation without adding dependencies.

## Verification

- Five Node regression checks pass: quantity bounds/availability, report date boundaries, historical/absent report accuracy, contact validation, pickup progression prerequisites.
- TypeScript passes (`node node_modules/typescript/bin/tsc --noEmit`).
- Browser reviewed at 390×844 and 320×740, including reports, calendar, messages, profile/child, guardians, pickup, store/cart, checkout/orders, notifications and security form layout.
- Verified 2 color-pencil packs + 1 exercise book = 480 ETB through cart, checkout and local order preview. No real order/payment was submitted.
- Verified holiday details open the daycare office conversation, local reminders survive back navigation, invalid guardian email is rejected, and notification navigation opens Sara's conversation.
- Security layout reviewed without entering/changing credentials. Live login/reset/payment/AI/biometric services were not exercised.
- Browser runtime errors/warnings absent in the final reviewed animation preview. Button styling was corrected after the first animation wrapper pass and visually rechecked.
- Final production web and Android Hermes bundle exports pass; outputs are in `../../tmp/page-review/final-build`. A bundle export is not an installed-device test.
- Reduced-motion fallback/listener and cleanup were inspected in code; OS preference switching and physical Android motion/hardware behavior still need device validation.

Screenshots: `../../tmp/page-review/historical-report.jpg`, `holiday-details.jpg`, `child-profile-small-phone.jpg`, `ai-guide-motion.jpg`, and `pickup-connected.jpg`.

## Integration findings to carry into the next phase

| Finding from actual source | Required follow-up |
| --- | --- |
| `/auth/me` returns `{ user }`; some docs show a bare user | Normalize auth contract, real session restoration and role routing |
| `/users/profile/me` supplies linked-child/profile context | Replace fixed preview identity and child data using authorized contracts |
| Guardian routes are admin-only | Add scoped parent read/request workflow; local drafts cannot grant authorization |
| Caregiver attendance is limited to `children.caregiver_id` | Add explicit dated duty model/scope checks for desk staff; retain regular caregiver restrictions |
| Generic attendance `recordAttendance` accepts checkout without consuming successful verification | Enforce verification-before-checkout server-side, atomically, across every release path; reject duplicate/replayed checkout |
| Biometric routes allow admin enrollment and admin/caregiver verification | Verify service scope and add explicit duty/capability checks, provider integration and controlled audited fallback |
| OTP endpoint from old plan does not exist | Align recovery with backend reset tokens; do not link a pretend OTP success workflow |
| Payment implementation constructs a gateway URL without a real initiation call | Implement and test actual gateway/server verification; resolve `method` versus documented payload differences |
| Notifications endpoint returns counts | Design/map authorized feed data and persisted preferences before replacing local notifications |
| Dedicated parent attendance and health/incident histories remain absent | Add these pages and connect authorized child/date queries |
| Live AI/payment/hardware providers not verified | Keep those acceptance items separate from UI completion |

The detailed web admin and staff portal is the next planned phase, using the approved app's brand system in a responsive desktop layout. No new broad staff permissions, database changes or production deployment were performed in this review.
