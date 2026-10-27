# Completeness repair plan — 22 October 2026

## Phase 1 — essential security and reliability (current)

1. Separate tenant database credentials from authentication/platform credentials. Refuse unsafe runtime roles at server startup; verify RLS fails closed without a tenant and isolates concurrent requests.
2. Keep platform governance out of private daycare workspaces, including service calls and impersonation. Close self-approved subscription renewal and remove its misleading UI action.
3. Reset account-owned frontend state on identity changes and ignore delayed responses from an earlier account. Clear authenticated navigation on session loss.
4. Add forward migrations for fields currently present only in the working database; make operational regression fixtures reproduce the supported schema.
5. Run isolated regression tests, restricted-role HTTP tests, and TypeScript compilation. Preserve existing application data and unrelated local edits.

Acceptance: real runtime credentials are restricted and separate; unscoped tenant reads fail closed; two daycares cannot read/write each other's records; authentication and platform governance still work; admins cannot self-renew; account switches cannot reuse previous account state; essential regression checks pass.

## Phase 2 — complete role journeys and user acceptance

1. Separate parent/admin/caregiver navigation, including restored sessions; complete caregiver report, health, and communication pages.
2. Add announcement details and correct inbox/tab routing, support contact selection, and a real notifications inbox.
3. Persist checkout instructions and notification/reminder settings; accurately describe unavailable digital payments and biometric verification.
4. Add order idempotency and deterministic inventory locking; extend stale-edit protection to events, products, settings, and older profile replacement endpoints.
5. Audit every role's page for loading/error/empty states, responsive layouts, accessibility, and keyboard behavior.
6. Execute role-by-role, two-daycare acceptance journeys, including denied access, reassignment, suspension, simultaneous writes, retries, network failures, logout/login, and multiple devices.

Completion of Phase 1 does not imply full UI acceptance or completion of deferred provider integrations. Record verification and remaining limitations before starting Phase 2.
