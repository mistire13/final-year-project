'use strict';
const FEATURE_POLICY_VERSION = 1;
const FEATURE_KEYS = ['shop', 'business_analytics', 'billing_automation', 'staff_scheduling'];
const PACKAGE_CODES = ['standard', 'premium'];

function catalogFeatures(code) {
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, code === 'premium']));
}

function featureTerms(terms) {
  return {
    feature_policy_version: terms?.feature_policy_version ?? 0,
    features: terms?.features ?? catalogFeatures(terms?.code),
  };
}

function sameFeatureTerms(a, b) {
  return (
    FEATURE_KEYS.every((key) => featureTerms(a).features[key] === featureTerms(b).features[key]) &&
    featureTerms(a).feature_policy_version === featureTerms(b).feature_policy_version
  );
}

function effectiveFeatures(row, now = Date.now()) {
  const hasTerms = !!row?.subscription_terms;
  const rawCode = hasTerms ? row.subscription_terms?.code : row?.subscription_plan;
  const code = PACKAGE_CODES.includes(rawCode) ? rawCode : 'standard';
  const end = row?.subscription_ends_at;
  const endMs = end ? Date.parse(end) : NaN;
  const validStatus = !!row && row.status === 'active' && !row.deleted_at;
  const validTermCode = !hasTerms || PACKAGE_CODES.includes(row.subscription_terms?.code);
  const subStatusOk =
    !row?.subscription_status ||
    ['active', 'cancelled'].includes(row.subscription_status) ||
    (row.subscription_status === 'trialing' && !row.trial_ends_at);
  const active =
    validStatus &&
    validTermCode &&
    subStatusOk &&
    (end ? Number.isFinite(endMs) && endMs > now : !hasTerms);
  const defaults = catalogFeatures(code);
  const accepted = row?.subscription_terms?.features;
  const features = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, active && defaults[key] && (!accepted || accepted[key] === true)])
  );
  if (active && code === 'standard' && Date.parse(row?.legacy_shop_access_until) > now) {
    features.shop = true;
  }
  return {
    features,
    active,
    package_code: code,
    package_name: code === 'premium' ? 'Plus' : 'Standard',
    expires_at: end || null,
    feature_policy_version: FEATURE_POLICY_VERSION,
  };
}

async function getDaycareFeatures(client, daycareId) {
  if (!Number.isSafeInteger(Number(daycareId)) || Number(daycareId) <= 0) return effectiveFeatures(null);
  const row = (
    await client.query(
      'SELECT to_jsonb(d) AS row FROM daycares d WHERE id=$1 FOR SHARE',
      [daycareId]
    )
  ).rows[0]?.row;
  return effectiveFeatures(row);
}

async function requireFeature(client, daycareId, key) {
  const result = await getDaycareFeatures(client, daycareId);
  if (!FEATURE_KEYS.includes(key) || !result.features[key]) {
    throw Object.assign(new Error('This feature requires an active Plus subscription.'), {
      statusCode: 403,
      code: 'FEATURE_NOT_INCLUDED',
      feature: key,
    });
  }
  return result;
}

/**
 * Express middleware enforcing that the caller belongs to an active daycare
 * whose paid subscription currently includes the requested Plus feature.
 */
function requirePackageFeature(key, pool = require('../../config/db')) {
  return async (req, res, next) => {
    try {
      if (
        !req.user ||
        req.user.is_impersonating ||
        !Number.isSafeInteger(Number(req.user.daycare_id)) ||
        Number(req.user.daycare_id) <= 0
      ) {
        return res.status(403).json({
          error: 'An active daycare account is required.',
          code: 'FEATURE_NOT_INCLUDED',
          feature: key,
        });
      }
      await requireFeature(pool, req.user.daycare_id, key);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  FEATURE_POLICY_VERSION,
  FEATURE_KEYS,
  PACKAGE_CODES,
  catalogFeatures,
  featureTerms,
  sameFeatureTerms,
  effectiveFeatures,
  getDaycareFeatures,
  requireFeature,
  requirePackageFeature,
};
