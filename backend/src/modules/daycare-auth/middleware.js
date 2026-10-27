'use strict';

const { credentials, checkCookieProof, csrfToken } = require('./tokens');
const { checkTenantSelectors } = require('./validator');
const { unavailable } = require('./errors');
const { withTenant } = require('../../db/tenant-pool');

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
}

function createAuthenticate(service, config) {
  return async function authenticate(req, res, next) {
    res.set('Cache-Control', 'no-store');
    try {
      const credential = credentials(req, config.cookieName);
      const result = await service.authenticate(credential.token);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        checkCookieProof(req, credential, config.allowedOrigins);
      }
      checkTenantSelectors(req, result.user.daycare_id);
      req.user = result.user;
      req.daycareId = Number(result.user.daycare_id);
      req.authSession = { ...result.session, transport: credential.transport };
      if (credential.transport === 'cookie') req.authSession.csrf_token = csrfToken(credential.token);
      return withTenant(req.daycareId, () => next());
    } catch (error) { next(unavailable(error)); }
  };
}

module.exports = { noStore, createAuthenticate };
