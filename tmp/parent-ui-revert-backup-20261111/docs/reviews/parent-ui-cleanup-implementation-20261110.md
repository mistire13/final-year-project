# Parent UI cleanup — implementation and validation

Implemented the approved cleanup from the parent UI audit. The implementation plan is in `../PARENT_UI_CLEANUP_IMPLEMENTATION_PLAN.md`.

## Preserved constraint

All six Today's Highlights background/ink pairs are unchanged. Text and icons still use the same `h.ink`; card and icon-disc backgrounds still use `h.bg`; the watermark retains its original color and opacity. A regression test checks the six approved pairs. Browser inspection also confirmed the exact rendered RGB values for the five populated cards in the synthetic report.

## Delivered

- Shared parent cards use opaque white surfaces and subtle borders. Default body text is 16px Quicksand Medium with matching line height. Supporting neutral text uses the shared darker token. Page/section headings have heading semantics; main controls retain usable target sizes and explicit web focus outlines. Navigation no longer fades one page over another.
- Quicksand remains the Latin font. Text containing Ethiopic characters deliberately requests the platform system family; mixed English/Amharic announcements rendered successfully in the browser. This does not add a bundled Ethiopic font.
- Home puts child status first. Six shortcuts fit in two rows. The duplicate fee banner and radial card glows are removed. Attendance badges distinguish absent/unavailable states. Announcements have separate open/dismiss controls and visible pending/error/retry states.
- Announcement previews are shared between Home, Messages and Notifications. Long titles/bodies are bounded in previews, with the full content available in the reader. Alerts retain an important-notice label. Read acknowledgements persist to the existing authorized preference endpoint and survive reloads. Failed acknowledgements remain visible; stale requests cannot erase a successful acknowledgement. Meal Plans uses the published type rather than English keyword guesses. Search misses, empty collections and request failures have separate recovery states.
- Identity/activity stock photos are removed from authenticated parent views. Uploaded child photos remain in use; absent photos use initials. Shop/cart products use actual uploaded images or an explicit placeholder, with real product data carried into the cart. Store load failures offer retry instead of pretending the catalog is empty. Shop uses the shared app header and retains a single visible history destination.
- Daily reports show observations once, avoid an invented happy mood, and use a quiet optional guide link. The generated dinner prompt does not insert the child's name. Empty optional sleep notes no longer occupy a line.
- Care Fees leads with outstanding money and invoices. Payment help is expandable; reminder preferences follow the bills. Receipt provenance, saved-proof recovery and the instruction not to repay during checking remain available.
- Profile keeps one route to each fee/guardian/order destination, including historical orders when shopping is unavailable. Contact details and food preferences save separately, with independent feedback and guarded preference loading. Redundant account labels and oversized personal-info decoration are removed.
- Existing child profiles can select a section and save it directly. Saves retain the server's version check, preserve instructions in other sections, and cannot change pickup approval or classroom assignment. Loading/stale-child guards prevent editing an unhydrated or different child's draft. Forms use consistent fonts, labels and named icon actions. Approximate birthday shortcuts and redundant account/status badges are removed. First-time onboarding still uses its required completion sequence.
- Calendar dates and filters have clearer names/selection states. Login no longer offers a nonfunctional Home Feed action. Help text describes actual receipt verification rather than obsolete demo payments.

## Verification

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | Passed |
| Complete frontend regression suite | 102 passed, 0 failed |
| New cleanup regressions | 10 cases cover announcement classification/search/read persistence/errors/races, Ethiopic fallback, exact Highlights colors and preservation of other care sections |
| Disposable real API | Section edits preserved medical/routine notes, emergency contacts and daycare-owned pickup/group values; stale save returned 409; browser acknowledgement persisted |
| Browser journeys | Sign-in, Home, announcement opening/dismissal/reload, search miss/clear, typed meal plans, profile, contact save confirmation, care fees, section edit/save, reports/detail, shop and cart |
| Final browser console | No error entries after the final reload |

Synthetic data ran through the real authenticated API in a disposable database on port 5300 and a separate frontend on 8083. Real payment providers, email delivery and AI requests were not exercised. No commercial prices or production application data were changed. The temporary servers/database/credentials are cleaned up; the normal app is checked separately after cleanup.

## Evidence and limits

- `../../tmp/parent-ui-cleanup-announcements.png`: final announcement layout.
- `../../tmp/parent-ui-cleanup-highlights.png`: preserved rendered Highlights palette.
- `../../tmp/parent-ui-cleanup-fees.png`: money-first fee page.
- `../../tmp/parent-ui-cleanup-tests.log`: full frontend regression output.
- `../../tmp/parent-ui-cleanup-local-check.json`: normal-app health and fixture-cleanup verification.

Browser checks used the centered 480px parent app within a desktop viewport. These are not physical Android/iOS tests or proof of every narrower viewport. Native Ethiopic rendering, device font scaling and a complete screen-reader audit still need device validation. This work does not claim full WCAG certification; the explicitly protected Highlights colors remain unchanged. No real transaction or password change was performed. The earlier full four-role journey audit is a separate task and is not claimed complete here.
