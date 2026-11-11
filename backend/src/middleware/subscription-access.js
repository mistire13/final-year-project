'use strict';

// Subscription expiry must not prevent the actions needed to care for a child.
// Authentication, role checks, and tenant isolation still apply to every route.
const safeWrites = [
  // Existing financial obligations and reminder preferences remain manageable.
  ['PATCH', /^\/api\/store\/orders\/\d+\/status\/?$/],
  ['POST', /^\/api\/store\/orders\/\d+\/refund\/?$/],
  ['POST', /^\/api\/finances\/invoices\/\d+\/payments\/?$/],
  ['PUT', /^\/api\/daycare-payments\/settings\/?$/],
  ['POST', /^\/api\/daycare-payments\/requests\/?$/],
  ['POST', /^\/api\/daycare-payments\/requests\/[^/]+\/(verify|review|resolve)\/?$/],
  ['PATCH', /^\/api\/billing-automation\/my-reminders\/preferences\/?$/],
  ['POST', /^\/api\/portal\/(attendance|checkout)\/?$/],
  // Duty assignments are required by attendance and pickup authorization.
  ['POST', /^\/api\/portal\/assignments\/?$/],
  ['PATCH', /^\/api\/portal\/assignments\/\d+\/revoke\/?$/],
  ['POST', /^\/api\/attendance\/?$/],
  ['POST', /^\/api\/biometric\/verify\/?$/],
  ['POST', /^\/api\/health\/?$/],
  ['PATCH', /^\/api\/health\/\d+\/notify\/?$/],
  ['POST', /^\/api\/(?:communication\/)?alerts\/?$/],
];

function isCareWrite(method, path) {
  return safeWrites.some(([verb, pattern]) => method === verb && pattern.test(path));
}

function createSubscriptionAccess(control, now = () => Date.now()) {
  return async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const path = (req.originalUrl || req.url).split('?')[0];
    if (isCareWrite(req.method, path)) return next();
    try {
      const { rows } = await control.query(
        'SELECT subscription_ends_at FROM daycares WHERE id=$1 AND deleted_at IS NULL',
        [req.user.daycare_id]
      );
      if (!rows[0]) return res.status(403).json({ error: 'Daycare account unavailable.' });
      const end = rows[0].subscription_ends_at;
      // Older centers have no accepted terms or end date; do not invent a debt.
      if (end && new Date(end).getTime() <= now()) {
        return res.status(403).json({
          error: 'Your subscription has ended. Renew to restore full access.',
          code: 'SUBSCRIPTION_EXPIRED',
        });
      }
      return next();
    } catch (error) { return next(error); }
  };
}

module.exports = { createSubscriptionAccess, isCareWrite };
