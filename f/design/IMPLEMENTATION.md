# Ankelba design implementation

Updated 3 October 2026.

## Visual source
- Original supplied SVG exports are preserved in `figma-exports/`; `manifest.json` maps every export to a screen.
- Photos and illustrations were extracted from those exports into `assets/design/` (relative to the frontend root).
- The supplied logo SVG is used on the splash screen; the supplied brand symbol appears in headers.
- Quicksand (regular, medium, semibold, bold) is bundled locally. It is a chosen visual substitute: the exported SVGs contain outlined lettering, so the original font cannot be reliably identified.

## Shared styling
`src/components/design/System.tsx` defines the background effects, cards, typography, fields, buttons, headers, and bottom navigation. `src/theme/tokens.ts` holds shared colors and fonts. Screen photos are mapped in `src/theme/assets.ts`.

The implementation follows the reference layouts, cream backgrounds, navy actions, pastel cards and original images. Copy was shortened, cards were unified, and phone layouts adapt to width as requested. These intentional changes mean this is not a zero-pixel-difference reproduction.

## Screens
| Exports | Implementation |
| --- | --- |
| 01, 02, 04–06, 23 | Splash, login, onboarding, OTP |
| 03, 07–08 | Home, daily report, report history |
| 09–10, 13 | Messages, caregiver chat, AI guide |
| 11–12 | Calendar and event details |
| 14–16, 18, 22 | Guardians, pickup status, child profile |
| 17, 19–21 | Store, cart, checkout, order preview |
| 24 | Logo artwork |

Profile, notifications, account forms, and order history use the same components.

## Preview and data
Run `npm run web`, then Get Started → Skip → Preview design. The preview button is development-only.

Existing sample data remains in the design preview. Calendar/report filters, store search, cart quantities, local chat messages, and draft guardian/profile changes are interactive. Local drafts, reminders and notification preferences are not persisted to the backend. Checkout explicitly creates an order preview; it does not submit orders or payments. Pickup authorization is completed by staff; the parent UI does not perform biometric verification or check-out.

Login, password reset/change and authenticated AI requests use existing API routes. Backend integration and device validation remain separate from this visual implementation.

## Validation
- TypeScript compilation passed.
- Production web and Android Hermes bundle exports passed. Android export required allowing the installed Hermes compiler to run outside the sandbox; no device installation was performed.
- Browser checked at 390 × 844 and 320 × 740.
- Verified calendar date filtering and event navigation, report filters/detail navigation, product search, cart arithmetic (2 pencils + 1 book = 480 ETB), checkout preview, and local chat composer.
- Confirmed bottom navigation remains visible on long pages and new chat messages scroll into view.
- Review screenshots are saved in `../tmp/design-review/`.


## Remaining-page review and motion pass

See [PAGE_REVIEW.md](PAGE_REVIEW.md) for completed fixes, actual backend contract gaps, and verification scope. [DELIVERY_PLAN.md](../../DELIVERY_PLAN.md) is the active admin/staff/parent delivery checklist.

The pickup page now uses a connected three-step line with independent authorization, verification and checkout states. Shared page/button motion and a small original nurturing illustration honor platform reduced-motion preferences. The original supplied Lottie archives are retained; this pass uses React Native Animated and vector artwork without adding dependencies.

Final checks on 3 October 2026: TypeScript passed; all five focused tests passed (`node --test scripts/review.test.cjs`); production web and Android Hermes exports passed into `../tmp/page-review/final-build`. Reviewed browser runtime logs contained no warnings/errors. Physical-device testing and live service integration remain open.
