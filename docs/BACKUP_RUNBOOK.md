# Ankelba Platform — Database Backup & Disaster Recovery Runbook

**SRS Reference Alignment:**
- **FR-DB-06**: The system shall support creation of database backups as part of deployment and operational preparation.
- **FR-DB-07**: The project shall test that a backup can be restored in the selected pilot/deployment environment.
- **AC-13**: A backup and restore procedure for the selected database environment is demonstrated.
- **Section 6.4**: Operational backup and recovery guidelines, access restrictions, and verifiable recovery testing.

---

## 1. System Context & Architecture Overview

Ankelba uses PostgreSQL as its centralized relational database. The database stores:
1. **Multi-Tenant Operational Data**: Daycares, staff users, parent accounts, child profiles, groups, attendance records, daily activity reports, health records, incident reports, and emergency contacts.
2. **Platform Governance & Onboarding**: Super administrator accounts, prospective daycare applications, audit logs, and security challenges.
3. **Subscription Ledger & Financial Audit**: Subscription plans, packages, immutable payment references (`subscription_payment_references`), payment intents, manual reviews, and resolutions.
4. **Tenant Isolation Model**: Row-Level Multi-Tenancy (`daycare_id`) reinforced by runtime roles:
   - `ankelba_tenant_app`: Application role restricted to tenant data.
   - `ankelba_control_app`: Control/governance role restricted to pre-tenant authentication and global platform administration.
   - Cluster Administrator (`postgres`): Superuser utilized exclusively for database provisioning, migrations, and disaster recovery backups.

---

## 2. Security & Operational Access Controls

1. **Role Separation**:
   - Application connections (`ankelba_tenant_app`, `ankelba_control_app`) MUST NEVER be granted `SUPERUSER`, `BYPASSRLS`, or backup-generation privileges.
   - Database dumps must be created and restored exclusively by authorized technical personnel using administrative credentials (`postgres` or a dedicated backup operator role).
2. **Credential Protection**:
   - Never hardcode database passwords in shell history, cron files, or repository code.
   - Use standard PostgreSQL `.pgpass` file (with `0600` permissions on Unix or user-isolated ACLs on Windows) or ephemeral environment variables (`PGPASSWORD`).
3. **Artifact Protection & Encryption**:
   - Backup files contain sensitive operational data (including hashed passwords and child care records).
   - Backup directories must be restricted with file system permissions `0700` (directory) and `0600` (files).
   - In cloud and pilot environments, backups must be encrypted at rest (AES-256 or GPG).

---

## 3. Operational Backup Procedures

### 3.1 Recommended Method: PostgreSQL Custom Format Dump (`-Fc`)

The custom archive format (`-Fc`) is compressed by default, supports flexible schema/data selection, and enables multi-threaded restoration with `pg_restore`.

#### Command:
```bash
# Set credentials safely in the current subshell
export PGHOST="localhost"
export PGPORT="5432"
export PGUSER="postgres"
export PGDATABASE="ankelba_dev"
export BACKUP_DIR="/var/backups/ankelba"
export TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
export BACKUP_FILE="${BACKUP_DIR}/ankelba_backup_${TIMESTAMP}.dump"

# Ensure target directory exists and has restricted permissions
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# Execute full database backup with blob contents and verbose logging
pg_dump \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --format=custom \
  --blobs \
  --verbose \
  --file="${BACKUP_FILE}" \
  "${PGDATABASE}"

# Protect the generated dump file
chmod 600 "${BACKUP_FILE}"
```

### 3.2 Plaintext SQL Dump (Inspection & Rehearsal)

For schema inspection, manual auditing, or migration rehearsal, a plaintext SQL dump can be generated:

```bash
pg_dump \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_DIR}/ankelba_backup_${TIMESTAMP}.sql" \
  "${PGDATABASE}"
```

---

## 4. Disaster Recovery & Restoration Procedures

### 4.1 Target Environment Preparation

When restoring into a disaster-recovery instance, pilot replacement, or staging environment:

