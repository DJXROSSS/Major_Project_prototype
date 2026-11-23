const test = require("node:test");
const assert = require("node:assert/strict");
const { setImmediate } = require("node:timers/promises");
const nativeBcrypt = require("bcrypt");
const { logger } = require("../src/utils/logger");
require("../src/utils/registration");

function loadHasher(concurrency) {
  const path = require.resolve("../src/utils/import-password-hashing");
  const original = process.env.IMPORT_HASH_CONCURRENCY;
  if (concurrency === undefined) delete process.env.IMPORT_HASH_CONCURRENCY;
  else process.env.IMPORT_HASH_CONCURRENCY = concurrency;
  delete require.cache[path];
  try {
    return require(path);
  } finally {
    if (original === undefined) delete process.env.IMPORT_HASH_CONCURRENCY;
    else process.env.IMPORT_HASH_CONCURRENCY = original;
  }
}

function makeRecords(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    email: `${prefix}-${index}@example.invalid`,
    mobileNumber: `+91 ${9000000000 + index}`,
  }));
}

for (const [configured, limit] of [[undefined, 2], ["1", 1], ["2", 2], ["4", 4], ["8", 8]]) {
  test(`setting ${configured ?? "unset"} reports and enforces a limit of ${limit} across imports`, async (t) => {
    const info = t.mock.method(logger, "info", () => {});
    const warn = t.mock.method(logger, "warn", () => {});
    const { prepareImportHashes, hashConcurrency } = loadHasher(configured);
    assert.equal(hashConcurrency, limit);
    assert.deepEqual(info.mock.calls.map(({ arguments: args }) => args), [
      ["import.hash_concurrency_configured", { hashConcurrency: limit }],
    ]);
    assert.equal(warn.mock.callCount(), 0);
    let active = 0;
    let peak = 0;
    t.mock.method(nativeBcrypt, "hash", async (mobile, cost) => {
      assert.equal(cost, 12);
      assert.match(mobile, /^9\d{9}$/);
      active++;
      peak = Math.max(active, peak);
      await setImmediate();
      active--;
      return `fixture-${mobile}`;
    });
    const first = makeRecords(6, "first");
    const second = makeRecords(6, "second");
    const firstHashes = new Map();
    const secondHashes = new Map();
    await Promise.all([prepareImportHashes(first, firstHashes), prepareImportHashes(second, secondHashes)]);
    assert.equal(peak, limit);
    assert.equal(active, 0);
    for (const [records, hashes] of [[first, firstHashes], [second, secondHashes]]) {
      assert.equal(hashes.size, records.length);
      for (const { email, mobileNumber } of records) {
        assert.equal(hashes.get(email), `fixture-${mobileNumber.slice(4)}`);
      }
    }
  });
}

for (const configured of ["0", "-1", "2.5", "invalid", "1e0", "9", "5000"]) {
  test(`setting ${JSON.stringify(configured)} warns and falls back to 2`, (t) => {
    const info = t.mock.method(logger, "info", () => {});
    const warn = t.mock.method(logger, "warn", () => {});
    assert.equal(loadHasher(configured).hashConcurrency, 2);
    assert.deepEqual(warn.mock.calls.map(({ arguments: args }) => args), [
      ["import.invalid_hash_concurrency", { hashConcurrency: 2, allowedRange: "1–8" }],
    ]);
    assert.deepEqual(info.mock.calls.map(({ arguments: args }) => args), [
      ["import.hash_concurrency_configured", { hashConcurrency: 2 }],
    ]);
  });
}

test("hashing errors stop scheduling, drain in-flight work, and release the slots", async (t) => {
  const { prepareImportHashes } = loadHasher("2");
  let calls = 0;
  let active = 0;
  t.mock.method(nativeBcrypt, "hash", async () => {
    const call = ++calls;
    if (call === 1) throw new Error("private native error");
    active++;
    await setImmediate();
    active--;
    return "fixture-hash";
  });
  const hashes = new Map();
  await assert.rejects(prepareImportHashes(makeRecords(6, "failed"), hashes), {
    message: "Unable to prepare import credentials. Retry confirmation.",
  });
  assert.equal(calls, 2);
  assert.equal(active, 0);
  assert.equal(hashes.size, 1);
  const retried = new Map();
  await prepareImportHashes(makeRecords(6, "retry"), retried);
  assert.equal(retried.size, 6);
});
