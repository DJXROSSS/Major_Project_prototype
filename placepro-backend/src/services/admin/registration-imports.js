const { Router } = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const { pool, withTransaction } = require("../../config/db");
const {
  requireAuth,
  requireRole,
} = require("../../middleware/auth.middleware");
const { registerAccount, normalizeMobile } = require("../../utils/registration");
const { csvCell } = require("../companies/shortlist-export");
const { createImportPerformance } = require("../../utils/import-performance");
const router = Router();
// Registration templates and UI promise a 200-record cap. Assessment imports
// use their separate 5,000-row workflow.
const MAX_ROWS = 5000;
const headers = {
  STUDENT: [
    "Roll Number",
    "Full Name",
    "Email",
    "Mobile Number",
    "Section",
    "CGPA",
  ],
  TRAINER: ["Full Name", "Email", "Mobile Number", "Assigned Batches"],
};
const fields = {
  "Roll Number": "rollNumber",
  "Full Name": "name",
  Email: "email",
  "Mobile Number": "mobileNumber",
  Section: "section",
  CGPA: "cgpa",
  "Assigned Batches": "assignedBatches",
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
});
function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function roleFor(value) {
  if (value === "students") return "STUDENT";
  if (value === "trainers") return "TRAINER";
  fail("Invalid registration type");
}
function template(role, batches = []) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers[role]]);
  sheet["!cols"] = headers[role].map((h) => ({
    wch: h === "Assigned Batches" ? 40 : 24,
  }));
  // Blank, text-formatted input rows preserve mobile numbers and leading-zero roll numbers.
  for (let row = 1; row <= MAX_ROWS; row++)
    headers[role].forEach((header, col) => {
      if (header === "Mobile Number" || header === "Roll Number")
        sheet[XLSX.utils.encode_cell({ r: row, c: col })] = {
          t: "s",
          v: "",
          z: "@",
        };
    });
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: MAX_ROWS, c: headers[role].length - 1 },
  });
  XLSX.utils.book_append_sheet(workbook, sheet, "Registration");
  const instructions = [
    ["Instructions"],
    [
      "Fill Registration; keep its headers unchanged. Maximum 200 records, 5 MB.",
    ],
    [
      "Mobile Number and Roll Number cells are text. Do not convert them to numbers.",
    ],
    [
      role === "STUDENT"
        ? "Choose the academic batch in PlacePro before upload. Section must match that batch."
        : "Separate batch names or IDs with semicolons (commas also supported). Use IDs for names containing delimiters.",
    ],
    ["No passwords are included in this template."],
    [],
    ["Batch ID", "Batch name", "Sections"],
  ];
  batches.forEach((b) =>
    instructions.push([
      String(b.academic_batch_id),
      b.name,
      (b.sections || []).join(", "),
    ]),
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(instructions),
    "Instructions",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
function parseFile(file, role) {
  if (!file || !/\.(xlsx|xls|csv)$/i.test(file.originalname))
    fail("Upload an .xlsx, .xls or .csv file");
  let workbook;
  try {
    workbook = XLSX.read(file.buffer, {
      type: "buffer",
      raw: true,
      cellFormula: true,
      sheetRows: MAX_ROWS + 2,
    });
  } catch {
    fail("Unable to read this spreadsheet");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) fail("Spreadsheet has no worksheets");
  if (
    sheet["!fullref"] &&
    XLSX.utils.decode_range(sheet["!fullref"]).e.r > MAX_ROWS
  )
    fail(`Maximum ${MAX_ROWS} rows per import`);
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  const actual = (matrix[0] || []).map((v) =>
    String(v)
      .replace(/^\uFEFF/, "")
      .trim(),
  );
  if (
    actual.length !== headers[role].length ||
    new Set(actual).size !== actual.length ||
    headers[role].some((h) => !actual.includes(h))
  )
    fail(`Headers must be: ${headers[role].join(", ")}`);
  const rows = [];
  matrix.slice(1).forEach((values, index) => {
    if (!values.some((value) => String(value).trim())) return;
    const submitted = {};
    actual.forEach(
      (header, col) =>
        (submitted[fields[header]] = String(values[col] ?? "").trim()),
    );
    const hasFormula = actual.some(
      (_header, col) =>
        sheet[XLSX.utils.encode_cell({ r: index + 1, c: col })]?.f,
    );
    rows.push({ rowNumber: index + 2, submitted, hasFormula });
  });
  if (!rows.length) fail("The spreadsheet contains no registration records");
  if (rows.length > MAX_ROWS) fail(`Maximum ${MAX_ROWS} rows per import`);
  return rows;
}
function statusFor(error) {
  const text = error.message;
  if (error.statusCode === 409)
    return /already has|already registered/.test(text)
      ? "Already Registered"
      : "Identity Conflict";
  if (/CGPA/.test(text)) return "Invalid CGPA";
  if (/mobile/i.test(text)) return "Invalid Phone Number";
  if (/email/i.test(text)) return "Invalid Email";
  if (/batch|section/i.test(text)) return "Invalid Batch";
  return "Missing Required Field";
}
async function validateRows(db, role, rows, batchId) {
  const batches = (await db.query("SELECT * FROM academic_batches")).rows;
  const batchById = new Map(batches.map((batch) => [String(batch.academic_batch_id), batch]));
  const batchesByIdentifier = new Map();
  for (const batch of batches) {
    for (const identifier of [String(batch.academic_batch_id), batch.name.trim().toLowerCase()]) {
      const matches = batchesByIdentifier.get(identifier) || [];
      matches.push(batch);
      batchesByIdentifier.set(identifier, matches);
    }
  }
  const emails = new Map(),
    rolls = new Map();
  for (const r of rows) {
    const email = r.submitted.email.toLowerCase();
    const roll = (r.submitted.rollNumber || "").toUpperCase();
    if (email) emails.set(email, (emails.get(email) || 0) + 1);
    if (role === "STUDENT" && roll) rolls.set(roll, (rolls.get(roll) || 0) + 1);
  }
  const normalizedEmails = [...emails.keys()];
  const normalizedRolls = [...rolls.keys()];
  const [existingUsers, existingStudents] = await Promise.all([
    normalizedEmails.length
      ? db.query("SELECT user_id, lower(btrim(email)) AS email FROM users WHERE lower(btrim(email))=ANY($1::text[])", [normalizedEmails])
      : { rows: [] },
    normalizedEmails.length || normalizedRolls.length
      ? db.query(
        `SELECT * FROM students
         WHERE lower(btrim(email))=ANY($1::text[]) OR upper(btrim(roll_no))=ANY($2::text[])`,
        [normalizedEmails, normalizedRolls],
      )
      : { rows: [] },
  ]);
  const usersByEmail = new Map(existingUsers.rows.map((user) => [user.email, user]));
  const studentsByIdentity = new Map();
  for (const student of existingStudents.rows) {
    for (const identity of [String(student.roll_no).trim().toUpperCase(), String(student.email).trim().toLowerCase()]) {
      const matches = studentsByIdentity.get(identity) || [];
      matches.push(student);
      studentsByIdentity.set(identity, matches);
    }
  }
  const validated = [];
  for (const row of rows) {
    const submitted = row.submitted;
    const record = { ...submitted, email: submitted.email.toLowerCase() };
    let status = "Valid",
      message = "",
      linksExistingStudent = false;
    try {
      if (row.hasFormula)
        fail("Formula cells are not allowed. Paste their values as text");
      const required =
        role === "STUDENT"
          ? ["rollNumber", "name", "email", "mobileNumber"]
          : ["name", "email", "mobileNumber", "assignedBatches"];
      if (required.some((field) => !submitted[field]))
        fail("A required field is missing");
      if (
        emails.get(record.email) > 1 ||
        (role === "STUDENT" &&
          rolls.get(submitted.rollNumber.toUpperCase()) > 1)
      ) {
        status = "Duplicate in File";
        fail("Email or roll number occurs more than once in this file");
      }
      if (role === "STUDENT") {
        record.academicBatchId = batchId;
        record.cgpa =
          submitted.cgpa === "" ? undefined : Number(submitted.cgpa);
        const batch = batchById.get(batchId);
        if (!batch || batch.status !== "active") fail("Select existing active academic batches");
        if (!Number.isFinite(record.cgpa) && record.cgpa !== undefined)
          fail("CGPA must be between 0 and 10");
        if (record.cgpa !== undefined && (record.cgpa < 0 || record.cgpa > 10))
          fail("CGPA must be between 0 and 10");
        if (submitted.rollNumber.length > 50) fail("Roll number is required (maximum 50 characters)");
        if (submitted.name.length > 100) fail("Full name is required (maximum 100 characters)");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) || record.email.length > 120)
          fail("Enter a valid email address");
        normalizeMobile(submitted.mobileNumber);
        if (typeof submitted.section !== "string" || submitted.section.length > 10 ||
          ((batch.sections || []).length && !batch.sections.includes(submitted.section)))
          fail("Choose a section from the selected batch");
        if (usersByEmail.has(record.email)) fail("This email already has a login account", 409);
        const matches = [...new Set([
          ...(studentsByIdentity.get(submitted.rollNumber.toUpperCase()) || []),
          ...(studentsByIdentity.get(record.email) || []),
        ])];
        if (matches.length) {
          const student = matches[0];
          if (matches.length !== 1 ||
            student.roll_no.trim().toUpperCase() !== submitted.rollNumber.toUpperCase() ||
            student.email.trim().toLowerCase() !== record.email ||
            student.full_name.trim().toLowerCase() !== submitted.name.trim().toLowerCase())
            fail("Existing student identity does not match. Use the existing name, roll number and email", 409);
          if (student.academic_batch_id && String(student.academic_batch_id) !== batchId)
            fail("Existing student belongs to a different academic batch", 409);
          if (student.user_id) fail("This student already has an account", 409);
          if ((record.cgpa !== undefined && Number(student.cgpa) !== record.cgpa) ||
            (submitted.section && student.section && student.section !== submitted.section))
            fail("Existing student CGPA or section conflicts with the supplied details", 409);
          linksExistingStudent = true;
        }
      } else {
        record.assignedBatchIds = submitted.assignedBatches
          .split(/[;,]/)
          .map((identifier) => {
            const value = identifier.trim().toLowerCase();
            const matches = batchesByIdentifier.get(value) || [];
            if (!value || matches.length !== 1)
              fail("Unknown or ambiguous batch identifier");
            return String(matches[0].academic_batch_id);
          });
        record.assignedBatchIds = [...new Set(record.assignedBatchIds)];
        if (submitted.name.length > 100) fail("Full name is required (maximum 100 characters)");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) || record.email.length > 120)
          fail("Enter a valid email address");
        normalizeMobile(submitted.mobileNumber);
        if (record.assignedBatchIds.some((id) => batchById.get(id)?.status !== "active"))
          fail("Select existing active academic batches");
        if (usersByEmail.has(record.email)) fail("This email already has a login account", 409);
        if ((studentsByIdentity.get(record.email) || []).length)
          fail("This email belongs to a student record", 409);
      }
    } catch (error) {
      if (!error.statusCode) throw error;
      if (status === "Valid") status = statusFor(error);
      message = error.message;
    }
    validated.push({ ...row, record, status, message, linksExistingStudent });
  }
  return validated;
}
function responseRows(rows) {
  return rows.map(({ record, ...row }) => row);
}
function summary(rows) {
  const valid = rows.filter((r) => r.status === "Valid").length,
    alreadyExists = rows.filter(
      (r) => r.status === "Already Registered",
    ).length;
  return {
    total: rows.length,
    valid,
    invalid: rows.length - valid - alreadyExists,
    alreadyExists,
  };
}
// Contact numbers double as temporary credentials: redact them in downloadable reports and stored results.
function safeSubmitted(submitted) {
  return {
    ...submitted,
    mobileNumber: submitted.mobileNumber ? "[redacted]" : "",
  };
}
function report(role, rows) {
  const lines = [
    ["Row Number", ...headers[role], "Status", "Message"],
    ...rows
      .filter((r) => r.status !== "Imported")
      .map((r) => [
        r.rowNumber,
        ...headers[role].map(
          (h) => safeSubmitted(r.submitted)[fields[h]] ?? "",
        ),
        r.status,
        r.message,
      ]),
  ];
  return (
    "\uFEFF" +
    lines
      .map((row) => row.map((value) => csvCell(value)).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
router.use("/users/imports", requireAuth, requireRole(["admin"]));
router.get("/users/imports/:kind/template", async (req, res, next) => {
  try {
    const role = roleFor(req.params.kind);
    const batches = (
      await pool.query(
        "SELECT * FROM academic_batches WHERE status='active' ORDER BY name",
      )
    ).rows;
    res
      .set("Cache-Control", "no-store")
      .json({
        fileName: `${req.params.kind}-registration-template.xlsx`,
        contentBase64: template(role, batches).toString("base64"),
      });
  } catch (error) {
    next(error);
  }
});
router.post(
  "/users/imports/:kind/preview",
  (req, res, next) =>
    upload.single("file")(req, res, (error) =>
      error
        ? res
            .status(400)
            .json({
              error: {
                code: "INVALID_UPLOAD",
                message: "Upload one spreadsheet, maximum 5 MB",
              },
            })
        : next(),
    ),
  async (req, res, next) => {
    const performance = createImportPerformance(`registration-${req.params.kind}-preview`, req.requestId);
    try {
      const role = roleFor(req.params.kind);
      const batchId =
        role === "STUDENT" ? String(req.body.academicBatchId || "") : null;
      if (role === "STUDENT" && !/^[1-9]\d*$/.test(batchId))
        fail("Select an academic batch before uploading");
      const rows = await performance.measure("fileParsingMs", () => parseFile(req.file, role));
      const validated = await performance.measure("previewValidationMs", () => validateRows(pool, role, rows, batchId));
      if (
        role === "STUDENT" &&
        !(
          await pool.query(
            "SELECT 1 FROM academic_batches WHERE academic_batch_id::text=$1 AND status='active'",
            [batchId],
          )
        ).rows.length
      )
        fail("Select an existing active academic batch");
      const id = randomUUID();
      await performance.measure("previewPersistenceMs", () => pool.query(
        `INSERT INTO registration_imports (import_id,created_by,account_role,academic_batch_id,source_filename,submitted_rows) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          req.user.id,
          role,
          batchId,
          req.file.originalname.slice(0, 255),
          JSON.stringify(rows),
        ],
      ));
      performance.log({ rows: rows.length, valid: summary(validated).valid });
      res.set("Cache-Control", "no-store").json({
        importId: id,
        rows: responseRows(validated),
        summary: summary(validated),
        errorReport: report(
          role,
          validated.filter((r) => r.status !== "Valid"),
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.post("/users/imports/:kind/confirm", async (req, res, next) => {
  const performance = createImportPerformance(`registration-${req.params.kind}-confirm`, req.requestId);
  try {
    const role = roleFor(req.params.kind),
      { importId, mode } = req.body;
    if (
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId || "") ||
      !["valid-only", "strict"].includes(mode)
    )
      fail("Choose a valid import session and confirmation mode");
    // Bcrypt cost-12 work does not need a database transaction. The locked
    // validation below remains authoritative, so concurrent imports still
    // cannot create duplicate identities.
    const preparedHashes = new Map();
    const preflight = await pool.query(
      "SELECT * FROM registration_imports WHERE import_id=$1 AND created_by=$2 AND account_role=$3",
      [importId, req.user.id, role],
    );
    const preflightSession = preflight.rows[0];
    if (preflightSession?.status === "PREVIEW" && new Date(preflightSession.expires_at) >= new Date()) {
      const preliminary = await performance.measure("preflightValidationMs", () => validateRows(
        pool,
        role,
        preflightSession.submitted_rows,
        preflightSession.academic_batch_id ? String(preflightSession.academic_batch_id) : null,
      ));
      await performance.measure("passwordHashingMs", async () => {
        for (const row of preliminary) {
          if (row.status === "Valid")
            preparedHashes.set(row.record.email, await bcrypt.hash(normalizeMobile(row.record.mobileNumber), 12));
        }
      });
    }
    const result = await performance.measure("transactionMs", () => withTransaction(async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM registration_imports WHERE import_id=$1 AND created_by=$2 AND account_role=$3 FOR UPDATE",
        [importId, req.user.id, role],
      );
      const session = rows[0];
      if (!session) fail("Import session not found", 404);
      if (session.status === "CONFIRMED") return session.result;
      if (new Date(session.expires_at) < new Date())
        fail("Import preview expired. Upload the file again", 410);
      const validated = await validateRows(
        client,
        role,
        session.submitted_rows,
        session.academic_batch_id ? String(session.academic_batch_id) : null,
      );
      if (mode === "strict" && validated.some((r) => r.status !== "Valid"))
        return {
          confirmed: false,
          importId,
          rows: responseRows(validated),
          summary: summary(validated),
          errorReport: report(
            role,
            validated.filter((r) => r.status !== "Valid"),
          ),
        };
      const output = [];
      for (const row of validated) {
        if (row.status === "Valid") {
          await client.query("SAVEPOINT registration_row");
          try {
            const account = await registerAccount(row.record, role, req.user, {
              client,
              checkExistingDetails: true,
              passwordHash: preparedHashes.get(row.record.email),
            });
            row.status = "Imported";
            row.message = row.linksExistingStudent
              ? "Linked existing student to login account"
              : "Account created";
            row.userId = account.userId;
            await client.query("RELEASE SAVEPOINT registration_row");
          } catch (error) {
            await client.query("ROLLBACK TO SAVEPOINT registration_row");
            await client.query("RELEASE SAVEPOINT registration_row");
            if (mode === "strict")
              fail(
                "Import rolled back. A record changed or could not be registered. Refresh the preview and retry",
                409,
              );
            row.status = error.statusCode ? statusFor(error) : "Failed";
            row.message = error.statusCode
              ? error.message
              : "Registration failed; no account was created for this row";
          }
        }
        const { record, ...safe } = row;
        output.push({ ...safe, submitted: safeSubmitted(row.submitted) });
      }
      const result = {
        confirmed: true,
        importId,
        rows: output,
        imported: output.filter((r) => r.status === "Imported").length,
        skipped: output.filter((r) => r.status !== "Imported").length,
        errorReport: report(role, output),
      };
      await client.query(
        `UPDATE registration_imports SET status='CONFIRMED',result=$2,submitted_rows='[]'::jsonb WHERE import_id=$1`,
        [importId, JSON.stringify(result)],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Users',$3,'success')`,
        [
          req.user.id,
          req.user.name,
          `Confirmed ${role.toLowerCase()} import ${importId}: ${result.imported} imported, ${result.skipped} skipped`,
        ],
      );
      return result;
    }));
    performance.log({ rows: result.rows?.length, imported: result.imported, skipped: result.skipped });
    res.set("Cache-Control", "no-store").json(result);
  } catch (error) {
    next(error);
  }
});
module.exports = { router, template, parseFile, validateRows };
