'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const dbModule = require('../src/config/db');
const db = dbModule.control || dbModule;

async function run() {
  const hash = await bcrypt.hash('Password123!', 10);
  const r = await db.query('UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, role_id, daycare_id', [hash, 'mistire@ankelba.com']);
  console.log('Result:', r.rows);
  process.exit(0);
}

run().catch(console.error);
