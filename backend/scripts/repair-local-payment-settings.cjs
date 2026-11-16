'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client } = require('pg');
const connection = require('../src/config/knexfile').connection;

const accounts = {
  cbe: { enabled: true, account_holder: 'LOCAL TEST ONLY - NO TRANSFER', account_number: '9999999999999999' },
  abyssinia: { enabled: false, account_holder: '', account_number: '' },
  telebirr: { enabled: false, account_holder: '', account_number: '' },
};

async function main() {
  if (!['localhost', '127.0.0.1', '::1'].includes(String(connection.host || 'localhost').toLowerCase())) throw new Error('Local database required.');
  if (!['ankelba_dev', 'ankelba_local', 'ankelba_test'].includes(String(connection.database || ''))) throw new Error('Approved local database required.');
  const client = new Client(connection);
  await client.connect();
  try {
    const existing = await client.query('SELECT id FROM subscription_payment_settings WHERE id=1');
    if (existing.rows.length) {
      process.stdout.write('Payment settings already exist; no changes made.\n');
      return;
    }
    await client.query(`INSERT INTO subscription_payment_settings
      (id,institution,account_holder,account_number,version,bank_accounts)
      VALUES (1,'Commercial Bank of Ethiopia',$1,$2,1,$3::jsonb)`,
    [accounts.cbe.account_holder, accounts.cbe.account_number, JSON.stringify(accounts)]);
    process.stdout.write('Created local-only test receiving settings. Do not transfer real money.\n');
  } finally {
    await client.end();
  }
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
