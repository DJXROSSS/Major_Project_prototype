const { Pool } = require("pg");
const dotenv = require("dotenv");
const { logger } = require("../utils/logger");

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

pool.on("error", (error) => logger.error("database.pool_error", error));

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logger.error("database.rollback_failed", rollbackError);
    }
    logger.error("database.transaction_failed", err);
    throw err;
  } finally {
    client.release();
  }
}

async function writeAuditLog(actorId, actorName, moduleName, action, status = "success", metadata) {
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_name, module, action, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, actorName, moduleName, action, status, metadata ? JSON.stringify(metadata) : null]
  );
}

module.exports = {
  pool,
  withTransaction,
  writeAuditLog,
};
