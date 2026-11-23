const { Router } = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } = require("node:crypto");
const { pool, withTransaction } = require("../../config/db");
const {
  requireAuth,
  requireRole,
} = require("../../middleware/auth.middleware");
const { registerAccount, normalizeMobile, insertStudentAccounts, positiveId } = require("../../utils/registration");
const { csvCell } = require("../companies/shortlist-export");
const { createImportPerformance } = require("../../utils/import-performance");
const { hashConcurrency, prepareImportHashes } = require("../../utils/import-password-hashing");
const router = Router();
const MAX_ROWS = 5000;
const MAX_SHEET_ROWS = 50000;
const DEFAULT_CHUNK_SIZE = 500;
const MIN_CHUNK_SIZE = 50;
const MAX_CHUNK_SIZE = 1000;
const previewKey = createHmac("sha256", process.env.JWT_SECRET || "placepro-dev-secret")
  .update("placepro:registration-preview:v1")
  .digest();
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
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
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
function chunkSizeFor(value) {
  if (value === undefined) return DEFAULT_CHUNK_SIZE;
  const chunkSize = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(chunkSize) || chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE)
    fail(`Choose a whole-number chunk size between ${MIN_CHUNK_SIZE} and ${MAX_CHUNK_SIZE}`);
  return chunkSize;
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
      "Fill Registration; keep its headers unchanged. Maximum 5,000 records, 5 MB.",
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
      sheets: 0,
      // Reserve a sentinel row because SheetJS CSV parsing may omit !fullref.
      sheetRows: MAX_SHEET_ROWS + 2,
    });
  } catch {
    fail("Unable to read this spreadsheet");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.["!ref"]) fail("Spreadsheet has no registration data");
  const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
  if (range.e.r > MAX_SHEET_ROWS)
    fail("The worksheet is too sparse to process safely. Remove unused rows and upload it again.");
  if (range.e.c - range.s.c + 1 !== headers[role].length)
    fail(`Headers must be: ${headers[role].join(", ")}`);
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
    const sheetRow = range.s.r + index + 1;
    const hasFormula = actual.some(
      (_header, col) =>
        sheet[XLSX.utils.encode_cell({ r: sheetRow, c: range.s.c + col })]?.f,
    );
    rows.push({ rowNumber: sheetRow + 1, submitted, hasFormula });
  });
  if (!rows.length) fail("The spreadsheet contains no registration records");
  if (rows.length > MAX_ROWS)
    fail(`Your file contains ${rows.length.toLocaleString("en-US")} records. The maximum allowed is ${MAX_ROWS.toLocaleString("en-US")}. Please split the data into smaller files.`);
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
async function getStudentBatch(db, batchId, lock = false) {
  if (!batchId) return null;
  const { rows } = await db.query(
    `SELECT * FROM academic_batches WHERE academic_batch_id=$1 ${lock ? "FOR SHARE" : ""}`,
    [batchId],
  );
  return rows[0] ?? null;
}

