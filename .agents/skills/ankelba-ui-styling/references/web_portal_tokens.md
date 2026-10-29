# Ankelba Emerald Portal & Operator Onyx — Web Styling Reference Guide

This reference provides exact CSS variables, UI components, and code patterns for developing web portals:
- **Daycare Admin & Caregivers** (`frontend/src/portal/Portal.web.tsx`, `CaregiverPages.web.tsx`, `DaycareFinances.web.tsx`)
- **Platform Super Admin** (`frontend/src/portal/SuperAdmin.web.tsx`)

---

## 1. CSS Custom Properties (`frontend/src/portal/portal.css`)

```css
:root,
.ankelba-portal {
  /* Warm Backgrounds */
  --cream: #fffcf7;
  --cream-soft: #fbf9f4;
  --cream-card: #ffffff;

  /* Deep Navy Hierarchy */
  --navy: #0f2438;
  --navy-light: #1c3d5a;
  --navy-dark: #081624;

  /* Neutral Text & Borders */
  --muted: #64748b;
  --muted-light: #94a3b8;
  --line: #eae6dc;
  --line-light: #f3f0e8;

  /* Accent Colors */
  --green: #2d7a58;         /* Primary Daycare Emerald */
  --green-hover: #236548;
  --green-soft: #ecfdf5;
  --coral: #e06d53;         /* Warnings & Alerts */
  --coral-soft: #fef2f2;
  --amber: #d97706;         /* Pending / Needs Attention */
  --amber-soft: #fffbeb;
  --sky: #2563eb;           /* Information & Tech Status */
  --sky-soft: #eff6ff;
  --indigo: #4f46e5;
  --indigo-soft: #eef2ff;

  /* Elevation Shadows */
  --shadow-xs: 0 1px 2px rgba(15, 36, 56, 0.04);
  --shadow-sm: 0 2px 6px rgba(15, 36, 56, 0.05);
  --shadow-md: 0 6px 18px -2px rgba(15, 36, 56, 0.07), 0 2px 6px -1px rgba(15, 36, 56, 0.04);
  --shadow-lg: 0 16px 36px -4px rgba(15, 36, 56, 0.1), 0 4px 12px -2px rgba(15, 36, 56, 0.05);
  --shadow-xl: 0 24px 48px -12px rgba(15, 36, 56, 0.18);

  /* Border Radii */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  --transition-normal: 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 2. Standard CSS Utility Classes

- `.ankelba-portal`: Mandatory top-level wrapper class for all portal screens.
- `.p-card`: Clean card container with `background: #ffffff`, soft border, and elevation shadow.
- `.p-button`: Rounded button with micro-motion hover/tap states.
  - Variants: `.primary` (navy/emerald fill), `.secondary` (outlined), `.danger` (coral/red fill), `.ghost` (transparent).
- `.p-badge`: Capsule status indicator with pastel tint background and dark text.
  - Tones: `active`, `pending`, `suspended`, `trial`, `verified`.
- `.p-table`: Tabular data grid with sticky header, muted column titles, and hover row highlighting.
- `.p-modal`: Accessible modal dialog container with dark semi-transparent backdrop.

---

## 3. Super Admin Specific Visual Tokens

When rendering views inside `SuperAdmin.web.tsx`:
1. **Operator Badge Pill**:
   ```tsx
   <span style={{
     display: "inline-block",
     background: "#FCE7EC",
     color: "#BD4264",
     fontWeight: 800,
     fontSize: 11,
     letterSpacing: "1.6px",
     padding: "4px 12px",
     borderRadius: 999,
     textTransform: "uppercase",
   }}>
     Platform operator
   </span>
   ```
2. **Deep Operator Console Background**:
   - Authentication Background: `linear-gradient(145deg, #FFFBED 0%, #F5F1E5 100%)`
   - Dark Floating Toasts: `background: #10263B; color: #FFFFFF; border-radius: 14px;`
3. **Multi-Tenant Governance Grid**:
   - Daycare approval cards with license verification pills, owner contact details, and subscription tier indicators (`trial`, `standard`, `premium`).
   - Audit trail drawer showing timestamp, operator identity, target entity, and IP/action details.

---

## 4. Web Component Imports (`frontend/src/portal/ui.web.tsx`)

```tsx
import {
  Card,
  Button,
  Badge,
  Icon,
  Modal,
  RecordForm,
} from "./ui.web";

// Example Usage
<Card style={{ padding: 24 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <h3>Active Children (34)</h3>
    <Button icon="plus" variant="primary" onClick={() => setModalOpen(true)}>
      Enroll Child
    </Button>
  </div>
</Card>
```