1. Terminate active application connections to the target database:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'ankelba_recovery' AND pid <> pg_backend_pid();
   ```

2. Drop and recreate a clean target database:
   ```bash
   dropdb --if-exists -h localhost -p 5432 -U postgres ankelba_recovery
   createdb -h localhost -p 5432 -U postgres -E UTF8 ankelba_recovery
   ```

### 4.2 Executing Restoration (`pg_restore`)

Restore from the custom format dump:

```bash
pg_restore \
  --host="localhost" \
  --port="5432" \
  --username="postgres" \
  --dbname="ankelba_recovery" \
  --no-owner \
  --clean \
  --if-exists \
  --verbose \
  "${BACKUP_FILE}"
```

*Note on `--no-owner`: Prevents permission failures if restoring to a system with differing cluster owner usernames.*

### 4.3 Re-establishing Multi-Tenant Runtime Roles

After the database schema and rows are restored, runtime access roles must be synchronized:

```bash
cd backend
npm run db:runtime:setup
```

This verifies that:
- `ankelba_tenant_app` exists and is assigned to the `ankelba_tenant` group.
- `ankelba_control_app` exists and is assigned to the `ankelba_control` group.
- Group-level row permissions and RLS policies are active.

---

## 5. Post-Restore Verification Checklist

Execute the following verification checklist before pointing web services or mobile APIs to the restored database:

| Step | Verification Check | Command / Query | Expected Result |
| :--- | :--- | :--- | :--- |
| **1** | Core Tables Exist | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` | Matches table inventory (> 45 tables) |
| **2** | Daycare Records | `SELECT count(*), count(status) FROM daycares` | Positive count; matches pre-backup census |
| **3** | User Accounts | `SELECT count(*), count(DISTINCT email) FROM users` | Unique user emails preserved |
| **4** | Child Profiles | `SELECT count(*) FROM children` | All child records, guardian links intact |
| **5** | Daily Reports & Attendance | `SELECT count(*) FROM daily_reports; SELECT count(*) FROM attendance` | Operational history intact |
| **6** | Subscription Ledger | `SELECT count(*) FROM subscription_payment_references` | Zero missing payment hashes or collisions |
| **7** | Foreign Key Integrity | `SELECT conname, conrelid::regclass FROM pg_constraint WHERE contype = 'f'` | All foreign keys present and validated |
| **8** | Sequence Synchronization | Verify `currval` / `nextval` on serial ID columns | Next insert generates `MAX(id) + 1` |

---

## 6. Retention Schedule & Recovery Objectives (RTO / RPO)

- **Recovery Point Objective (RPO)**:
  - Pilot Phase: <= 24 hours (daily full backup).
  - Production Deployment: <= 1 hour (WAL archiving / PITR continuous archiving).
- **Recovery Time Objective (RTO)**:
  - Pilot Phase: <= 30 minutes from disaster declaration to restored service.
  - Production Deployment: <= 15 minutes automated failover.
- **Retention Policy**:
  - Daily snapshots retained for 7 days.
  - Weekly snapshots retained for 4 weeks.
  - Monthly archives retained for 12 months.
  - Monthly backups are verified via the automated restore test (`npm run db:backup:verify`).

---

## 7. Automated Backup Verification Script

The platform includes an automated end-to-end backup and restore test suite (`backend/scripts/verify-backup.cjs`).

### Running the Automated Verification:
```bash
cd backend
npm run db:backup:verify
```

### What the Verification Script Executes:
1. Connects to the active database using credentials in `backend/.env`.
2. Inspects and snapshots core table counts and schema constraints.
3. Automatically creates a dump of the database (using `pg_dump` binary or built-in SQL streamer).
4. Creates a temporary, isolated target database (`ankelba_backup_restore_test_<timestamp>`).
5. Restores the dump into the temporary database.
6. Re-verifies all tables, row counts, foreign key constraints, primary keys, and subscription ledger integrity.
7. Drops the temporary test database and removes transient dump files.
8. Reports success conforming to **FR-DB-06**, **FR-DB-07**, and **AC-13**.