async function validateRows(db, role, rows, batchId, options = {}) {
  const studentBatch = role === "STUDENT"
    ? (Object.hasOwn(options, "studentBatch") ? options.studentBatch : await getStudentBatch(db, batchId))
    : null;
  const batches = role === "TRAINER" ? (await db.query("SELECT * FROM academic_batches")).rows : [];
  const batchById = new Map(batches.map((batch) => [String(batch.academic_batch_id), batch]));
  const batchesByIdentifier = new Map();
  for (const batch of batches) {
    for (const identifier of new Set([String(batch.academic_batch_id), batch.name.trim().toLowerCase()])) {
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
  // These queries may use the transaction client during confirmation. Keep them
  // sequential: node-postgres clients do not support concurrent query execution.
  const existingUsers = normalizedEmails.length
    ? await db.query("SELECT user_id, lower(btrim(email)) AS email FROM users WHERE lower(btrim(email))=ANY($1::text[])", [normalizedEmails])
    : { rows: [] };
  const existingStudents = normalizedEmails.length || normalizedRolls.length
    ? await db.query(
      `SELECT * FROM students
       WHERE lower(btrim(email))=ANY($1::text[]) OR upper(btrim(roll_no))=ANY($2::text[])
       ${options.lockStudents ? "ORDER BY student_id FOR UPDATE" : ""}`,
      [normalizedEmails, normalizedRolls],
    )
    : { rows: [] };
  const usersByEmail = new Map(existingUsers.rows.map((user) => [user.email, user]));
  const studentsByEmail = new Map();
  const studentsByRoll = new Map();
  for (const student of existingStudents.rows) {
    const email = student.email.trim().toLowerCase();
    const roll = student.roll_no.trim().toUpperCase();
    studentsByEmail.set(email, [...(studentsByEmail.get(email) || []), student]);
    studentsByRoll.set(roll, [...(studentsByRoll.get(roll) || []), student]);
  }
  const validated = [];
  for (const row of rows) {
    const submitted = row.submitted;
    const record = { ...submitted, email: submitted.email.toLowerCase() };
    let status = "Valid", message = "", studentId;
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
        const batch = studentBatch;
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
          ...(studentsByRoll.get(submitted.rollNumber.toUpperCase()) || []),
          ...(studentsByEmail.get(record.email) || []),
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
          studentId = student.student_id;
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
        if (studentsByEmail.has(record.email))
          fail("This email belongs to a student record", 409);
      }
    } catch (error) {
      if (!error.statusCode) throw error;
      if (status === "Valid") status = statusFor(error);
      message = error.message;
    }
    validated.push({ ...row, record, status, message, studentId, linksExistingStudent: studentId != null });
  }
  return validated;
}
function responseRows(rows) {
  return rows.map(({ record, studentId, ...row }) => ({ ...row, submitted: safeSubmitted(row.submitted) }));
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
    duplicates: rows.filter((r) => r.status === "Duplicate in File").length,
  };
}
// Contact numbers double as temporary credentials: redact them in downloadable reports and stored results.
function safeSubmitted(submitted) {
  return {
    ...submitted,
    mobileNumber: submitted.mobileNumber ? "[redacted]" : "",
  };
}

function sealRows(rows, importId) {
  return rows.map(({ submitted: { mobileNumber, ...submitted }, ...row }) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", previewKey, iv);
    cipher.setAAD(Buffer.from(`${importId}:${row.rowNumber}`));
    const encrypted = Buffer.concat([cipher.update(mobileNumber, "utf8"), cipher.final()]);
    const sealedMobile = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
    return { ...row, submitted, sealedMobile };
  });
}

function openRows(session) {
  return session.submitted_rows.map(({ sealedMobile, ...row }) => {
    if (sealedMobile === undefined) return row; // Previously created previews can still be confirmed.
    try {
      const bytes = Buffer.from(sealedMobile, "base64");
      const decipher = createDecipheriv("aes-256-gcm", previewKey, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(`${session.import_id}:${row.rowNumber}`));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const mobileNumber = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
      return { ...row, submitted: { ...row.submitted, mobileNumber } };
    } catch {
      fail("Import preview could not be opened. Upload the file again", 410);
    }
  });
}

function processingPlan(processingRows, chunkSize) {
  return { chunkSize, processingRows, totalChunks: Math.ceil(processingRows / chunkSize) };
}

function isRowFailure(error) {
  return error.statusCode === 400 || error.statusCode === 409 ||
    /^(22|23)[0-9A-Z]{3}$/.test(error.code) || error.code === "P0001";
}

function markWriteFailure(row, error) {
  if (error.code === "23505") {
    row.status = "Already Registered";
    row.message = "Email or roll number is already registered";
  } else {
    row.status = error.statusCode ? statusFor(error) : "Failed";
    row.message = error.statusCode ? error.message : "Registration failed; no account was created for this row";
  }
}

