const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/config/db');
(async () => {
  const client = await pool.connect();
  try {
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/migrations/20261120_registration.sql'), 'utf8'));
    console.log('Registration migration applied. Existing accounts retain their passwords and password-change status.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
})().catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; }).finally(() => pool.end());
