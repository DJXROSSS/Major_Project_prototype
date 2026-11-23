const { performance } = require("node:perf_hooks");
const { availableParallelism } = require("node:os");
const bcrypt = require("bcryptjs");
const { normalizeMobile, REGISTRATION_PASSWORD_COST } = require("../src/utils/registration");
const { hashConcurrency, prepareImportHashes } = require("../src/utils/import-password-hashing");

async function main() {
  const [count = "100", mode, ...extra] = process.argv.slice(2);
  const rowCount = Number(count);
  if (!/^[1-9]\d*$/.test(count) || rowCount > 5000 || (mode && mode !== "--baseline") || extra.length) {
    throw new Error("Usage: node scripts/benchmark-import-hashing.js [1–5000] [--baseline]");
  }

  const records = Array.from({ length: rowCount }, (_, index) => ({
    email: `benchmark-${index}@example.invalid`,
    mobileNumber: String(9000000000 + index),
  }));
  const hashes = new Map();
  const baseline = mode === "--baseline";
  const started = performance.now();
  if (baseline) {
    for (const { email, mobileNumber } of records) {
      hashes.set(email, await bcrypt.hash(normalizeMobile(mobileNumber), REGISTRATION_PASSWORD_COST));
    }
  } else {
    await prepareImportHashes(records, hashes);
  }
  const elapsed = performance.now() - started;

  console.log(JSON.stringify({
    implementation: baseline ? "bcryptjs" : "bcrypt",
    cost: REGISTRATION_PASSWORD_COST,
    hashConcurrency: baseline ? 1 : hashConcurrency,
    hashCount: hashes.size,
    passwordHashingMs: Math.round(elapsed),
    hashesPerSecond: Number((hashes.size * 1000 / elapsed).toFixed(2)),
    availableParallelism: availableParallelism(),
    platform: process.platform,
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
