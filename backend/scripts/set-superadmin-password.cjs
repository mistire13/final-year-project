'use strict';
const dns = require('dns').promises;
async function updateSuperadmin() {
  const host = 'ep-lingering-truth-bduff5y4.c-8.us-east-2.aws.neon.tech';
  const ips = await dns.resolve4(host);
  const { Client } = require('pg');
  const client = new Client({
    host: ips[0],
    port: 5432,
    database: 'neondb',
    user: 'neondb_owner',
    password: 'npg_4HLh9JsGmrdK',
    ssl: { rejectUnauthorized: false, servername: host }
  });
  await client.connect();
  const bcrypt = require('bcryptjs');
  const newHash = await bcrypt.hash('SuperAdmin@2026!', 10);
  await client.query('UPDATE users SET password_hash = $1 WHERE email = $2', [newHash, 'superadmin@ankelba.com']);
  console.log('SUCCESS: Superadmin password updated to SuperAdmin@2026!');
  await client.end();
}
updateSuperadmin().catch(e => { console.error(e); process.exit(1); });
