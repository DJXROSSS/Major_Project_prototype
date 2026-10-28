const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

const projectRoot = path.resolve(__dirname, '..', '..');
const migrationsDirectory = path.join(projectRoot, 'db', 'migrations');
const migrations = [
  {
    name: '001_initial_schema',
    file: path.join(projectRoot, 'db', 'schema.sql')
  },
  ...(fs.existsSync(migrationsDirectory)
    ? fs.readdirSync(migrationsDirectory)
      .filter(file => /^\d+_.+\.sql$/.test(file))
      .sort()
      .map(file => ({
        name: path.basename(file, '.sql'),
        file: path.join(migrationsDirectory, file)
      }))
    : [])
];

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(255) PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const migration of migrations) {
      const sql = fs.readFileSync(migration.file, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      let inTransaction = false;

      try {
        await client.query('BEGIN');
        inTransaction = true;

        const result = await client.query(
          'SELECT checksum FROM schema_migrations WHERE migration_name = $1',
          [migration.name]
        );

        if (result.rowCount > 0) {
          if (result.rows[0].checksum !== checksum) {
            throw new Error(
              `Applied migration "${migration.name}" has changed. Add a new migration instead.`
            );
          }
          await client.query('COMMIT');
          inTransaction = false;
          console.log(`Already applied: ${migration.name}`);
          continue;
        }

        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2)',
          [migration.name, checksum]
        );
        await client.query('COMMIT');
        inTransaction = false;
        console.log(`Applied: ${migration.name}`);
      } catch (error) {
        if (inTransaction) await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

migrate()
  .catch(error => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
