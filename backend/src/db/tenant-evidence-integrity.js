'use strict';

// Preflight uses the original columns so it can run before migration 035.
// Results contain counts only; never include identity or biometric content.
const checks = [
  ['guardian_links', 'created_by', `FROM guardian_links g JOIN users u ON u.id=g.created_by
    WHERE g.daycare_id IS DISTINCT FROM u.daycare_id`],
  ['biometric_references', 'user_id', `FROM biometric_references b JOIN guardian_links g ON g.id=b.guardian_link_id
    WHERE b.user_id<>g.user_id`],
  ['biometric_references', 'enrolled_by', `FROM biometric_references b JOIN guardian_links g ON g.id=b.guardian_link_id
    JOIN users u ON u.id=b.enrolled_by WHERE g.daycare_id IS DISTINCT FROM u.daycare_id`],
  ['guardian_verification_events', 'verified_by', `FROM guardian_verification_events v JOIN children c ON c.id=v.child_id
    JOIN users u ON u.id=v.verified_by WHERE c.daycare_id IS DISTINCT FROM u.daycare_id`],
  ['guardian_verification_events', 'guardian_user_id', `FROM guardian_verification_events v JOIN children c ON c.id=v.child_id
    JOIN users u ON u.id=v.guardian_user_id WHERE c.daycare_id IS DISTINCT FROM u.daycare_id`],
  ['guardian_verification_events', 'attendance_id', `FROM guardian_verification_events v JOIN attendance a ON a.id=v.attendance_id
    WHERE v.child_id<>a.child_id`],
  ['audit_logs', 'actor_id', `FROM audit_logs a JOIN users u ON u.id=a.actor_id
    WHERE u.daycare_id IS DISTINCT FROM a.daycare_id
    AND NOT(u.role_id=0 AND u.daycare_id IS NULL AND a.target_table IN ('daycares','subscription_packages'))`],
];

async function inspectEvidence(query) {
  const findings = [];
  for (const [table, column, sql] of checks) {
    const { rows: [row] } = await query(`SELECT count(*)::int AS count ${sql}`);
    if (row.count) findings.push({ table, column, problem: 'tenant_relationship', count: row.count });
  }
  return findings;
}
module.exports = { inspectEvidence };
