const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

const seedFile = path.resolve(__dirname, '..', '..', 'db', 'seed.sql');

async function seed() {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;
    await client.query(fs.readFileSync(seedFile, 'utf8'));
    await client.query('COMMIT');
    inTransaction = false;
    console.log('Database seed data applied.');
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch(error => {
    console.error('Database seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
