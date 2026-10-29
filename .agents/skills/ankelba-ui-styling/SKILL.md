---
name: ankelba-ui-styling
description: >-
  Use this skill whenever creating, modifying, styling, or refactoring user interface components, screens, layouts, or stylesheets across the Ankelba frontend—including the Parent Mobile App (React Native/Expo), the Daycare Admin Portal (Web), and the Platform Super Admin Console (Web).
---

# Ankelba Pro Max Design System (Ankelba DS)

This skill provides complete guidelines, tokens, component mappings, and strict design constraints for building and maintaining user interfaces across all three tiers of the Ankelba platform.

---

## 1. System Overview & The Three Tiers

The Ankelba platform consists of three distinct UI tiers, all sharing a unified brand identity (warm editorial typography, cream bases, and deep navy anchors), but optimized for their respective user contexts:

| Sub-Theme | Target Role | Platform / Framework | Core Entry Points |
| :--- | :--- | :--- | :--- |
| **Ankelba Warm Nurture** | Parents & Guardians | React Native / Expo (`react-native`) | `frontend/src/screens/`, `frontend/src/components/design/System.tsx`, `frontend/src/theme/tokens.ts` |
| **Ankelba Emerald Portal** | Daycare Admins & Caregivers | Responsive Web (`react-dom` / Expo Web) | `frontend/src/portal/Portal.web.tsx`, `frontend/src/portal/portal.css`, `frontend/src/portal/ui.web.tsx` |
| **Ankelba Operator Onyx** | Platform Super Admins | Responsive Web (`react-dom` / Expo Web) | `frontend/src/portal/SuperAdmin.web.tsx`, `frontend/src/portal/portal.css`, `frontend/src/portal/saas.css` |

---

## 2. Core Brand Constants

These values remain universal across the entire platform:
- **Primary Brand Font**: `Quicksand` (Variants: `Quicksand_400Regular`, `Quicksand_500Medium`, `Quicksand_600SemiBold`, `Quicksand_700Bold`).
- **Brand Symbol**: `ankelba-symbol.png` (`require("../../design/figma-exports/ankelba-symbol.png")`).
- **Primary Navy**: `#061224` (Mobile) / `#0f2438` (Portal) / `#10263B` (Super Admin).
- **Warm Background**: `#FFFBED` (Mobile) / `#fffcf7` (Portal CSS `--cream`) / `#fbf9f4` (Portal CSS `--cream-soft`).
- **Card Surfaces**: `#FFFFFF` with soft borders (`#ECE7DD` on mobile, `#eae6dc` on web).
- **Accessibility Baseline**: WCAG 2.2 AA compliant contrast on text, explicit focus rings on interactive web elements, and minimum 44px tap targets on mobile.

---

## 3. Tier 1: Ankelba Warm Nurture (Parent Mobile App)

### Component Standard
Always build parent/guardian mobile screens using the pre-built design primitives from `frontend/src/components/design/System.tsx`:
- `<Page>`: Screen wrapper handling safe area, scrolling, keyboard avoiding, and refresh controls.
- `<Text>`: Custom text wrapper enforcing `Quicksand` fonts and sizing.
- `<Card>` & `<CardGlow>`: Rounded surface (radius 24) with optional subtle radial glow.
- `<SoftBackground>`: Multi-stop warm radial background gradient.
- `<Button>`: Dark navy primary button with pill border-radius (9999).
- `<IconButton>`: 44px touch target icon buttons.
- `<Badge>`: Status chips and category pills.
- `<Avatar>`: Rounded child or user profile avatars with status indicators.
- `<Section>`: Section headers with titles, subtitles, and right-hand action links.
- `<BrandMark>`: Vector/PNG Ankelba emblem.

### Color Tokens
Import directly from `frontend/src/theme/tokens.ts`:
- **Pastel Category Tints** (for Daily Reports & Timelines):
  - Meals: `#FEF7E6` (Text: `#B7791F`)
  - Sleep & Rest: `#F3EEF9` (Text: `#7E57C2`)
  - Learning: `#E6F8F9` (Text: `#00838F`)
  - Play & Physical: `#EDF7ED` (Text: `#2E7D32`)
  - Mood & Feelings: `#FDECEE` (Text: `#C2185B`)
  - Observations: `#FCEEF2` (Text: `#AD1457`)
