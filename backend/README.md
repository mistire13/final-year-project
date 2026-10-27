# Ankelba Backend

> Parent Communication and Child Activity Reporting Platform for Daycare Centers  
> **HiLCoE — School of Computer Science and Technology, Senior Project 2026**

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Express.js |
| Database | PostgreSQL 15+ |
| Migrations | Knex.js |
| Auth | JWT (HttpOnly cookie) |
| Validation | Joi |
| Logging | Winston + Morgan |
| Password Hashing | bcryptjs |

---

## Project Structure

```
backend/
├── src/
│   ├── config/          # db.js (pg pool), logger.js, knexfile.js
│   ├── middleware/       # auth.js, rbac.js, errorHandler.js, validator.js
│   ├── modules/
│   │   ├── auth/         # login, logout, /me (FULLY IMPLEMENTED)
│   │   ├── users/        # admin user CRUD (FULLY IMPLEMENTED)
│   │   ├── children/     # child profiles, guardian links (SPRINT 1)
│   │   ├── attendance/   # check-in/out (PHASE 2)
│   │   ├── reports/      # daily activity reports (PHASE 2)
│   │   ├── health/       # health & incidents (PHASE 2)
│   │   ├── communication/# messages, announcements, alerts (PHASE 2)
│   │   ├── ai-guide/     # AI parent guide (TBD-03 STUB)
│   │   ├── biometric/    # guardian verification (TBD-01 STUB)
│   │   ├── store/        # products & orders (PHASE 3)
│   │   ├── payments/     # Chapa + Pay at Daycare (TBD-02 STUB)
│   │   ├── events/       # events calendar (PHASE 3)
│   │   └── audit/        # audit logs (PHASE 4)
│   └── db/
│       ├── migrations/   # 010 Knex migration files
│       └── seeds/        # test data (NFR-TST-02)
├── .env                  # NEVER commit — see .env.example
├── .env.example          # template with all required variables
└── server.js             # entry point
```

---

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 15+

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your local PostgreSQL credentials
```

### 3. Create the PostgreSQL database

```sql
-- Run in psql as superuser:
CREATE DATABASE ankelba_dev;
```

Or via psql CLI:
```bash
psql -U postgres -c "CREATE DATABASE ankelba_dev;"
```

### 4. Run migrations

```bash
npx knex migrate:latest --knexfile src/config/knexfile.js
```

This applies the schema migrations in dependency order. Migration
`012a_profile_complete_prerequisite.js` provides the onboarding column required by
013, so fresh databases do not need the old manual `migrate_profile_complete.js`
script. Existing onboarding values are preserved.

Before starting the server, set separate `APP_DB_USER` / `APP_DB_PASSWORD` and
`CONTROL_DB_USER` / `CONTROL_DB_PASSWORD` credentials in `.env` (independent
passwords of at least 24 characters), then run:

```bash
npm run db:runtime:setup
```

`DB_USER` / `DB_PASSWORD` are migration credentials only. Server startup refuses
superuser/RLS-bypass runtime credentials or a login that holds both runtime roles.
Run `npm run test:essentials` for the security and reliability regressions. See
[Phase 1 verification](../docs/PHASE_1_ESSENTIALS_VERIFICATION.md) for changes and
the remaining Phase 2 work.

To verify fresh setup, legacy upgrades and targeted rollback in separate,
automatically removed local test databases:

```bash
npm run test:foundation
```

The test account needs permission to create databases. See the
[setup repair notes](../docs/FOUNDATION_BATCH_2_SETUP.md) for the verification
boundary and the compatibility migration's intentionally non-destructive rollback.

The next backend authentication checkpoint can be verified separately with
`npm run test:daycare-auth`. Its development/test preview is disabled by default;
the current frontend and login stay unchanged until a coordinated update. See
[authentication checkpoint 1](../docs/AUTH_CHECKPOINT_1.md) for its contract,
verification results and activation boundary.

[Authentication checkpoint 2](../docs/AUTH_CHECKPOINT_2.md) extends that preview
with daycare-scoped password recovery through an encrypted local test inbox,
mandatory administrator/owner MFA and separate platform authentication. It also
documents encryption configuration, `npm run auth:inbox`, the explicit first-owner
bootstrap command and `npm run test:auth-security`. This remains default-off;
the current frontend and configured application database have not been activated
or migrated by these checkpoints.

### 5. Seed test data

```bash
npx knex seed:run --knexfile src/config/knexfile.js
```

Inserts:
- 3 roles (admin, caregiver, parent)
- 3 test user accounts (one per role)

**Test credentials (dev/test only):**

| Email | Password | Role |
|---|---|---|
| admin@ankelba.dev | Admin@123! | admin |
| caregiver@ankelba.dev | Care@123! | caregiver |
| parent@ankelba.dev | Parent@123! | parent |

### 6. Start the development server

```bash
npm run dev
```

Server runs at `http://localhost:5000`

