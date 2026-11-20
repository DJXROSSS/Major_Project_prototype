const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../src/config/db");
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
    query: (...args) => client.query(...args),
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
  async function preview(rows, kind = "students", actor = 1, headers) {
    const f = file(rows, kind, "xlsx", headers);
    const form = new FormData();
    form.append("file", new Blob([f.buffer]), f.originalname);
    if (kind === "students") form.append("academicBatchId", "1");
    return req(`/users/imports/${kind}/preview`, form, actor);
  }
  const confirm = (p, mode = "valid-only", kind = "students") =>
    req(`/users/imports/${kind}/confirm`, { importId: p.body.importId, mode });
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
      assert.throws(
        () =>
          parseFile(
            file(Array.from({ length: 201 }, (_, i) => row(String(i)))),
            "STUDENT",
          ),
        /Maximum/,
      );
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
    async () => {
      assert.equal(
        (await preview([row("AUTH")], "students", null)).status,
        401,
      );
      assert.equal((await preview([row("AUTH")], "students", 2)).status, 403);
      const p = await preview([
        row("0002"),
        row("PHONE", "123"),
        row("DUP"),
        row("dup"),
        ["EMAIL", "Name", "bad", "9876543210", "A", "8"],
        ["CGPA", "Name", "cgpa@test.invalid", "9876543210", "A", "11"],
      ]);
      assert.equal(p.status, 200);
      assert.equal(p.body.summary.valid, 1);
      assert.equal(p.body.rows[1].status, "Invalid Phone Number");
      assert.equal(p.body.rows[2].status, "Duplicate in File");
      assert.equal(p.body.rows[4].status, "Invalid Email");
      assert.equal(p.body.rows[5].status, "Invalid CGPA");
      assert(!p.body.errorReport.includes("9876543210"));
      assert.equal((await client.query("SELECT * FROM students")).rowCount, 0);
      assert.equal((await confirm(p, "strict")).body.confirmed, false);
      assert.equal((await client.query("SELECT * FROM students")).rowCount, 0);
      const result = await confirm(p);
      assert.equal(result.body.imported, 1);
      assert.equal(result.body.skipped, 5);
      assert.deepEqual((await confirm(p)).body, result.body);
      const u = (
        await client.query(
          "SELECT * FROM users WHERE email='0002@test.invalid'",
        )
      ).rows[0];
      assert.equal(await bcrypt.compare("9876543210", u.password_hash), true);
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
    async () => {
      const p = await preview(
        [
          ["Trainer A", "ta@test.invalid", "9123456789", "Batch A;2"],
          ["Trainer B", "tb@test.invalid", "9876543210", "Missing"],
        ],
        "trainers",
      );
      assert.equal(p.body.summary.valid, 1);
      assert.equal(p.body.rows[1].status, "Invalid Batch");
      const result = await confirm(p, "valid-only", "trainers");
      assert.equal(result.body.imported, 1);
      const u = (
        await client.query("SELECT * FROM users WHERE email='ta@test.invalid'")
      ).rows[0];
      assert.equal(u.role, "TRAINER");
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
    async () => {
      await client.query(
        `CREATE FUNCTION reject_bulk_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.roll_no='FAIL' THEN RAISE EXCEPTION 'Forced failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_bulk_row BEFORE INSERT ON students FOR EACH ROW EXECUTE FUNCTION reject_bulk_row()`,
      );
      const p = await preview([row("GOOD"), row("FAIL")]);
      assert.equal((await confirm(p, "strict")).status, 409);
      assert.equal(
        (
          await client.query(
            "SELECT * FROM users WHERE email IN ('good@test.invalid','fail@test.invalid')",
          )
        ).rowCount,
        0,
      );
      const result = await confirm(p);
      assert.equal(result.body.imported, 1);
      assert.equal(result.body.skipped, 1);
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

});
