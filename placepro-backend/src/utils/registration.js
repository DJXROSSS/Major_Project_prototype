const bcrypt = require("bcryptjs");
const { withTransaction } = require("../config/db");

function invalid(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function normalizeMobile(value) {
  if (typeof value !== "string") invalid("Mobile number is required");
  let phone = value.replace(/[\s()-]/g, "");
  if (phone.startsWith("+91")) phone = phone.slice(3);
  else if (/^91\d{10}$/.test(phone)) phone = phone.slice(2);
  else if (/^0\d{10}$/.test(phone)) phone = phone.slice(1);
  if (!/^[6-9]\d{9}$/.test(phone))
    invalid("Enter a valid 10-digit Indian mobile number");
  return phone;
}
function positiveId(value) {
  return (
    ["string", "number"].includes(typeof value) &&
    /^[1-9]\d*$/.test(String(value)) &&
    BigInt(value) <= 9223372036854775807n
  );
}

async function findStudentByIdentity(
  client,
  { rollNumber, name, email, academicBatchId },
  { lock = true } = {},
) {
  const roll =
    typeof rollNumber === "string" ? rollNumber.trim().toUpperCase() : "";
  if (!roll || roll.length > 50)
    invalid("Roll number is required (maximum 50 characters)");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100)
    invalid("Full name is required (maximum 100 characters)");
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    email.trim().length > 120
  )
    invalid("Enter a valid email address");
  const { rows } = await client.query(
    `SELECT * FROM students WHERE upper(btrim(roll_no))=$1 OR lower(btrim(email))=$2 ${lock ? "FOR UPDATE" : ""}`,
    [roll, email.trim().toLowerCase()],
  );
  if (!rows.length) return null;
  const student = rows[0];
  if (
    rows.length !== 1 ||
    student.roll_no.trim().toUpperCase() !== roll ||
    student.email.trim().toLowerCase() !== email.trim().toLowerCase() ||
    student.full_name.trim().toLowerCase() !== name.trim().toLowerCase()
  ) {
    invalid(
      "Existing student identity does not match. Use the existing name, roll number and email",
      409,
    );
  }
  if (
    academicBatchId &&
    student.academic_batch_id &&
    String(student.academic_batch_id) !== String(academicBatchId)
  ) {
    invalid("Existing student belongs to a different academic batch", 409);
  }
  return student;
}

async function registerAccount(body, role, actor, options = {}) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name || name.length > 100)
    invalid("Full name is required (maximum 100 characters)");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)
    invalid("Enter a valid email address");
  const mobile = normalizeMobile(body.mobileNumber);
  const roll =
    typeof body.rollNumber === "string"
      ? body.rollNumber.trim().toUpperCase()
      : "";
  const ids =
    role === "STUDENT" ? [body.academicBatchId] : body.assignedBatchIds;
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !positiveId(id)))
    invalid("Select valid academic batches");
  const batchIds = [...new Set(ids.map(String))];
  if (role === "STUDENT" && (!roll || roll.length > 50))
    invalid("Roll number is required (maximum 50 characters)");
  if (
    role === "STUDENT" &&
    body.cgpa !== undefined &&
    (typeof body.cgpa !== "number" ||
      !Number.isFinite(body.cgpa) ||
      body.cgpa < 0 ||
      body.cgpa > 10)
  )
    invalid("CGPA must be between 0 and 10");
  const passwordHash = options.validateOnly
    ? null
    : await bcrypt.hash(mobile, 12);
  try {
    const work = async (client) => {
      // Registration requests for the same email serialize even before a users row exists.
      if (!options.validateOnly)
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [email],
        );
      const batches = await client.query(
        `SELECT * FROM academic_batches WHERE academic_batch_id=ANY($1::bigint[]) ORDER BY academic_batch_id ${options.validateOnly ? "" : "FOR UPDATE"}`,
        [batchIds],
      );
      if (
        batches.rows.length !== batchIds.length ||
        batches.rows.some((b) => b.status !== "active")
      )
        invalid("Select existing active academic batches");
      const duplicateUser = await client.query(
        `SELECT user_id FROM users WHERE lower(btrim(email))=$1`,
        [email],
      );
      if (duplicateUser.rows.length)
        invalid("This email already has a login account", 409);
      const batch = batches.rows[0];
      let student;
      let section = body.section ?? "";
      if (role === "STUDENT") {
        if (
          typeof section !== "string" ||
          section.length > 10 ||
          ((batch.sections || []).length && !batch.sections.includes(section))
        )
          invalid("Choose a section from the selected batch");
        student = await findStudentByIdentity(
          client,
          { rollNumber: roll, name, email, academicBatchId: batchIds[0] },
          { lock: !options.validateOnly },
        );
        if (student) {
          if (student.user_id)
            invalid("This student already has an account", 409);
          if (
            options.checkExistingDetails &&
            ((body.cgpa !== undefined && Number(student.cgpa) !== body.cgpa) ||
              (section && student.section && student.section !== section))
          )
            invalid(
              "Existing student CGPA or section conflicts with the supplied details",
              409,
            );
        }
      } else {
        const duplicateStudent = await client.query(
          `SELECT student_id FROM students WHERE lower(btrim(email))=$1`,
          [email],
        );
        if (duplicateStudent.rows.length)
          invalid("This email belongs to a student record", 409);
      }
      if (options.validateOnly)
        return { valid: true, linksExistingStudent: Boolean(student) };
      const created = await client.query(
        `INSERT INTO users (full_name,email,mobile_number,password_hash,role,title,must_change_password)
        VALUES ($1,$2,$3,$4,$5::user_role,$6,TRUE) RETURNING user_id`,
        [
          name,
          email,
          mobile,
          passwordHash,
          role,
          role === "STUDENT" ? "Student" : "Trainer",
        ],
      );
      const userId = created.rows[0].user_id;
      if (role === "STUDENT") {
        if (student) {
          // Account linking must not reset scores, CGPA, projects or assessment relationships.
          await client.query(
            `UPDATE students SET user_id=$1, academic_batch_id=COALESCE(academic_batch_id,$2), batch=$3 WHERE student_id=$4`,
            [userId, batchIds[0], batch.name, student.student_id],
          );
        } else {
          const inserted = await client.query(
            `INSERT INTO students (user_id,academic_batch_id,roll_no,full_name,email,batch,branch,section,cgpa)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING student_id`,
            [
              userId,
              batchIds[0],
              roll,
              name,
              email,
              batch.name,
              batch.department,
              section,
              body.cgpa ?? 0,
            ],
          );
          student = inserted.rows[0];
        }
      } else {
        await client.query(
          `UPDATE academic_batches SET trainer_ids=COALESCE(trainer_ids,'[]'::jsonb) || to_jsonb($1::text) WHERE academic_batch_id=ANY($2::bigint[])`,
          [String(userId), batchIds],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Users',$3,'success')`,
        [
          actor.id,
          actor.name,
          `Registered ${role.toLowerCase()} account ${userId}`,
        ],
      );
      return {
        id: String(userId),
        userId: String(userId),
        ...(student ? { studentId: String(student.student_id) } : {}),
        name,
        email,
        role: role.toLowerCase(),
        status: "active",
        mustChangePassword: true,
        assignedBatchIds: batchIds,
      };
    };
    return options.client
      ? await work(options.client)
      : await withTransaction(work);
  } catch (error) {
    if (error.code === "23505")
      invalid("Email or roll number is already registered", 409);
    throw error;
  }
}
module.exports = { registerAccount, normalizeMobile, findStudentByIdentity };
