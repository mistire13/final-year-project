'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

(async () => {
  const hash = await bcrypt.hash('Parent@123!', 10);
  await db.control.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, 'parent@ankelba.dev']);
  console.log('✅ parent@ankelba.dev password reset to Parent@123!');
  process.exit(0);
})();
