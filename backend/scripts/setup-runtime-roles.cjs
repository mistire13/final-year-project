'use strict';

// DB_* credentials are migration/provisioning credentials only. Never print
// passwords or grant both runtime groups to the same application login.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Client, Pool } = require('pg');
const { verifyRuntime } = require('../src/db/runtime-policy');
const base = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME || 'ankelba_dev' };
const definitions = [
  { user: process.env.APP_DB_USER || 'ankelba_tenant_app', password: process.env.APP_DB_PASSWORD, group: 'ankelba_tenant', other: 'ankelba_control' },
  { user: process.env.CONTROL_DB_USER || 'ankelba_control_app', password: process.env.CONTROL_DB_PASSWORD, group: 'ankelba_control', other: 'ankelba_tenant' },
];
const identifier = name => {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error('Runtime login names must be lowercase PostgreSQL identifiers.');
  return `"${name}"`;
};
async function setupRuntimeRoles(client, roles = definitions) {
  if (roles[0].user === roles[1].user) throw new Error('Separate runtime logins are required.');
  for (const role of roles) {
    identifier(role.user);
    if (typeof role.password !== 'string' || role.password.length < 24) throw new Error('Set separate APP_DB_PASSWORD and CONTROL_DB_PASSWORD values of at least 24 characters.');
    const { rows } = await client.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [role.user]);
    if (!rows.length) await client.query(`CREATE ROLE ${identifier(role.user)} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
    else {
      const { rows: [attributes] } = await client.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', [role.user]);
      if (Object.values(attributes).some(Boolean)) throw new Error('Choose a new restricted runtime login; refusing to alter a privileged account.');
    }
    const { rows: [escaped] } = await client.query('SELECT quote_literal($1) AS password', [role.password]);
    await client.query(`ALTER ROLE ${identifier(role.user)} PASSWORD ${escaped.password}`);
    await client.query(`REVOKE ${role.other} FROM ${identifier(role.user)}`);
    await client.query(`GRANT ${role.group} TO ${identifier(role.user)}`);
  }
}
async function main() {
  const client = new Client({ ...base, user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD });
  await client.connect();
  try { await client.query('BEGIN'); await setupRuntimeRoles(client); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
  const tenant = new Pool({ ...base, user: definitions[0].user, password: definitions[0].password });
  const control = new Pool({ ...base, user: definitions[1].user, password: definitions[1].password });
  try { await verifyRuntime(tenant, control); console.log('Separate tenant/control runtime logins verified. No credentials are printed.'); }
  finally { await Promise.all([tenant.end(), control.end()]); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { setupRuntimeRoles };
