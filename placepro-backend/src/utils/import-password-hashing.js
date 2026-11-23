const bcrypt = require("bcrypt");
const { normalizeMobile, REGISTRATION_PASSWORD_COST } = require("./registration");
const { logger } = require("./logger");

const configuredConcurrency = process.env.IMPORT_HASH_CONCURRENCY?.trim();
const validConcurrency = /^[1-8]$/.test(configuredConcurrency ?? "");
const hashConcurrency = validConcurrency ? Number(configuredConcurrency) : 2;
if (configuredConcurrency && !validConcurrency) {
  logger.warn("import.invalid_hash_concurrency", { hashConcurrency, allowedRange: "1–8" });
}
logger.info("import.hash_concurrency_configured", { hashConcurrency });

// Share slots across confirmation requests in the admin process.
let activeHashers = 0;
const waiting = [];

async function acquireSlot() {
  if (activeHashers < hashConcurrency) {
    activeHashers += 1;
    return;
  }
  await new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else activeHashers -= 1;
}

async function prepareImportHashes(records, hashes) {
  let next = 0;
  let failed = false;

  async function hashRecords() {
    while (!failed && next < records.length) {
      const { email, mobileNumber } = records[next++];
      await acquireSlot();
      try {
        if (failed) return;
        const hash = await bcrypt.hash(normalizeMobile(mobileNumber), REGISTRATION_PASSWORD_COST);
        hashes.set(email, hash);
      } catch {
        // Stop taking work for this import. Keep native errors and credentials private.
        failed = true;
      } finally {
        releaseSlot();
      }
    }
  }

  // Each request queues at most one operation per worker and waits for in-flight hashes.
  await Promise.all(Array.from({ length: Math.min(records.length, hashConcurrency) }, hashRecords));
  if (failed) throw new Error("Unable to prepare import credentials. Retry confirmation.");
}

module.exports = { hashConcurrency, prepareImportHashes };