function markImported(row, userId) {
  row.status = "Imported";
  row.message = row.linksExistingStudent ? "Linked existing student to login account" : "Account created";
  row.userId = userId;
}

async function writeStudentChunk(client, rows, batch, actor, hashes, mode) {
  if (mode === "valid-only") await client.query("SAVEPOINT registration_chunk");
  let accounts;
  try {
    accounts = await insertStudentAccounts(client, rows.map(({ record, studentId }) => ({
      name: record.name,
      email: record.email,
      mobile: normalizeMobile(record.mobileNumber),
      password_hash: hashes.get(record.email),
      roll: record.rollNumber.toUpperCase(),
      section: record.section,
      cgpa: record.cgpa ?? 0,
      studentId,
    })), batch, actor);
  } catch (error) {
    if (!isRowFailure(error)) throw error;
    if (mode === "strict") failStrictWrite();
    await client.query("ROLLBACK TO SAVEPOINT registration_chunk");
    await client.query("RELEASE SAVEPOINT registration_chunk");
    if (rows.length === 1) {
      markWriteFailure(rows[0], error);
      return;
    }
    // Keep the normal path bulk and narrow a write failure down to its rows.
    const middle = Math.floor(rows.length / 2);
    await writeStudentChunk(client, rows.slice(0, middle), batch, actor, hashes, mode);
    await writeStudentChunk(client, rows.slice(middle), batch, actor, hashes, mode);
    return;
  }
  if (mode === "valid-only") await client.query("RELEASE SAVEPOINT registration_chunk");
  for (const row of rows) markImported(row, accounts.get(row.record.email).userId);
}

