---
trigger: always_on
---

# Session Storage & Role Isolation Rules (SRS FR-SUB-05 & FR-UAM-03)

1. **Strictly Isolated LocalStorage Keys**:
   - `ankelba_operator_token`: Platform Operator / Super Admin (`/super-admin`, `/platform`)
   - `ankelba_portal_token`: Daycare Admin & Caregiver Staff (`/admin`, `/staff`, `/caregiver`)
   - `ankelba_auth_token`: Parent / Guardian Mobile App (`/app`, `/parent`)

2. **Never Cross-Contaminate Storage**:
   - `portalTokenStorage` in `frontend/src/portal/api.ts` MUST NEVER read, set, or clear `ankelba_auth_token`.
   - `tokenStorage` in `frontend/src/api/client.ts` MUST NEVER read, set, or clear `ankelba_portal_token`.
   - Operator credentials MUST ONLY be stored in `ankelba_operator_token`.

3. **Routing & Redirection Guards**:
   - Never perform synchronous `window.location.assign` in React Native / Expo components (e.g. `SplashScreen.tsx`) without first ensuring the user's role and storage match.
   - If an Operator or Staff token is encountered in `AuthContext` (the parent app context), it must be routed to its respective storage (`ankelba_operator_token` / `ankelba_portal_token`) and cleared from `ankelba_auth_token` rather than entering an infinite redirect loop.
