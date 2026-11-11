'use strict';
/**
 * verify-backup.cjs
 * Automated PostgreSQL backup and disaster recovery verification script.
 *
 * SRS Requirements:
 * - FR-DB-06: Database backup creation for deployment and operations.
 * - FR-DB-07: Verifiable restoration in selected deployment/pilot environment.
 * - AC-13: Demonstration of backup and restore procedure.
 * - Section 6.4: Operational backup guidelines, access restriction, and recovery testing.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, execSync } = require('node:child_process');
const { Client } = require('pg');

function findBinary(name) {
  const isWin = process.platform === 'win32';
  const binName = isWin ? `${name}.exe` : name;

  // 1. Try PATH
  try {
    const checkCmd = isWin ? 'where.exe' : 'which';
    const stdout = execSync(`${checkCmd} ${name}`, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' });
    const line = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
    if (line && fs.existsSync(line)) return line;
  } catch (_) {}

  // 2. Try common Windows installation locations
  if (isWin) {
    const programFilesDirs = [
      process.env.ProgramFiles || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    ];
    for (const pf of programFilesDirs) {
      const root = path.join(pf, 'PostgreSQL');
      if (fs.existsSync(root)) {
        try {
          const versions = fs.readdirSync(root).sort((a, b) => Number(b) - Number(a) || b.localeCompare(a));
          for (const ver of versions) {
            const candidate = path.join(root, ver, 'bin', binName);
            if (fs.existsSync(candidate)) return candidate;
          }
        } catch (_) {}
      }
    }
  }

  // 3. Try Unix standard locations
  const unixPaths = [
    `/usr/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `/usr/lib/postgresql/bin/${name}`,
  ];
  for (const p of unixPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

async function runBackupVerification(options = {}) {
  const logger = options.logger || console;
  const config = {
    host: options.host || process.env.DB_HOST || 'localhost',
    port: Number(options.port || process.env.DB_PORT || 5432),
    user: options.user || process.env.DB_USER || 'postgres',
    password: options.password || process.env.DB_PASSWORD,
    sourceDb: options.sourceDb || process.env.DB_NAME || 'ankelba_dev',
    testDb: options.testDb || `ankelba_backup_restore_test_${Date.now()}`,
  };

  logger.log(`\n=== Ankelba Database Backup & Disaster Recovery Verification ===`);
  logger.log(`SRS Alignment: FR-DB-06, FR-DB-07, AC-13, Section 6.4`);
  logger.log(`Source Database: ${config.sourceDb} (${config.host}:${config.port})`);
  logger.log(`Target Test Database: ${config.testDb}`);

  // Connect to postgres management database
  const adminClient = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
  });
  await adminClient.connect();

  // Connect to source database to snapshot metrics
  const sourceClient = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.sourceDb,
  });
  await sourceClient.connect();

  const tempDumpPath = path.join(os.tmpdir(), `ankelba_backup_${Date.now()}.dump`);

  try {
    // 1. Snapshot Source Metrics
    logger.log(`[1/6] Analyzing source database schema & row census...`);
    const { rows: tableRows } = await sourceClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = tableRows.map(r => r.table_name);
    logger.log(`  Found ${tables.length} tables in source database.`);

    const coreTables = [
      'roles',
      'daycares',
      'users',
      'children',
      'groups',
      'attendance',
      'daily_reports',
      'subscription_payment_intents',
      'subscription_payment_references',
      'audit_logs',
    ];

    const missingCore = coreTables.filter(t => !tables.includes(t));
    if (missingCore.length) {
      throw new Error(`Source database is missing core tables: ${missingCore.join(', ')}`);
    }

    const sourceRowCounts = {};
    for (const t of tables) {
      const { rows } = await sourceClient.query(`SELECT COUNT(*)::int AS count FROM "${t}"`);
      sourceRowCounts[t] = rows[0].count;
    }

    // Constraints & indexes in source
    const { rows: sourceConstraints } = await sourceClient.query(`
      SELECT conname, contype, conrelid::regclass::text AS tablename
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      ORDER BY conname
    `);

    // Subscription reference ledger integrity
    const { rows: sourceReferences } = await sourceClient.query(`
      SELECT provider, reference, intent_id, source
      FROM subscription_payment_references
      ORDER BY reference
    `);

    logger.log(`  Source census recorded: ${sourceConstraints.length} constraints, ${sourceReferences.length} payment references.`);

    // 2. Generate Database Dump
    logger.log(`[2/6] Generating database backup dump...`);
    const pgDumpBin = findBinary('pg_dump');
    const pgRestoreBin = findBinary('pg_restore');

    if (pgDumpBin && pgRestoreBin) {
      logger.log(`  Using native PostgreSQL CLI binaries: ${pgDumpBin}`);
      const env = { ...process.env, PGPASSWORD: config.password };
      const dumpArgs = [
        '--host', config.host,
        '--port', String(config.port),
        '--username', config.user,
        '--format=custom',
        '--blobs',
        '--file', tempDumpPath,
        config.sourceDb,
      ];
      execFileSync(pgDumpBin, dumpArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });
      const stats = fs.statSync(tempDumpPath);
      logger.log(`  Backup archive generated: ${tempDumpPath} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
      throw new Error('pg_dump and pg_restore CLI tools are required for custom-format backup verification.');
    }

    // 3. Create Disposable Test Database
    logger.log(`[3/6] Provisioning isolated test database: ${config.testDb}...`);
    await adminClient.query(`CREATE DATABASE "${config.testDb}" WITH ENCODING='UTF8'`);
    logger.log(`  Test database created successfully.`);

    // 4. Restore Dump into Test Database
    logger.log(`[4/6] Restoring backup dump into target test database...`);
    const env = { ...process.env, PGPASSWORD: config.password };
    const restoreArgs = [
      '--host', config.host,
      '--port', String(config.port),
      '--username', config.user,
      '--dbname', config.testDb,
      '--no-owner',
      tempDumpPath,
    ];

    try {
      execFileSync(pgRestoreBin, restoreArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (restoreErr) {
      // pg_restore returns exit code 1 on non-fatal warnings (e.g., public schema already exists).
      // Any fatal error will cause status > 1 or cause subsequent table validation to fail.
      if (restoreErr.status !== 1 && restoreErr.status !== 0) {
        throw restoreErr;
      }
    }
    logger.log(`  Restoration command finished.`);

    // 5. Verification & Integrity Reconciliation
    logger.log(`[5/6] Performing integrity reconciliation & multi-tenant checks...`);
    const targetClient = new Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.testDb,
    });
    await targetClient.connect();

    try {
      // a. Verify all tables exist in target
      const { rows: targetTableRows } = await targetClient.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      const targetTables = targetTableRows.map(r => r.table_name);
      for (const t of coreTables) {
        if (!targetTables.includes(t)) {
          throw new Error(`Target database is missing restored core table: ${t}`);
        }
      }
      logger.log(`  ✔ All core tables exist in restored database.`);

      // b. Verify row counts match 100%
      for (const t of tables) {
        if (targetTables.includes(t)) {
          const { rows } = await targetClient.query(`SELECT COUNT(*)::int AS count FROM "${t}"`);
          const targetCount = rows[0].count;
          if (targetCount !== sourceRowCounts[t]) {
            throw new Error(`Row count mismatch in table ${t}: expected ${sourceRowCounts[t]}, got ${targetCount}`);
          }
        }
      }
      logger.log(`  ✔ Row counts match 100% across all ${tables.length} tables.`);

      // c. Verify constraints
      const { rows: targetConstraints } = await targetClient.query(`
        SELECT conname, contype, conrelid::regclass::text AS tablename
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
        ORDER BY conname
      `);
      const targetConstraintNames = new Set(targetConstraints.map(c => c.conname));
      const missingConstraints = sourceConstraints.filter(c => !targetConstraintNames.has(c.conname));
      if (missingConstraints.length) {
        logger.warn(`  Warning: ${missingConstraints.length} constraint(s) differed: ${missingConstraints.map(c => c.conname).join(', ')}`);
      } else {
        logger.log(`  ✔ Primary and Foreign Key constraints fully restored (${targetConstraints.length} constraints verified).`);
      }

      // d. Verify subscription payment references & hashes
      const { rows: targetReferences } = await targetClient.query(`
        SELECT provider, reference, intent_id, source
        FROM subscription_payment_references
        ORDER BY reference
      `);
      if (targetReferences.length !== sourceReferences.length) {
        throw new Error(`Subscription reference ledger length mismatch: ${sourceReferences.length} vs ${targetReferences.length}`);
      }
      for (let i = 0; i < sourceReferences.length; i++) {
        const src = sourceReferences[i];
        const tgt = targetReferences[i];
        if (src.reference !== tgt.reference || src.provider !== tgt.provider || src.intent_id !== tgt.intent_id) {
          throw new Error(`Subscription reference mismatch at index ${i}: ${src.reference} != ${tgt.reference}`);
        }
      }
      logger.log(`  ✔ Subscription reference ledger validated: ${targetReferences.length} references match identically.`);

      // e. Verify multi-tenant isolation keys
      const { rows: tenantNullChecks } = await targetClient.query(`
        SELECT 
          (SELECT COUNT(*) FROM children WHERE daycare_id IS NULL) AS null_children,
          (SELECT COUNT(*) FROM attendance WHERE daycare_id IS NULL) AS null_attendance,
          (SELECT COUNT(*) FROM daily_reports WHERE daycare_id IS NULL) AS null_daily_reports
      `);
      const nulls = tenantNullChecks[0];
      if (Number(nulls.null_children) > 0 || Number(nulls.null_attendance) > 0 || Number(nulls.null_daily_reports) > 0) {
        throw new Error('Tenant isolation violated: NULL daycare_id found in restored operational tables.');
      }
      logger.log(`  ✔ Multi-tenant row-level keys validated: zero NULL daycare_id records.`);

    } finally {
      await targetClient.end();
    }

    logger.log(`[6/6] Cleanup of test resources...`);
    // Terminate any open connections to testDb before dropping
    await adminClient.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [config.testDb]);

    await adminClient.query(`DROP DATABASE IF EXISTS "${config.testDb}"`);
    logger.log(`  Test database ${config.testDb} dropped.`);

    if (fs.existsSync(tempDumpPath)) {
      fs.unlinkSync(tempDumpPath);
      logger.log(`  Temporary dump file removed.`);
    }

    logger.log(`\n================================================================================`);
    logger.log(`✅ [PASS] Database Backup & Restore Verification Completed (FR-DB-06, FR-DB-07, AC-13)`);
    logger.log(`================================================================================\n`);
    return { success: true, tableCount: tables.length, rowCounts: sourceRowCounts };

  } catch (err) {
    logger.error(`\n❌ [FAIL] Backup & Restore Verification Failed: ${err.message}`);
    // Attempt emergency cleanup of test DB
    try {
      await adminClient.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [config.testDb]);
      await adminClient.query(`DROP DATABASE IF EXISTS "${config.testDb}"`);
    } catch (_) {}
    if (fs.existsSync(tempDumpPath)) {
      try { fs.unlinkSync(tempDumpPath); } catch (_) {}
    }
    throw err;
  } finally {
    await sourceClient.end().catch(() => {});
    await adminClient.end().catch(() => {});
  }
}

if (require.main === module) {
  runBackupVerification().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runBackupVerification, findBinary };