- **Status Badges**:
  - Present: Bg `#E8F8EE`, Text `#2E7D32`
  - Absent: Bg `#FDECEE`, Text `#D32F2F`
  - Ready / Pending: Bg `#FEF3D6`, Text `#B7791F`

### Icons
Use `phosphor-react-native` (e.g., `import { Heart } from "phosphor-react-native/src/icons/Heart"`). Never introduce raw Lucide, Feather, or Expo Vector Icons in parent screens without keeping visual weight consistent.

*For full code patterns and templates, see [mobile_tokens.md](./references/mobile_tokens.md).*

---

## 4. Tier 2: Ankelba Emerald Portal (Daycare Admin & Caregivers)

### Web Root & Classes
All portal components must be rendered inside the `.ankelba-portal` root wrapper to inherit the custom properties and typography from `frontend/src/portal/portal.css`.

### Standard Primitives (`frontend/src/portal/ui.web.tsx`)
- `<Card>`: Container surfaces (`.p-card`) with glassmorphism or elevated shadows.
- `<Button>`: Motion-wrapped button (`.p-button`, variants: `primary`, `secondary`, `danger`, `ghost`).
- `<Badge>`: Status pill chips (`.p-badge`, tones: `success`, `warning`, `danger`, `info`, `neutral`).
- `<Icon name="..." />`: Standardized inline SVG icon set (home, chart, child, shield, clock, etc.).
- `<Modal>`: Accessible dialogs with animated backdrops, escape key bindings, and focus traps.
- `<RecordForm>`: Form layout with unified input styling and validation hints.
- `<PageTransition>`: Smooth page transitions powered by `motion/react`.

### Color Palette (CSS Variables)
- Base: `--cream-soft` (`#fbf9f4`), `--cream-card` (`#ffffff`), `--line` (`#eae6dc`).
- Primary Navy: `--navy` (`#0f2438`), `--navy-dark` (`#081624`).
- Brand Accent: `--green` (`#2d7a58`), `--green-hover` (`#236548`), `--green-soft` (`#ecfdf5`).
- System Status: Coral (`#e06d53`), Amber (`#d97706`), Sky (`#2563eb`), Indigo (`#4f46e5`).

---

## 5. Tier 3: Ankelba Operator Onyx (Super Admin Console)

### Visual Identity
- Built inside `frontend/src/portal/SuperAdmin.web.tsx`.
- Uses `.ankelba-portal` foundation with high-contrast governance accents:
  - Deep Operator Navy (`#10263B` / `--navy-dark`).
  - Crimson/Plum Operator Tag: Bg `#FCE7EC`, Text `#BD4264`, `font-weight: 800`, `font-size: 11px`, `letter-spacing: 1.6px`, uppercase pill.
  - Multi-Tenant Tab Bar: Daycares & Approvals, Platform Analytics, Subscription Billing, User Governance, Audit Trail & Health, System Settings.
  - Action Triggers: High-contrast buttons for destructive or elevated governance tasks (Approve, Suspend, Reject, Terminate).

*For full web CSS tokens, classes, and layout grids, see [web_portal_tokens.md](./references/web_portal_tokens.md).*

---

## 6. Development Checklist & Rules

When modifying or creating any frontend UI:
1. **Never use generic or unstyled HTML/Native components**:
   - In React Native: Use `<Text>`, `<Button>`, `<Card>` from `System.tsx` instead of bare `<Text>` or `<Button>` from `react-native`.
   - In Web Portals: Use `<Button>`, `<Card>`, `<Badge>` from `ui.web.tsx` and classes from `portal.css`.
2. **Preserve Font Consistency**:
   - Always ensure `Quicksand` font weights are maintained (`400`, `500`, `600`, `700`).
3. **Strict Color Adherence**:
   - Never introduce ad-hoc HEX colors (e.g. `#000000`, `#ff0000`, `#0000ff`). Always select from `tokens.ts` (mobile) or `portal.css` custom variables (web).
4. **Respect Session & Role Boundaries**:
   - Ensure portal components strictly use `portalTokenStorage` / `operatorApi` and mobile screens use `tokenStorage` / `apiClient` as specified in `.agents/rules/session_isolation.md`.
