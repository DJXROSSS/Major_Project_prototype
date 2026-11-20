const { Router } = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { randomUUID } = require("node:crypto");
const { pool, withTransaction } = require("../../config/db");
const {
  requireAuth,
  requireRole,
} = require("../../middleware/auth.middleware");
const { registerAccount } = require("../../utils/registration");
const { csvCell } = require("../companies/shortlist-export");
const router = Router();
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
  const emails = new Map(),
    rolls = new Map();
  for (const r of rows) {
    const email = r.submitted.email.toLowerCase();
    const roll = (r.submitted.rollNumber || "").toUpperCase();
    if (email) emails.set(email, (emails.get(email) || 0) + 1);
    if (role === "STUDENT" && roll) rolls.set(roll, (rolls.get(roll) || 0) + 1);
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
      } else {
        record.assignedBatchIds = submitted.assignedBatches
          .split(/[;,]/)
          .map((identifier) => {
            const value = identifier.trim().toLowerCase();
            const matches = batches.filter(
              (b) =>
                String(b.academic_batch_id) === value ||
                b.name.trim().toLowerCase() === value,
            );
            if (!value || matches.length !== 1)
              fail("Unknown or ambiguous batch identifier");
            return String(matches[0].academic_batch_id);
          });
        record.assignedBatchIds = [...new Set(record.assignedBatchIds)];
      }
      const checked = await registerAccount(record, role, null, {
        client: db,
        validateOnly: true,
        checkExistingDetails: true,
      });
      linksExistingStudent = checked.linksExistingStudent;
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
    try {
      const role = roleFor(req.params.kind);
      const batchId =
        role === "STUDENT" ? String(req.body.academicBatchId || "") : null;
      if (role === "STUDENT" && !/^[1-9]\d*$/.test(batchId))
        fail("Select an academic batch before uploading");
      const rows = parseFile(req.file, role);
      const validated = await validateRows(pool, role, rows, batchId);
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
      await pool.query(
        `INSERT INTO registration_imports (import_id,created_by,account_role,academic_batch_id,source_filename,submitted_rows) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          req.user.id,
          role,
          batchId,
          req.file.originalname.slice(0, 255),
          JSON.stringify(rows),
        ],
      );
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
  try {
    const role = roleFor(req.params.kind),
      { importId, mode } = req.body;
    if (
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId || "") ||
      !["valid-only", "strict"].includes(mode)
    )
      fail("Choose a valid import session and confirmation mode");
    const result = await withTransaction(async (client) => {
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
    });
    res.set("Cache-Control", "no-store").json(result);
  } catch (error) {
    next(error);
  }
});
module.exports = { router, template, parseFile, validateRows };
