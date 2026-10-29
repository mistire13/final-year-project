# Ankelba Pro Max Design System & Frontend UI Rules (SRS UI-01 to UI-08 & NFR-CMP-02)

Whenever creating, modifying, editing, or inspecting any frontend user interface (screens, components, layouts, dialogs, styles, or stylesheets) in `frontend/src/`, you MUST ALWAYS strictly follow the **Ankelba Pro Max Design System**:

---

## 1. Strict Three-Tier UI Architecture & Routing

Never mix native components with web portal styling, and never invent generic or unstyled HTML/React Native elements. Always route your styling decisions by platform tier:

### A. Parent & Guardian Mobile App (`frontend/src/screens/`, `frontend/src/components/`)
- **Theme**: *Ankelba Warm Nurture*
- **Component Imports**: You MUST import design primitives from `frontend/src/components/design/System.tsx` (`<Page>`, `<Text>`, `<Card>`, `<CardGlow>`, `<SoftBackground>`, `<Badge>`, `<Section>`, `<Button>`, `<IconButton>`, `<BrandMark>`).
- **Token Imports**: You MUST import colors, radii, shadows, and fonts from `frontend/src/theme/tokens.ts`.
- **Icons**: Exclusively use `phosphor-react-native` (e.g. `ChatCircle`, `CalendarBlank`, `Clock`, `Heart`, etc.).
- **Prohibitions**:
  - NEVER use bare, unstyled `<Text>` or `<Button>` from `react-native`.
  - NEVER use raw ad-hoc hex colors (e.g. `#000`, `#333`, `#f00`). Always use `colors.bgApp`, `colors.pastelYellow`, `colors.statusPresentBg`, etc.

### B. Daycare Admin & Caregiver Portal (`frontend/src/portal/`)
- **Theme**: *Ankelba Emerald Portal*
- **Root Element**: All portal views must reside inside a `<div className="ankelba-portal">` container to inherit CSS custom properties from `frontend/src/portal/portal.css`.
- **Component Imports**: Use shared primitives from `frontend/src/portal/ui.web.tsx` (`<Card>`, `<Button>`, `<Badge>`, `<Icon>`, `<Modal>`, `<RecordForm>`).
- **Color Variables**: Strictly use CSS custom properties (`--cream`, `--cream-soft`, `--navy`, `--green`, `--coral`, `--amber`, `--line`, etc.). The primary daycare brand color is Emerald Green `--green` (`#2d7a58`).
- **Icons**: Use the standardized inline SVG `<Icon name="..." />` component from `ui.web.tsx`.

### C. Platform Super Admin Console (`frontend/src/portal/SuperAdmin.web.tsx`)
- **Theme**: *Ankelba Operator Onyx*
- **Visual Identity**: Shares `.ankelba-portal` styles with distinct operator governance accents:
  - Deep Operator Navy (`#10263B`).
  - Operator Pill Badge: `background: #FCE7EC; color: #BD4264; font-weight: 800; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; border-radius: 999px;`.
  - High-contrast action triggers for approvals, suspension, audit log inspection, and tenant lifecycle actions.

---

## 2. Universal Design Constants & Typography

1. **Font Family**: All tiers strictly use the `Quicksand` typeface (`Quicksand_400Regular`, `Quicksand_500Medium`, `Quicksand_600SemiBold`, `Quicksand_700Bold`).
2. **Warm Aesthetic**: Every screen starts from a warm cream base (`#FFFBED` on mobile, `--cream-soft: #fbf9f4` on web) rather than sterile cold blue or default browser gray.
3. **Card Radii**: Card surfaces must use generous rounded corners (`24px` on mobile `radii.card`, `18px` to `24px` on web `--radius-lg` / `--radius-xl`).
4. **Pill Buttons & Badges**: Action buttons and status indicators must use fully rounded pill geometry (`9999px` radius).

---

## 3. Accessibility & Usability (WCAG 2.2 AA)

1. **Touch Targets**: All mobile buttons, icon triggers, and interactive elements must have a minimum touch target size of 44x44px.
2. **Contrast**: Ensure high contrast for all text (e.g., `#061224` on cream or white). Never put light gray text on light backgrounds.
3. **Focus States**: On web portals, keep `:focus-visible` outline rings intact for full keyboard accessibility.
4. **Modal Dialogs**: Modals must support keyboard escape closing, backdrop dismissal, and focus trapping.

---

## 4. Session & Storage Isolation

All UI modifications must preserve the storage boundaries defined in `.agents/rules/session_isolation.md`:
- Super Admin components must ONLY use `operatorApi` and `ankelba_operator_token`.
- Daycare Admin & Caregiver views must ONLY use `portalApi` and `ankelba_portal_token`.
- Parent mobile screens must ONLY use `apiClient` and `ankelba_auth_token`.

For detailed token tables, code templates, and component examples, activate and inspect the skill:
`.agents/skills/ankelba-ui-styling/SKILL.md`.
