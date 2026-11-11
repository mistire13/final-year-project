# Parent UI audit and fix proposal

10 November 2026. This is the requested detailed review and proposed design contract, not an applied redesign. It extends the [initial visual review](parent-app-ui-review-20261110.md). The `anti-ui-slop` skill and Ankelba UI styling guide informed the review.

## Coverage and evidence

- Inventoried 36 parent screen files and 2 shared design files. Static JSX occurrences: **93 Button, 14 IconButton, 67 raw Pressable/MotionPressable, 128 Card, 29 Field/TextInput, 3 Switch and 525 Text**. Repeated maps and shared components make runtime counts different.
- [Every inventoried control and card occurrence, with source locations and fix category](parent-ui-component-inventory-20261110.md). This is complete for those files; it is not a claim that every password, destructive or external-service action was executed.
- Rendered sign-in/default and validation states, Home, announcement home/list/detail/search/meal-plan states and the care wizard in a provider/email/AI-disabled disposable fixture. Earlier review evidence covers Reports/detail, Profile, messages/chat, guardian requests, care fees/receipts, shop/cart/checkout/orders, calendar, history, notifications and help.
- Tested synthetic short, long, alert, general, meal-plan and English/Amharic content. The long announcement list card measured **576px** high in the displayed narrow app column; this is a content-density finding, not a fixed height in the code.
- Browser evidence was collected in the approximately 480px app column within a 1280×720 browser. This pass does not claim physical-device, screen-reader or 320/390px acceptance. These are required before delivery of the proposed cleanup.
- No parent design source was changed in this audit. Seeded records existed only in the owned disposable database. Reports and inventory helpers are review artifacts.

## Main conclusion

The app has a recognizable cream/navy identity. The problem is inconsistent hierarchy and excessive visual treatment: large rounded surfaces, shadows, glows, small captions, repeated subtitles, duplicate navigation and stock identity imagery. Most surfaces are nearly opaque white, so heavy blurred glass is not the primary issue. Page/card opacity entrance animations can briefly expose the previous screen beneath the new one and intensify the glass-like impression.

## 1. Typography and language

### Current implementation

- App.tsx loads **Quicksand 400, 500, 600 and 700**. The shared Text component maps those faces; a computed CSS weight of 400 can still use the Quicksand_700Bold font file and is not by itself a weight bug.
- Body defaults to 15px regular; the navigation label is 9px; badges and several metadata lines are 10–11px. Root/detail/announcement/login titles vary between 20, 26, 27 and 32px without a single enforced scale.
- Care-wizard inputs omit the shared font family. The browser confirmed their computed family was the platform system stack while surrounding labels used Quicksand. Field heights there were about 43px, compared with the shared 54px field.
- Parsing the bundled fonts' cmap tables showed Latin A present and sampled Ethiopic glyphs U+1200/U+12A0 absent in every bundled Quicksand face. Mixed-language announcement titles visibly fall back to a different-looking Ethiopic face. This is a font-coverage issue, not a reason to remove Amharic content.
- The shared Text line-height is calculated from its size prop before style overrides. Style-only font-size overrides should be checked so effective size and line-height stay aligned.

### Proposed scale

| Use | Proposed rule |
| --- | --- |
| Root screen title | 26px, bold; one title per screen |
| Detail/page title | 22px, semibold/bold; compact back bar |
| Section title | 20px, semibold |
| Item/announcement title | 17–18px, semibold |
| Body/form value | 16px, medium for small rounded text; about 24px line-height |
| Supporting text | 13–14px, medium and strong contrast |
| Bottom navigation/status | 11–12px minimum design target; meaningful labels |
| Amounts | 24–28px bold when they are the primary task; aligned amounts elsewhere |

Keep Quicksand for the brand and headings initially. Standardize the body scale before considering a wholesale font replacement. Bundle a deliberate Ethiopic font/fallback strategy and verify mixed scripts on web, Android and iOS. Use the same field fonts throughout the app. Respect system font scaling; avoid fixed-height text containers that clip enlarged content.

## 2. Contrast and visual weight

Calculated from explicit source color pairs using relative luminance; these are examples, not a whole-app accessibility certification:

