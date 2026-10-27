'use strict';

// This is the only composition module that imports the configured application
// pool. Tests inject their own generated-database pool into the pure factories.
const { loadDaycareAuthConfig } = require('../../config/daycare-auth');
const config = loadDaycareAuthConfig();
if (!config.enabled) throw new Error('Daycare authentication preview is not enabled.');

const tenantPool = require('../../config/db');
const pool = tenantPool.control || tenantPool;
const { createDaycareAuth } = require('./index');
const { createDaycareUsers } = require('../daycare-users');
const auth = createDaycareAuth({ pool, config });
const users = createDaycareUsers({ pool: tenantPool, authenticate: auth.authenticate });
const { createPlatformAuth } = require('../platform-auth');
const platform = createPlatformAuth({ pool, config, mfa: auth.mfa, security: auth.security });
platform.router.use(auth.recovery.platformRouter);
platform.router.patch('/change-password', platform.authenticate, async (req, res, next) => {
  try {
    if (!req.is('application/json')) throw Object.assign(new Error('Content-Type must be application/json'), { statusCode: 415 });
    res.json(await auth.recovery.service.changePassword({ ...req.platformAccount, principal_kind: 'platform' }, req.body));
  } catch (error) { next(error); }
});

module.exports = { ...auth, usersRouter: users.router, platformRouter: platform.router, platformAuthenticate: platform.authenticate };