---

## API Routes

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Authenticated |
| GET | `/api/auth/me` | Authenticated |
| GET | `/api/users` | Admin |
| POST | `/api/users` | Admin |
| GET/PATCH | `/api/users/:id` | Admin |
| GET/POST | `/api/children` | Role-based |
| GET/POST | `/api/attendance` | Admin, Caregiver |
| GET/POST | `/api/reports/daily` | Role-based |
| GET/POST | `/api/health` | Role-based |
| GET/POST | `/api/announcements` | Role-based |
| GET/POST | `/api/messages` | Authenticated |
| GET/POST | `/api/alerts` | Role-based |
| POST | `/api/ai/guide` | Parent |
| POST | `/api/biometric/enroll` | Admin |
| GET/POST | `/api/store/products` | Role-based |
| GET/POST | `/api/store/orders` | Role-based |
| GET/POST | `/api/events` | Role-based |
| GET | `/api/audit` | Admin |

---

## Migration Reference

| File | Tables |
|---|---|
| 001_lookup_tables | roles, product_categories, groups |
| 002_core_identity | users, children, emergency_contacts, care_instructions, guardian_links |
| 003_attendance | attendance |
| 004_reporting | daily_reports, report_meals, report_activities, health_records |
| 005_communication | announcements, messages, alerts |
| 006_events | events |
| 007_biometric | biometric_references, guardian_verification_events |
| 008_ecommerce | products, orders, order_items, payments |
| 009_audit | audit_logs |
| 010_indexes | 50+ custom indexes (partial, composite, GIN) |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | Yes | Server port (default: 5000) |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port (default: 5432) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Migration/provisioning database user |
| `DB_PASSWORD` | Yes | Migration/provisioning password |
| `APP_DB_USER` / `APP_DB_PASSWORD` | Yes | Restricted tenant runtime login |
| `CONTROL_DB_USER` / `CONTROL_DB_PASSWORD` | Yes | Separate authentication/platform runtime login |
| `JWT_SECRET` | Yes | Strong random secret (64+ chars) |
| `JWT_EXPIRES_IN` | Yes | JWT lifetime (e.g., `24h`) |
| `FRONTEND_URL` | Yes | CORS allowed origin |
| `AI_API_KEY` | No | AI provider key (TBD-03) |
| `CHAPA_SECRET_KEY` | No | Chapa payment key (TBD-02) |
| `CHAPA_WEBHOOK_SECRET` | No | Chapa webhook verification secret |

---

## Implementation Phases

| Phase | Modules | Target |
|---|---|---|
| Foundation | auth ✅, users ✅, children (Sprint 1) | Sep 27 – Oct 10 |
| Core Daycare | attendance, reports, health, communication | Phase 2 |
| Extended | events, store, AI guide | Phase 3 |
| Advanced | payments, biometric, audit | Phase 4 |

---

## TBD Items (Advisor Confirmation Required)

| ID | Item |
|---|---|
| TBD-01 | Biometric device modality and integration API |
| TBD-02 | Chapa payment gateway (sandbox vs. live) |
| TBD-03 | AI provider and data-minimization design |
| TBD-04 | Activity photo sharing |
| TBD-05 | Notification delivery (in-app only vs. email/SMS) |
| TBD-06 | Caregiver-to-child assignment rules |

---

*SRS v1.0 · Backend Architecture Plan v2.0 · Ankelba Project, HiLCoE 2026*