function failStrictWrite() {
  fail("Import rolled back. A record changed or could not be registered. Refresh the preview and retry", 409);
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
      const chunkSize = chunkSizeFor(req.body.chunkSize);
      const batchId =
        role === "STUDENT" ? String(req.body.academicBatchId || "") : null;
      if (role === "STUDENT" && !positiveId(batchId))
        fail("Select an academic batch before uploading");
      const rows = await performance.measure("fileParsingMs", () => parseFile(req.file, role));
      const studentBatch = role === "STUDENT" ? await getStudentBatch(pool, batchId) : null;
      if (role === "STUDENT" && studentBatch?.status !== "active")
        fail("Select an existing active academic batch");
      const validated = await performance.measure("previewValidationMs", () => validateRows(pool, role, rows, batchId, { studentBatch }));
      const id = randomUUID();
      await performance.measure("previewPersistenceMs", () => pool.query(
        `INSERT INTO registration_imports (import_id,created_by,account_role,academic_batch_id,source_filename,submitted_rows) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          req.user.id,
          role,
          batchId,
          req.file.originalname.slice(0, 255),
          JSON.stringify(sealRows(rows, id)),
        ],
      ));
      const importSummary = summary(validated);
      performance.log({ rows: rows.length, valid: importSummary.valid });
      res.set("Cache-Control", "no-store").json({
        importId: id,
        fileName: req.file.originalname,
        rows: responseRows(validated),
        summary: importSummary,
        ...processingPlan(importSummary.valid, chunkSize),
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
  const preparedHashes = new Map();
  let result;
  try {
    const role = roleFor(req.params.kind),
      { importId, mode } = req.body;
    const chunkSize = chunkSizeFor(req.body.chunkSize);
    if (
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId || "") ||
      !["valid-only", "strict"].includes(mode)
    )
      fail("Choose a valid import session and confirmation mode");
    const preflight = await pool.query(
      "SELECT * FROM registration_imports WHERE import_id=$1 AND created_by=$2 AND account_role=$3",
      [importId, req.user.id, role],
    );
    const preflightSession = preflight.rows[0];
    if (!preflightSession) fail("Import session not found", 404);
    if (preflightSession.status === "CONFIRMED") {
      result = preflightSession.result;
      return res.set("Cache-Control", "no-store").json(result);
    }
    if (new Date(preflightSession.expires_at) < new Date())
      fail("Import preview expired. Upload the file again", 410);
    const submitted = openRows(preflightSession);
    const batchId = preflightSession.academic_batch_id ? String(preflightSession.academic_batch_id) : null;
    const preliminary = await performance.measure("preflightValidationMs", () => validateRows(pool, role, submitted, batchId));
    const eligible = preliminary.filter((row) => row.status === "Valid");
    if (mode === "valid-only" || eligible.length === preliminary.length)
      await performance.measure("passwordHashingMs", () => prepareImportHashes(eligible.map((row) => row.record), preparedHashes));
    result = await performance.measure("transactionMs", () => withTransaction(async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM registration_imports WHERE import_id=$1 AND created_by=$2 AND account_role=$3 FOR UPDATE",
        [importId, req.user.id, role],
      );
      const session = rows[0];
      if (!session) fail("Import session not found", 404);
      if (session.status === "CONFIRMED") return session.result;
      if (new Date(session.expires_at) < new Date())
        fail("Import preview expired. Upload the file again", 410);
      const lockedBatchId = session.academic_batch_id ? String(session.academic_batch_id) : null;
      const studentBatch = role === "STUDENT" ? await getStudentBatch(client, lockedBatchId, true) : null;
      const validated = await validateRows(client, role, submitted, lockedBatchId, {
        studentBatch, lockStudents: role === "STUDENT",
      });
      if (mode === "strict" && validated.some((r) => r.status !== "Valid"))
        return {
          confirmed: false,
          importId,
          mode,
          fileName: session.source_filename,
          rows: responseRows(validated),
          summary: summary(validated),
          ...processingPlan(0, chunkSize),
          errorReport: report(
            role,
            validated.filter((r) => r.status !== "Valid"),
          ),
        };
      const rowsToImport = validated.filter((row) => row.status === "Valid");
      if (rowsToImport.some((row) => !preparedHashes.has(row.record.email)))
        fail("Records changed during confirmation. Confirm the import again to revalidate them", 409);
      for (let offset = 0; offset < rowsToImport.length; offset += chunkSize) {
        const chunk = rowsToImport.slice(offset, offset + chunkSize);
        if (role === "STUDENT") {
          await writeStudentChunk(client, chunk, studentBatch, req.user, preparedHashes, mode);
          continue;
        }
        for (const row of chunk) {
          await client.query("SAVEPOINT registration_row");
          try {
            const account = await registerAccount(row.record, role, req.user, {
              client,
              checkExistingDetails: true,
              passwordHash: preparedHashes.get(row.record.email),
            });
            markImported(row, account.userId);
            await client.query("RELEASE SAVEPOINT registration_row");
          } catch (error) {
            if (!isRowFailure(error)) throw error;
            if (mode === "strict") failStrictWrite();
            await client.query("ROLLBACK TO SAVEPOINT registration_row");
            await client.query("RELEASE SAVEPOINT registration_row");
            markWriteFailure(row, error);
          }
        }
      }
      const output = responseRows(validated);
      const imported = output.filter((r) => r.status === "Imported").length;
      const result = {
        confirmed: true,
        importId,
        mode,
        fileName: session.source_filename,
        rows: output,
        imported,
        skipped: output.length - imported,
        failed: rowsToImport.length - imported,
        ...processingPlan(rowsToImport.length, chunkSize),
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
    res.set("Cache-Control", "no-store").json(result);
  } catch (error) {
    next(error);
  } finally {
    performance.log({
      rows: result?.rows?.length,
      imported: result?.imported ?? 0,
      skipped: result?.skipped ?? 0,
      hashConcurrency,
      hashCount: preparedHashes.size,
    });
  }
});
module.exports = { router, template, parseFile, validateRows };