| Pair/use | Ratio | Finding |
| --- | ---: | --- |
| Muted #757C88 on cream #FFFBED | 4.06:1 | Insufficient for normal-sized text |
| Announcement metadata #828995 on yellow #FFFAE5 | 3.36:1 | Insufficient for 11px metadata |
| Message time #9397A0 on white | 2.93:1 | Insufficient for normal-sized text |
| Gold highlight text #B7791F on #FEF7E6 | 3.41:1 | Insufficient for normal-sized text |
| Danger button label #D75345 on cream | 3.89:1 | Darken the active danger label |
| Secondary #5A6679 on cream | 5.61:1 | Useful existing stronger text token |
| Navy #061224 on white | 18.75:1 | Strong existing primary text |

Normal text needs 4.5:1, with exceptions such as large text and inactive controls; disabled button appearance must not be counted as an ordinary contrast failure. See [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Proposal: centralize a small set of tested text/status colors. Reserve pale pastel colors for backgrounds and decoration. Do not remove essential attendance, pickup, payment, severity or notification states. Remove most decorative glow/watermark layers and reduce default shadows; retain elevation for dialogs and intentional overlays.

## 3. All button and control families

| Family | Current finding | Proposed fix |
| --- | --- | --- |
| Primary buttons | Shared 54px control is a useful base; handwritten screens override height and type | Keep a consistent navy primary action, 16px semibold label and stable busy state |
| Secondary actions | Pills, outline buttons, card shortcuts and tiny text links compete | Use quiet rows/text actions for secondary navigation; avoid making every action a large pill |
| Icon buttons | Shared IconButton is 44px and labelled; profile header target is 40px | Apply the project 44px touch target to every icon action; use specific names |
| Small text actions | Observed Forgot Password 20px high, View All 21px, welcome links 30px | Increase effective touch area and spacing without making text visually huge |
| Announcement close | 24px visible web box inside a parent pressable; native hitSlop is configured | Make close and open targets siblings, keep close target explicit and comfortably sized; verify effective hit area on devices |
| Entire clickable cards | Read-all-body accessible names and nested actions can be verbose/confusing | Name the action by title, limit preview text and separate close/menu controls |
| Filter chips/segments | State semantics vary between aria-pressed, selected state and unlabelled raw controls | One selected-state pattern across native/web, with readable labels and keyboard support |
| Calendar days | Source uses 32×32px day pressables without explicit role/full-date label | Provide full date/selected/event semantics and adaptive generous targets/spacing |
| Quantity controls | Shared plus/minus/remove icons are already labelled | Preserve these patterns, disable unavailable actions and expose quantity changes clearly |
| Switches | Saved preferences, pending changes and errors need consistent feedback | Label the switch, show saving/failure, preserve accepted values on failed writes |
| Dangerous actions | Outline style and weak red text do not clearly establish consequence | Strong readable danger token, plain action name and appropriate confirmation; no decorative alerts for routine actions |
| Loading/disabled/success | Some screens use loading prop, some change label manually, some show generic Notice | Standardize label/spinner/disabled behavior, prevent duplicate submission, retain entered data and show clear result |
| Keyboard/screen reader | Browser focus exists as a thin default outline; 22 raw pressable occurrences lack explicit role attributes | Audit each flagged occurrence; add names, state and a consistent visible focus ring. Missing attribute alone is not proof of failure |

The project aims for 44px touch targets. WCAG 2.2 AA's minimum criterion is 24px or compliant spacing/exceptions; 44px must not be misrepresented as the AA minimum. See [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## 4. Cards, layout and navigation

Use three deliberate surface patterns: flat section/row groups for routine content; a compact summary surface for balances/current attendance; an interactive card only where the whole item is an action. Default cards should be opaque white with a subtle border, restrained radius and little/no shadow. Avoid card-inside-card layouts for simple text rows.

Keep one primary task above the fold. Use a consistent spacing scale (4/8/12/16/24), not repeated 20–28px gaps around every label. Root screens can retain the brand header; detail/edit screens should have a compact back/title bar instead of multiple stacked navigation layers. Keep bottom-tab behavior predictable and avoid adding redundant Home, First Page and Sign Out actions to edit forms.

Screen titles and section titles need heading semantics, not just larger text. Preserve accessible button names and clear selection states. Menu rows are already approximately 58px high and can become a more useful default for secondary navigation.

## 5. Announcement redesign — specific proposal

### Confirmed issues

- Home always renders NEW for the selected post. Dismissing records a read preference but the local dismissed list is not restored from it: the synthetic dismissed alert returned as NEW after reload.
- An announcement with type alert was shown with the same yellow card and generic DAYCARE ANNOUNCEMENT/DAYCARE UPDATE labels as a general update. Urgency is not clearly distinguished.
- Announcement list cards render the complete body. A long synthetic post produced a 576px card, making the list difficult to scan.
- Searching for a nonexistent term while three posts existed displayed “There are currently no active announcements from the daycare center.” This is false search feedback and provides no clear-search action.
- Announcement detail has large gaps, small metadata and generic type labels. English and Amharic title glyphs visibly differ.
- Meal-plan cards are classified partly through English words such as meal/menu/lunch/snack; the displayed count uses the actual type. This can make tab count and content classification inconsistent. The generic WEEKLY DAYCARE MENUS label also implies a period the data may not establish.

### Proposed presentation

| Surface | Content and behavior |
| --- | --- |
| Home announcement | Compact latest relevant post: type/urgency, title, two-line preview and date. Child attendance remains prominent. Make open and dismiss separate controls |
| List row/card | Title max 2 lines, body preview 2–3 lines, author/date in one readable line, real unread indicator only. Full text belongs in detail |
| Alert | A restrained high-contrast accent plus explicit “Important” label from actual alert type; never rely on color alone |
| Detail | One title, one metadata line, readable paragraph spacing and complete body; preserve line breaks. No arbitrary extra panels or duplicated heading |
| Empty list | “No announcements yet” with useful context |
| Empty search | “No matching announcements” plus Clear search |
| Expired/unavailable | Explain that the post is unavailable, offer back/retry as appropriate and retain navigation |
| Read/dismissed state | Define and persist the distinction; reloads must not turn old/read content into NEW |
| Meal plan | Use announcement_type consistently; label a week/day only when actually supplied; move AI dinner suggestions out of the primary menu-reading task |

Do not invent pinning, acknowledgements or read receipts as already available features. If the product later needs acknowledgement for critical notices, treat it as a separately scoped behavior with stored evidence and a clear policy.

## 6. Every parent screen group

| Screen group | Main issue | Proposed direction |
| --- | --- | --- |
| Welcome/onboarding | Repeated slogans and large decorative navigation | Clear parent sign-in entry; concise access explanation |
| Sign-in | First Page/Home Feed controls add confusion before authentication | Back plus sign-in/recovery; no destination button that only displays a sign-in warning |
| Forgot/reset/security | Large decorative headings; technical “token generated” wording | Plain instructions, persistent labels and safe generic recovery confirmation; do not expose account existence |
| Home | Announcement, identity, shortcuts, highlights and repeated notes compete | Current child/status first; compact actionable updates and limited shortcuts; responsive shortcut layout |
| Reports/list/archive | Multiple shortcut cards and tiny status metadata | Date/filter-led report list with one clear open action |
| Daily report | Observation repeats in separate caregiver-note card; excessive section spacing | One observation with author/date, compact meal/rest/activity groups and one message action |
| Attendance | Small filters/date controls | Clear date range, readable times and consistent empty/error states |
| Health/incident | Small unlabelled filter controls; verbose repeated context | Clear severity/notified states; compact record layout; keep factual-care disclaimer contextual |
| Messages/chat | Duplicate role labels, stock caregiver photo and static “Active” when no message exists | One role label, real photo/initials, honest no-message state; preserve timestamp/read status and accessible send |
| Announcements/meal plans | See detailed section above | Compact list and focused reading view with truthful states |
| Child profile | Repeated identity cards/metadata | Readable care sections with direct edit entry points |
| Five-step care wizard | Separate green/system-font design; many small updates require all steps; “Live Verification Preview” is only a summary | Shared field typography and section editing for existing profiles. Rename summary; preserve daycare-controlled pickup approval |
| Guardians/add/detail | Approval information must be unmistakable; chips and extra labels distract | Clear pending/approved/revoked state and one appropriate action; no fake biometrics/pickup verification |
| Pickup status | Several related concepts need clear wording | Explain who is approved versus what staff actually verified; preserve manual/device distinctions |
| Profile/account | Stock parent photo, duplicate Care Fees/Orders routes and repeated account labels | Actual photo/initials; concise account details and one discoverable route per secondary task |
| Personal information | Contact editing and household AI/food preferences are coupled | Separate profile/contact save from optional preferences and explicit AI consent |
| Care fees | Large reminder settings appear before bill/payment | Balance and due invoice first, reminder preference secondary; keep safety/payment status visible |
| Cash/bank receipts | Important evidence needs higher readability | Clear amount/reference/date/source; accessible receipt controls and no misleading paid label |
| Bank verification | Long help blocks can bury the immediate action | Preserve exact recipient/amount/proof/status, then contextual help; recover saved proof and avoid repeat-transfer prompts |
| Calendar/event | Small day cells, inconsistent filters/date naming | Full-date semantics, clear event rows and consistent Addis/local display rules |
| Shop | Header style differs; generic product fallback photos can imply actual items | Consistent shop header, real product image or honest placeholder, legible price/stock |
| Cart/checkout | Repeated summary surfaces and modified-height controls | Compact item/quantity rows, one total and one checkout action; truthful cash/bank choices |
| Confirmation/orders | Paid, placed, prepared and collected are different states | Make order and payment states distinct; preserve receipt/recovery and old orders after package changes |
| Notifications | Badges combine different actionable items | Group updates/messages/payments clearly and define what the badge counts; dismissal must not imply payment or pickup confirmation |
| AI guide | Prominent AI prompts compete with routine care/report reading | Keep optional assistance secondary, with honest availability/consent and clear non-emergency context |
| Help/support | Large repetitive cards for explanatory copy | Searchable/compact topics or disclosure rows, with a clear daycare-contact action |

Preserve history when removing duplicate navigation: the current Profile menu conditions its Store Orders link on shop access, while the Orders shortcut remains available. The cleanup must retain an always-accessible route to existing orders/receipts after downgrade or expiry.

## 7. Labels to simplify

- Standardize Care fees / Invoices / Tuition to a consistent daycare billing vocabulary.
- Replace First Page with Back/Welcome only where that destination is actually useful.
- Remove redundant PARENT ACCOUNT, repeated educator/assigned-caregiver labels and verbose decorative eyebrows.
- Replace RECORDED MOOD with a straightforward Mood row.
- Replace Live Verification Preview with Profile summary; do not imply that a client-side preview verifies identity.
- Keep meaningful attendance, authorization, severity, payment and review labels. Do not remove safeguards just to shorten the page.

## 8. Implementation order and acceptance criteria

1. **Foundations:** shared type/contrast/field/button/card/focus rules, actual photo/initials and explicit Amharic coverage. Build a private component gallery showing all variants/states so new screens stop introducing one-off styles.
2. **Announcements and Home:** compact cards, type/urgency/read-state correctness, honest search/empty states and child/status-first hierarchy.
3. **Reports, finance and forms:** remove duplicate notes, put bill/payment first, use section-based existing-profile editing, simplify navigation/copy and align all remaining parent screens.
4. **Regression acceptance:** replay the parent journeys with real authenticated disposable APIs; check default, focus, pressed, selected, busy, disabled, validation, error, success, empty, no-search-result, permission and expired states.

Observable finish criteria: no stock image representing a real identity/activity; no false NEW/Active labels; no duplicated observation; no long full-body announcement in list view; amount/pay action before reminder preferences; readable 4.5:1 normal text; project-size touch targets; no clipped controls at 320/390/768 widths and enlarged text; intentional English/Amharic typography; keyboard/screen-reader naming and focus; correct loading and payment-recovery behavior; screenshot evidence plus existing safety/payment regression checks.

No production settings, real accounts, payment destinations or real financial records should change during the UI implementation. Physical Android/iOS, screen-reader and large-font acceptance remain explicit requirements; browser screenshots alone cannot establish them.

## Review cleanup

The exact disposable UI fixture and its credential artifact were removed, and its review frontend on 8083 was stopped. A read-only check confirmed the owned database absent; normal backend health, pricing HTML and the web bundle returned HTTP 200, with no disposable port-5300 API destination in the normal bundle. Application servers were retained; no redesign or commercial settings were applied.
