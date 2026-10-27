'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const control = db.control || db;

async function run() {
  const hash = await bcrypt.hash('1234', 10);
  await control.query("UPDATE users SET password_hash = $1 WHERE email IN ('parent@ankelba.dev', 'parent@gmail.com')", [hash]);
  // Also check if parent@gmail.com exists; if not, create it
  const r = await control.query("SELECT id FROM users WHERE email = 'parent@gmail.com'");
  if (r.rows.length === 0) {
    await control.query(
      "INSERT INTO users (name, email, password_hash, role_id, daycare_id, status, profile_complete) VALUES ($1, $2, $3, 3, 1, 'active', true)",
      ['Hana Tesfaye', 'parent@gmail.com', hash]
    );
    console.log('Created parent@gmail.com');
  }
  console.log('Successfully configured parent accounts with password 1234');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
