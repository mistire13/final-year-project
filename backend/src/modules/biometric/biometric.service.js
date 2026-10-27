'use strict';
/**
 * src/modules/biometric/biometric.service.js
 * Business logic for Biometric Enrollment & Guardian Verification.
 * SRS Refs: FR-BIO-01–10, FR-AUD-03
 */
const db = require('../../config/db');
const { auditedWrite } = require('../../utils/auditedWrite');

/**
 * Enroll biometric reference for an authorized adult guardian link (Admin only).
 */
const enroll = async (body, user) => {
  const linkId = parseInt(body.guardian_link_id, 10);
  const daycareId = user?.daycare_id || null;
  if (!daycareId || user?.role !== 'admin') {
    throw Object.assign(new Error('Daycare administrator required'), { statusCode: 403 });
  }

  return auditedWrite(user, 'BIOMETRIC_ENROLLED', 'biometric_references', async client => {
  // 1. Verify guardian link exists with child tenant and guardian user status
  const { rows: linkRows } = await client.query(
    `SELECT gl.id, gl.user_id, gl.child_id, gl.pickup_authorized, c.daycare_id, u.status AS user_status
     FROM guardian_links gl
     JOIN children c ON c.id = gl.child_id
     JOIN users u ON u.id = gl.user_id
     WHERE gl.id = $1 FOR UPDATE OF gl,u`,
    [linkId]
  );

  if (linkRows.length === 0) {
    const err = new Error('Guardian link not found');
    err.statusCode = 404;
    throw err;
  }

  const link = linkRows[0];

  if (link.daycare_id !== daycareId) {
    const err = new Error('Guardian link not found');
    err.statusCode = 404;
    throw err;
  }

  if (!link.pickup_authorized) {
    const err = new Error('Guardian is not authorized for child pickup');
    err.statusCode = 400;
    throw err;
  }

  if (link.user_status !== 'active') {
    const err = new Error('Guardian user account is not active');
    err.statusCode = 400;
    throw err;
  }

  // 2. Upsert biometric reference
  const { rows } = await client.query(
    `INSERT INTO biometric_references (guardian_link_id, user_id, reference_data, enrolled_by, active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (guardian_link_id)
     DO UPDATE SET reference_data = EXCLUDED.reference_data, enrolled_by = EXCLUDED.enrolled_by, active = TRUE, enrolled_at = NOW()
     RETURNING *`,
    [linkId, link.user_id, body.reference_data, user.id]
  );

  return rows[0];
  }, { guardian_link_id: linkId }, daycareId);
};

/**
 * Verify guardian identity during child pickup (Admin / Caregiver).
 * Records verification event in audit log (FR-AUD-03).
 */
const verify = async () => {
 const error=new Error('Use the front-desk pickup flow. Standalone biometric verification is unavailable until the device provider is configured.'); error.statusCode=503; throw error;
};

/**
 * Get active biometric reference for a guardian link.
 */
const getGuardianBiometric = async (guardianLinkIdParam, user = null) => {
  const linkId = parseInt(guardianLinkIdParam, 10);
  const daycareId = user?.daycare_id || null;
  if (!daycareId || user?.role !== 'admin') {
    throw Object.assign(new Error('Daycare administrator required'), { statusCode: 403 });
  }

  const { rows } = await db.query(
    `SELECT br.id, br.guardian_link_id, br.user_id, br.enrolled_at, br.active,
            u.name AS guardian_name, c.daycare_id
     FROM biometric_references br
     JOIN users u ON u.id = br.user_id
     JOIN guardian_links gl ON gl.id = br.guardian_link_id
     JOIN children c ON c.id = gl.child_id
     WHERE br.guardian_link_id = $1 AND br.active = TRUE`,
    [linkId]
  );

  if (rows.length === 0) {
    const err = new Error('No active biometric reference enrolled for this guardian link');
    err.statusCode = 404;
    throw err;
  }

  const bio = rows[0];
  if (bio.daycare_id !== daycareId) {
    const err = new Error('No active biometric reference enrolled for this guardian link');
    err.statusCode = 404;
    throw err;
  }

  return bio;
};

module.exports = {
  enroll,
  verify,
  getGuardianBiometric,
};
