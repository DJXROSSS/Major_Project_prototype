"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.withTransaction = withTransaction;
exports.writeAuditLog = writeAuditLog;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const { logger } = require("../utils/logger");
dotenv_1.default.config();
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
});
exports.pool.on("error", (error) => logger.error("database.pool_error", error));
async function withTransaction(fn) {
    const client = await exports.pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    }
    catch (err) {
        try {
            await client.query("ROLLBACK");
        }
        catch (rollbackError) {
            logger.error("database.rollback_failed", rollbackError);
        }
        logger.error("database.transaction_failed", err);
        throw err;
    }
    finally {
        client.release();
    }
}
async function writeAuditLog(actorId, actorName, module, action, status = "success", metadata) {
    await exports.pool.query(`INSERT INTO audit_logs (actor_id, actor_name, module, action, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`, [actorId, actorName, module, action, status, metadata ? JSON.stringify(metadata) : null]);
}
