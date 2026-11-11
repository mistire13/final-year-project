# Parent app visual review — 10 November 2026

Read-only visual review requested by the user during the broader role-journey acceptance pass. No redesign was made during this review. Used the local `anti-ui-slop` skill and Ankelba styling guide; external reference research was unnecessary.

## Assessment

The cream/navy palette, rounded type and consistent icons provide a friendly daycare identity. The rendered app also has a generic, overdecorated feel in several places: many large rounded cards, soft shadows, glow/pastel accents, repeated labels and excessive space around small amounts of information. Heavy blurred glass is not the dominant treatment; the parent primitives mostly use nearly opaque white cards plus gradients and shadows.

Inspected the loaded Home, Profile, Care Fees, Reports/list and detail, Messages, Shop and the five-step care wizard. Used synthetic account content, so the small number of records is not itself treated as a design defect. Screenshots are browser evidence, not physical Android/iOS acceptance. The attempted viewport override did not change the observed 1280×720 browser size; the app rendered in its narrow approximately 480px web column. Do not claim a new 390px device validation from this pass.

## Findings in priority order

1. **Payment hierarchy:** The care-fee screen puts a large reminder-preference card and disabled Save button ahead of the outstanding bill and payment action. The first screen is mostly settings. Show the balance/due bill first; move reminder preferences to a compact setting or secondary area. Keep verification status, recipient/amount and prevention-of-double-payment guidance visible where relevant.
2. **Stock identities and activity imagery:** Profile uses `artwork.mother`; Reports uses `artwork.reportsChild`; Home uses `artwork.caregiver` and `artwork.painting`. These are shown beside real account/report data, including this fixture with no uploaded profile photo. Use actual uploaded photos or initials; decorative imagery should not appear to document a real child, staff identity or activity.
3. **Duplicated report content:** The same caregiver observation appears once under Daily Observations & Mood and again in the dark Caregiver Note card. Keep one note with author/date and one clear message action. Screenshot `tmp/parent-ui-review-report-detail.png` shows this exact duplication.
4. **Too many equally emphasized surfaces:** Home has announcement, child identity, shortcut tiles, multiple pastel highlight cards, latest activity and caregiver note. Reports adds identity, three navigation cards, date filters and another large report card. Flatten secondary content into rows, reserve cards for meaningful groups and reduce watermark icons/glows/shadows.
5. **Small, faint secondary text:** Shortcut captions, dates, class names, section eyebrows and metadata are visually light and small. Increase legibility and measure actual contrast before making accessibility-compliance claims. Keep important states such as attendance, pickup authorization, paid/pending and notified status.
6. **Repeated labels and routes:** Examples include PARENT ACCOUNT on one's own profile; Educator plus Assigned Caregiver on the same conversation; Administration plus Daycare Office & Administration; RECORDED MOOD; and repeated introductory subtitles. Profile also provides Care Fees and Orders both as large shortcuts and menu entries. Use one clear label or route where the repetition does not aid a decision.
7. **Long forms and inconsistent emphasis:** Updating care instructions starts a five-step wizard containing identity and emergency details. Existing identity loads correctly, but small updates take substantial navigation. A section-based edit flow would be easier to use. Header/title weights and action prominence also vary between report, account, finance and shop surfaces.

## Recommended direction

Keep the brand palette, Quicksand and consistent icon family. Use flatter white surfaces, fewer shadow/glow effects, clearer text contrast, one primary task per screen, compact metadata and context-specific help. Prioritize payment hierarchy, identity/photo correctness and duplicated report notes before cosmetic animation changes. This review does not propose removing necessary child-safety, authorization or payment-recovery information.

## Evidence

- `tmp/parent-ui-review-home.png`
- `tmp/parent-ui-review-profile.png`
- `tmp/parent-ui-review-fees.png`
- `tmp/parent-ui-review-reports.png`
- `tmp/parent-ui-review-report-detail.png`

The broader four-role journey audit was interrupted by this requested visual review. Admin navigation (21 pages), caregiver navigation (6 pages) and multiple parent workflows have evidence in `tmp/role-journey-browser-evidence.json`. The new disposable API journey suite passed 72 checks and authentication regressions passed 72 tests. Operator page-by-page coverage, remaining package-state browser checks and scheduling date/time-control investigation are still outstanding; do not label every account journey complete.
