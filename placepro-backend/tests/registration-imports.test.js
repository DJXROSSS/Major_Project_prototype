const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const nativeBcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../src/config/db");
const { hashConcurrency } = require("../src/utils/import-password-hashing");
const { logger } = require("../src/utils/logger");
const {
  template,
  parseFile,
} = require("../src/services/admin/registration-imports");

test("bulk registration API and transaction guarantees", async (t) => {
  const client = await pool.connect(),
    schema = `bulk_test_${process.pid}_${Date.now()}`;
  const originalQuery = pool.query,
    originalConnect = pool.connect;
  let server;
  let observeTransactionQuery;
  t.after(async () => {
    if (server) await new Promise((r) => server.close(r));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query("ROLLBACK");
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release();
    await pool.end();
  });
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  await client.query(
    fs.readFileSync(path.join(__dirname, "../sql/schema.updated.sql"), "utf8"),
  );
  await client.query(
    fs.readFileSync(path.join(__dirname, "../sql/migrations/20261121_batch_archive_metadata.sql"), "utf8"),
  );
  const migration = fs.readFileSync(
    path.join(__dirname, "../sql/migrations/20261120_registration_imports.sql"),
    "utf8",
  );
  await client.query(migration);
  await client.query(migration);
  pool.query = (...args) => client.query(...args);
  pool.connect = async () => ({
    query: (...args) => {
      observeTransactionQuery?.(...args);
      return client.query(...args);
    },
    release() {},
  });
  await client.query(
    `INSERT INTO users (full_name,email,password_hash,role) VALUES ('Admin','admin@test.invalid','unused','ADMIN'),('Trainer','trainer@test.invalid','unused','TRAINER')`,
  );
  await client.query(
    `INSERT INTO academic_batches (name,department,academic_years,sections) VALUES ('Batch A','CSE','2024-2028','["A"]'),('Batch B','IT','2025-2029','[]')`,
  );
  const app = require("express")();
  app.use(require("express").json());
  app.use(require("cookie-parser")());
  app.use(require("../src/services/admin/routes/admin.routes"));
  app.use(require("../src/services/auth/routes/auth.routes"));
  app.use(require("../src/services/students/routes/students.routes"));
  app.use(require("../src/middleware/error.middleware").errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const token = (id) =>
    jwt.sign({ userId: id }, process.env.JWT_SECRET || "placepro-dev-secret");
  async function req(url, body, actor = 1) {
    const multipart = body instanceof FormData;
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${url}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(actor ? { Authorization: `Bearer ${token(actor)}` } : {}),
          ...(!multipart ? { "Content-Type": "application/json" } : {}),
        },
        body:
          body === undefined
            ? undefined
            : multipart
              ? body
              : JSON.stringify(body),
      },
    );
    return { status: response.status, body: await response.json() };
  }
  const sh = [
    "Roll Number",
    "Full Name",
    "Email",
    "Mobile Number",
    "Section",
    "CGPA",
  ];
  const th = ["Full Name", "Email", "Mobile Number", "Assigned Batches"];
  const row = (id, phone = "9876543210") => [
    id,
    `Student ${id}`,
    `${id.toLowerCase()}@test.invalid`,
    phone,
    "A",
    "8",
  ];
  function file(
    rows,
    kind = "students",
    format = "xlsx",
    headers = kind === "students" ? sh : th,
  ) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([headers, ...rows]),
      "Registration",
    );
    return {
      originalname: `input.${format}`,
      buffer: XLSX.write(wb, {
        type: "buffer",
        bookType: format === "xls" ? "biff8" : format,
      }),
    };
  }
  async function preview(rows, kind = "students", actor = 1, headers, chunkSize, format = "xlsx") {
    const f = file(rows, kind, format, headers);
    const form = new FormData();
    form.append("file", new Blob([f.buffer]), f.originalname);
    if (kind === "students") form.append("academicBatchId", "1");
    if (chunkSize !== undefined) form.append("chunkSize", chunkSize);
    return req(`/users/imports/${kind}/preview`, form, actor);
  }
  const confirm = (p, mode = "valid-only", kind = "students", chunkSize) =>
    req(`/users/imports/${kind}/confirm`, { importId: p.body.importId, mode, chunkSize });
  await t.test(
    "templates and parser preserve text; headers, formulas and row limit enforced",
    async () => {
      const response = await req("/users/imports/students/template");
      assert.equal(response.status, 200);
      const wb = XLSX.read(template("STUDENT"), {
        type: "buffer",
        cellNF: true,
      });
      assert.equal(wb.Sheets.Registration.A2.z, "@");
      assert.equal(wb.Sheets.Registration.D2.z, "@");
      for (const format of ["xlsx", "xls", "csv"])
        assert.equal(
          parseFile(file([row("0001")], "students", format), "STUDENT")[0]
            .submitted.rollNumber,
          "0001",
        );
      assert.equal(
        (await preview([row("BAD")], "students", 1, ["Wrong", ...sh.slice(1)]))
          .status,
        400,
      );
      assert.equal(
        parseFile(
          file(Array.from({ length: 5000 }, (_, i) => row(String(i)))),
          "STUDENT",
        ).length,
        5000,
      );
      assert.throws(
        () =>
          parseFile(
            file(Array.from({ length: 5001 }, (_, i) => row(String(i)))),
            "STUDENT",
          ),
        /contains 5,001 records.*maximum allowed is 5,000/i,
      );
      for (const format of ["xlsx", "xls", "csv"]) {
        const parsed = parseFile(file([row("001"), [], ["   "], row("002")], "students", format), "STUDENT");
        assert.deepEqual(parsed.map(({ rowNumber }) => rowNumber), [2, 5]);
      }
      const overLimit = await preview(Array.from({ length: 5001 }, (_, i) => row(`REJECT-${i}`)), "students", 1, undefined, undefined, "csv");
      assert.equal(overLimit.status, 400);
      assert.match(overLimit.body.error.message, /5,001 records/);
      const sparseCsv = { originalname: "sparse.csv", buffer: Buffer.from(`${sh.join(",")}\n${row("FIRST").join(",")}\n${"\n".repeat(50_000)}${row("LAST").join(",")}`) };
      assert.throws(() => parseFile(sparseCsv, "STUDENT"), /too sparse/);
      const formulaFile = file([row("FORMULA")]);
      const formulaBook = XLSX.read(formulaFile.buffer);
      formulaBook.Sheets.Registration.B2.f = "1+1";
      formulaFile.buffer = XLSX.write(formulaBook, {
        type: "buffer",
        bookType: "xlsx",
      });
      assert.equal(parseFile(formulaFile, "STUDENT")[0].hasFormula, true);
    },
  );
  await t.test(
    "admin only, preview validation, strict rejection, valid-only and repeat confirmation",
    async (subtest) => {
      assert.equal(
        (await preview([row("AUTH")], "students", null)).status,
        401,
      );
      assert.equal((await preview([row("AUTH")], "students", 2)).status, 403);
      const valid = row("0002");
      valid[2] = "0002@TEST.INVALID";
      const p = await preview([
        valid,
        row("PHONE", "123"),
        row("DUP"),
        row("dup"),
        ["EMAIL", "Name", "bad", "9876543210", "A", "8"],
        ["CGPA", "Name", "cgpa@test.invalid", "9876543210", "A", "11"],
      ]);
      assert.equal(p.status, 200);
      assert.equal(p.body.summary.valid, 1);
      assert.equal(p.body.summary.duplicates, 2);
      assert.equal(p.body.processingRows, 1);
      assert.equal(p.body.chunkSize, 500);
      assert.equal(p.body.totalChunks, 1);
      assert.equal(p.body.fileName, "input.xlsx");
      assert.equal(p.body.rows[1].status, "Invalid Phone Number");
      assert.equal(p.body.rows[2].status, "Duplicate in File");
      assert.equal(p.body.rows[4].status, "Invalid Email");
      assert.equal(p.body.rows[5].status, "Invalid CGPA");
      assert(!p.body.errorReport.includes("9876543210"));
      assert.equal(p.body.rows[0].submitted.mobileNumber, "[redacted]");
      const stored = (await client.query("SELECT submitted_rows FROM registration_imports WHERE import_id=$1", [p.body.importId])).rows[0].submitted_rows;
      assert.equal(stored[0].submitted.mobileNumber, undefined);
      assert.ok(stored[0].sealedMobile);
      assert(!JSON.stringify(stored).includes("9876543210"));
      assert.equal((await client.query("SELECT * FROM students")).rowCount, 0);
      const metrics = [];
      subtest.mock.method(logger, "info", (event, data) => {
        if (event === "import.performance") metrics.push(data);
      });
      assert.equal((await confirm(p, "strict")).body.confirmed, false);
      assert.equal(metrics.at(-1).hashCount, 0);
      assert.equal((await client.query("SELECT * FROM students")).rowCount, 0);
      const result = await confirm(p);
      assert.equal(result.body.imported, 1);
      assert.equal(result.body.skipped, 5);
      const timing = metrics.at(-1);
      assert.equal(timing.hashConcurrency, hashConcurrency);
      assert.equal(timing.hashCount, 1);
      assert.equal(timing.imported, 1);
      assert.equal(timing.skipped, 5);
      assert.ok(Number.isInteger(timing.totalMs));
      for (const stage of ["preflightValidationMs", "passwordHashingMs", "transactionMs"]) {
        assert.ok(Number.isInteger(timing.stages[stage]));
      }
      assert.deepEqual((await confirm(p)).body, result.body);
      assert.equal(metrics.at(-1).hashCount, 0);
      const u = (
        await client.query(
          "SELECT * FROM users WHERE email='0002@test.invalid'",
        )
      ).rows[0];
      assert.match(u.password_hash, /^\$2b\$12\$/);
      assert.equal(await bcrypt.compare("9876543210", u.password_hash), true);
      assert.equal(bcrypt.getRounds(u.password_hash), 12);
      assert.equal(u.must_change_password, true);
      const s = (
        await client.query("SELECT * FROM students WHERE roll_no='0002'")
      ).rows[0];
      assert.equal(String(s.academic_batch_id), "1");
      assert.equal(
        (await req("/auth/login", { email: u.email, password: "wrong" }, null))
          .status,
        401,
      );
      const login = await req(
        "/auth/login",
        { email: u.email, password: "9876543210" },
        null,
      );
      assert.equal(login.body.user.mustChangePassword, true);
      assert.equal(
        (
          await req(
            "/users/imports/students/template",
            undefined,
            Number(u.user_id),
          )
        ).status,
        403,
      );
      assert.equal(
        (await preview([row("0002")])).body.rows[0].status,
        "Already Registered",
      );
    },
  );
  await t.test(
    "trainers support multiple existing batches and reject missing identifiers",
    async (subtest) => {
      const p = await preview(
        [
          ["Trainer A", "ta@test.invalid", "9123456789", "Batch A;2"],
          ["Trainer B", "tb@test.invalid", "9876543210", "Missing"],
        ],
        "trainers",
      );
      assert.equal(p.body.summary.valid, 1);
      assert.equal(p.body.rows[1].status, "Invalid Batch");
      const legacyHash = subtest.mock.method(bcrypt, "hash", async () => assert.fail("Import rehashed a precomputed password"));
      const result = await confirm(p, "valid-only", "trainers");
      assert.equal(result.body.imported, 1);
      assert.equal(legacyHash.mock.callCount(), 0);
      legacyHash.mock.restore();
      const u = (
        await client.query("SELECT * FROM users WHERE email='ta@test.invalid'")
      ).rows[0];
      assert.equal(u.role, "TRAINER");
      assert.match(u.password_hash, /^\$2b\$12\$/);
      assert.equal(await bcrypt.compare("9123456789", u.password_hash), true);
      assert(
        (
          await client.query("SELECT trainer_ids FROM academic_batches")
        ).rows.every((b) => b.trainer_ids.includes(String(u.user_id))),
      );
    },
  );
  await t.test(
    "existing student linking preserves evaluations and rejects conflicting details",
    async () => {
      await client.query(
        `INSERT INTO students (roll_no,full_name,email,academic_batch_id,section,cgpa,average_score) VALUES ('OLD','Student OLD','old@test.invalid',1,'A',8,88)`,
      );
      const bad = row("OLD");
      bad[5] = "7";
      assert.equal(
        (await preview([bad])).body.rows[0].status,
        "Identity Conflict",
      );
      const p = await preview([row("OLD")]);
      assert.equal(p.body.rows[0].linksExistingStudent, true);
      assert.equal((await confirm(p)).body.imported, 1);
      const s = (
        await client.query("SELECT * FROM students WHERE roll_no='OLD'")
      ).rows[0];
      assert(s.user_id);
      assert.equal(Number(s.average_score), 88);
      assert.equal(Number(s.cgpa), 8);
    },
  );
  await t.test(
    "failed row has no orphan account; strict rolls back the entire import and can retry",
    async (subtest) => {
      subtest.mock.method(nativeBcrypt, "hash", async (_mobile, cost) => {
        assert.equal(cost, 12);
        return "isolated-transaction-test-hash";
      });
      await client.query(
        `CREATE FUNCTION reject_bulk_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.roll_no='FAIL' THEN RAISE EXCEPTION 'Forced failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_bulk_row BEFORE INSERT ON students FOR EACH ROW EXECUTE FUNCTION reject_bulk_row()`,
      );
      const p = await preview([...Array.from({ length: 50 }, (_, i) => row(`PASS-${i}`)), row("FAIL"), row("GOOD")]);
      assert.equal((await confirm(p, "strict", "students", 50)).status, 409);
      assert.equal(
        (
          await client.query(
            "SELECT * FROM users WHERE email LIKE 'pass-%' OR email IN ('good@test.invalid','fail@test.invalid')",
          )
        ).rowCount,
        0,
      );
      const result = await confirm(p, "valid-only", "students", 50);
      assert.equal(result.body.totalChunks, 2);
      assert.equal(result.body.imported, 51);
      assert.equal(result.body.skipped, 1);
      assert.equal(result.body.failed, 1);
      assert.equal(result.body.rows.find(({ submitted }) => submitted.rollNumber === "FAIL").status, "Failed");
      assert.equal(
        (
          await client.query(
            "SELECT * FROM users WHERE email='fail@test.invalid'",
          )
        ).rowCount,
        0,
      );
      await client.query("DROP TRIGGER reject_bulk_row ON students");
      const retry = await preview([row("FAIL")]);
      assert.equal((await confirm(retry, "strict")).body.imported, 1);
    },
  );
  await t.test(
    "confirmation revalidates stale previews and isolates session owners",
    async () => {
      const p = await preview([row("STALE")]);
      const other = await preview([row("STALE")]);
      assert.equal((await confirm(other)).body.imported, 1);
      assert.equal((await confirm(p)).body.skipped, 1);
      await client.query(
        `INSERT INTO users (full_name,email,password_hash,role) VALUES ('Other admin','other@test.invalid','unused','ADMIN')`,
      );
      const id = (
        await client.query(
          "SELECT user_id FROM users WHERE email='other@test.invalid'",
        )
      ).rows[0].user_id;
      assert.equal(
        (
          await req(
            "/users/imports/students/confirm",
            { importId: p.body.importId, mode: "valid-only" },
            Number(id),
          )
        ).status,
        404,
      );
    },
  );
  await t.test('simultaneous confirmation returns one durable result', async () => {
    const previewed = await preview([row('CONCURRENT')]);
    const testConnect = pool.connect;
    pool.connect = async () => {
      const connection = await originalConnect.call(pool);
      await connection.query(`SET search_path TO ${schema}`);
      return connection;
    };
    try {
      const [first, second] = await Promise.all([confirm(previewed), confirm(previewed)]);
      assert.equal(first.status, 200);
      assert.deepEqual(first.body, second.body);
      assert.equal(first.body.imported, 1);
      assert.equal((await client.query("SELECT * FROM users WHERE email='concurrent@test.invalid'")).rowCount, 1);
    } finally {
      pool.connect = testConnect;
    }
  });

  await t.test("failed hashing keeps the preview retryable and never opens a transaction", async (subtest) => {
    const p = await preview([row("HASH-FAILURE")]);
    const privateValue = "private-native-error";
    let failHashing = true;
    subtest.mock.method(nativeBcrypt, "hash", async (mobile) => {
      if (failHashing) throw new Error(`${privateValue} ${mobile}`);
      return "successful-retry-hash";
    });
    const logged = [];
    subtest.mock.method(logger, "error", (event, error) => logged.push({ event, message: error.message }));
    subtest.mock.method(logger, "info", (event, data) => logged.push({ event, ...data }));
    const transactionQueries = [];
    observeTransactionQuery = (sql) => transactionQueries.push(sql);
    try {
      const failed = await confirm(p, "strict");
      assert.equal(failed.status, 500);
      assert.equal(failed.body.error.message, "Unable to prepare import credentials. Retry confirmation.");
      assert.equal(transactionQueries.length, 0);
      assert.ok(logged.some((entry) => entry.event === "import.performance" && entry.hashCount === 0));
      assert.doesNotMatch(JSON.stringify(logged), /private-native-error|9876543210/);
      assert.equal((await client.query("SELECT status FROM registration_imports WHERE import_id=$1", [p.body.importId])).rows[0].status, "PREVIEW");
      assert.equal((await client.query("SELECT 1 FROM users WHERE email='hash-failure@test.invalid'")).rowCount, 0);
      failHashing = false;
      const retried = await confirm(p, "strict");
      assert.equal(retried.status, 200);
      assert.equal(retried.body.imported, 1);
      assert.doesNotMatch(JSON.stringify(logged), /successful-retry-hash/);
    } finally {
      observeTransactionQuery = undefined;
    }
  });

  await t.test("chunk size rejects invalid multipart and JSON values", async () => {
    const p = await preview([row("INVALID-CHUNK")]);
    for (const value of ["", "0", "-1", "49", "50.5", "500.0", "1001", "5e2"]) {
      const result = await preview([row("INVALID-CHUNK")], "students", 1, undefined, value);
      assert.equal(result.status, 400, `preview accepted ${JSON.stringify(value)}`);
    }
    for (const value of [null, false, [], [500], {}, 0, -50, 49, 50.5, 1001]) {
      const result = await confirm(p, "valid-only", "students", value);
      assert.equal(result.status, 400, `confirmation accepted ${JSON.stringify(value)}`);
    }
    const max = await preview([row("MAX-CHUNK")], "students", 1, undefined, "1000");
    assert.equal(max.body.chunkSize, 1000);
  });

  await t.test("student chunk sizes drive bulk SQL and every account is assigned exactly once", async (subtest) => {
    // Exercise real bcrypt separately above. Large fixtures isolate database throughput.
    subtest.mock.method(nativeBcrypt, "hash", async (_mobile, cost) => {
      assert.equal(cost, 12);
      return "isolated-chunk-test-hash";
    });
    for (const count of [100, 500, 501, 1862, 5000]) {
      const prefix = `CHUNK-${count}-`;
      const p = await preview(Array.from({ length: count }, (_, i) => row(`${prefix}${i}`)), "students", 1, undefined, undefined, "csv");
      assert.equal(p.status, 200);
      assert.equal(p.body.summary.total, count);
      assert.equal(p.body.summary.valid, count);
      assert.equal(p.body.totalChunks, Math.ceil(count / 500));
      const chunkLengths = [];
      observeTransactionQuery = (sql, params) => {
        if (sql.startsWith("INSERT INTO users")) chunkLengths.push(JSON.parse(params[0]).length);
      };
      let completed;
      try {
        completed = await confirm(p, "strict");
      } finally {
        observeTransactionQuery = undefined;
      }
      assert.equal(completed.status, 200);
      assert.equal(completed.body.imported, count);
      assert.equal(completed.body.failed, 0);
      assert.equal(completed.body.totalChunks, Math.ceil(count / 500));
      assert.deepEqual(chunkLengths, Array.from({ length: Math.ceil(count / 500) }, (_, i) => Math.min(500, count - i * 500)));
      const { rows: [totals] } = await client.query(
        `SELECT count(*)::int total, count(DISTINCT s.user_id)::int linked,
                count(*) FILTER (WHERE s.academic_batch_id=1 AND s.section='A' AND s.batch='Batch A'
                  AND s.branch='CSE' AND s.cgpa=8 AND u.email=s.email AND u.must_change_password)::int assigned
         FROM students s JOIN users u USING (user_id) WHERE s.roll_no LIKE $1`,
        [`${prefix}%`],
      );
      assert.deepEqual(totals, { total: count, linked: count, assigned: count });
    }

    await client.query("UPDATE academic_batches SET trainer_ids='[\"2\"]' WHERE academic_batch_id=1");
    const page = await req("/students?batchId=1&section=A&page=500&pageSize=10", undefined, 2);
    assert.equal(page.status, 200);
    assert.ok(page.body.total > 5000);
    assert.equal(page.body.page, 500);
    assert.equal(page.body.items.length, 10);
    for (const term of ["CHUNK-5000-4999", "Student CHUNK-5000-4999", "chunk-5000-4999@test.invalid"]) {
      const match = await req(`/students?batchId=1&section=A&page=99&q=${encodeURIComponent(term)}`, undefined, 2);
      assert.equal(match.status, 200);
      assert.equal(match.body.total, 1);
      assert.equal(match.body.page, 1);
      assert.equal(match.body.items[0].rollNumber, "CHUNK-5000-4999");
    }
  });

});
