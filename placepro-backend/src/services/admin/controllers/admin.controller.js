const { Router } = require("express");
const bcrypt = require("bcryptjs");
const { pool, withTransaction, writeAuditLog } = require("../../../config/db");
const { recomputeAndSyncStudentReadiness, buildStudentResponseObject } = require("../../../utils/student-metrics");
const { requireAuth, requireRole } = require("../../../middleware/auth.middleware");

const { registerAccount, findStudentByIdentity } = require("../../../utils/registration");
const router = Router();
const trainerIdsOf = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(String))];

function validateBatchSections(value) {
  if (!Array.isArray(value) || value.length > 1000) {
    const error = new Error("Sections must be an array containing at most 1,000 names");
    error.statusCode = 400; error.code = "VALIDATION"; throw error;
  }
  const sections = value.map((section) => typeof section === "string" ? section.trim() : "");
  if (sections.some((section) => !section || section.length > 10)) {
    const error = new Error("Each section name must contain 1-10 characters");
    error.statusCode = 400; error.code = "VALIDATION"; throw error;
  }
  const normalized = sections.map((section) => section.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    const error = new Error("Section names must be unique");
    error.statusCode = 400; error.code = "VALIDATION"; throw error;
  }
  return sections;
}

async function trainerSummaries(ids, db = pool) {
  const normalized = trainerIdsOf(ids);
  if (!normalized.length) return [];
  const { rows } = await db.query(
    `SELECT user_id::text AS id, full_name AS name, status
     FROM users WHERE role='TRAINER' AND user_id::text=ANY($1::text[])
     ORDER BY user_id`,
    [normalized]
  );
  return rows;
}

function batchDto(row, trainers) {
  return {
    id: String(row.academic_batch_id),
    name: row.name,
    department: row.department,
    academicYears: row.academic_years,
    sections: row.sections || [],
    trainerIds: trainerIdsOf(row.trainer_ids),
    trainers,
    status: row.status,
    studentCount: Number(row.student_count || 0),
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    archivedBy: row.archived_by ? { id: String(row.archived_by), name: row.archived_by_name || "Unknown administrator" } : null,
  };
}

async function loadBatchDto(db, batchId) {
  const { rows } = await db.query(
    `SELECT ab.*, archiver.full_name AS archived_by_name,
      (SELECT COUNT(*)::int FROM students s WHERE s.academic_batch_id=ab.academic_batch_id OR s.batch=ab.name) AS student_count
     FROM academic_batches ab LEFT JOIN users archiver ON archiver.user_id=ab.archived_by
     WHERE ab.academic_batch_id::text=$1`,
    [batchId]
  );
  if (!rows.length) return null;
  return batchDto(rows[0], await trainerSummaries(rows[0].trainer_ids, db));
}

async function validateTrainerIds(ids, existing = [], db = pool) {
  if (!Array.isArray(ids) || ids.some(id => !["string", "number"].includes(typeof id) || !/^[1-9]\d*$/.test(String(id)) || BigInt(id) > 9223372036854775807n)) {
    const error = new Error("Trainer assignments must contain valid user IDs");
    error.statusCode = 400; throw error;
  }
  const normalized = trainerIdsOf(ids);
  // Existing unresolved assignments are retained for explicit administrator review.
  const added = normalized.filter(id => !existing.includes(id));
  if (added.length) {
    const { rows } = await db.query("SELECT user_id::text AS id FROM users WHERE user_id=ANY($1::bigint[]) AND role='TRAINER' AND status='active'", [added]);
    if (rows.length !== added.length) {
      const error = new Error("New assignments must reference existing active trainer accounts");
      error.statusCode = 400; throw error;
    }
  }
  return normalized;
}
router.use(require("../registration-imports").router);
router.post("/users/trainers", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try { res.status(201).json(await registerAccount(req.body, "TRAINER", req.user)); }
  catch (error) { next(error); }
});

router.get("/users", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { q = "", role, status, page = "1", pageSize = "10" } = req.query;
    if (typeof q !== "string" || (role !== undefined && (typeof role !== "string" || !["admin", "trainer", "student"].includes(role.toLowerCase()))) ||
        (status !== undefined && (typeof status !== "string" || !["active", "inactive"].includes(status))) ||
        ![page, pageSize].every(value => typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))) ||
        Number(page) > 2147483647 || Number(pageSize) > 1000) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid filters or pagination (pageSize must be 1–1000)" } });
    }
    const conditions = ["(full_name ILIKE $1 OR email ILIKE $1)"];
    const params = [`%${q}%`];

    if (role) {
      params.push(role.toUpperCase());
      conditions.push(`role = $${params.length}::user_role`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}::account_status`);
    }

    const p = Number(page);
    const ps = Number(pageSize);
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE ${conditions.join(" AND ")}`, params);
    const total = count.rows[0].total;
    const offset = (p - 1) * ps;
    if (offset >= total) {
      return res.json({ items: [], page: p, pageSize: ps, total });
    }

    const { rows } = await pool.query(
      `SELECT *, (SELECT batch FROM students WHERE user_id=users.user_id) AS student_batch,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.academic_batch_id::text, 'name', b.name) ORDER BY b.name)
         FROM academic_batches b WHERE b.trainer_ids @> to_jsonb(ARRAY[users.user_id::text]) OR b.trainer_ids @> to_jsonb(ARRAY[users.user_id])), '[]'::jsonb) AS assigned_batches
       FROM users
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC, user_id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, ps, offset]
    );

    res.json({
      items: rows.map((u) => ({
        id: String(u.user_id),
        name: u.full_name,
        email: u.email,
        role: String(u.role).toLowerCase(),
        status: u.status,
        mobileNumber: u.mobile_number ?? "",
        assignedBatches: u.assigned_batches ?? [],
        batch: u.student_batch ?? undefined,
      })),
      page: p,
      pageSize: ps,
      total,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/users", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { name, email, role = "trainer", status = "active" } = req.body;
    if (role === "trainer") return res.status(201).json(await registerAccount(req.body, "TRAINER", req.user));
    if (role === "student") return res.status(201).json(await registerAccount(req.body, "STUDENT", req.user));
    if (role !== "admin") return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid role" } });
    const { normalizeMobile } = require("../../../utils/registration");
    const mobile = normalizeMobile(req.body.mobileNumber);
    const defaultHash = await bcrypt.hash(mobile, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status, mobile_number, must_change_password)
       VALUES ($1, $2, $3, $4::user_role, $5::account_status, $6, TRUE) RETURNING *`,
      [name, email.trim().toLowerCase(), defaultHash, String(role).toUpperCase(), status, mobile]
    );
    const u = rows[0];
    await writeAuditLog(req.user.id, req.user.name, "Users", `Created user ${email} (${role})`);

    res.status(201).json({
      id: String(u.user_id),
      name: u.full_name,
      email: u.email,
      role: String(u.role).toLowerCase(),
      status: u.status,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/users/:userId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { name, role, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           role = COALESCE($2::user_role, role),
           status = COALESCE($3::account_status, status)
       WHERE user_id = $4 RETURNING *`,
      [name, role ? String(role).toUpperCase() : null, status, req.params.userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    const u = rows[0];
    res.json({
      id: String(u.user_id),
      name: u.full_name,
      email: u.email,
      role: String(u.role).toLowerCase(),
      status: u.status,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/batches", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const status = req.query.status === undefined ? "active" : req.query.status;
    if (typeof status !== "string" || !["active", "archived"].includes(status)) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Status must be active or archived" } });
    }
    const params = [status];
    const conditions = ["ab.status=$1::batch_status"];
    if (req.user.role === "trainer") {
      params.push(String(req.user.id));
      conditions.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(ab.trainer_ids)='array' THEN ab.trainer_ids ELSE '[]'::jsonb END) trainer_id WHERE trainer_id=$2)`);
    }
    const { rows } = await pool.query(
      `SELECT ab.*, archiver.full_name AS archived_by_name, COUNT(s.student_id)::int AS student_count,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', u.user_id::text, 'name', u.full_name, 'status', u.status) ORDER BY u.user_id)
         FROM users u WHERE u.role='TRAINER' AND u.user_id::text IN
         (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(ab.trainer_ids)='array' THEN ab.trainer_ids ELSE '[]'::jsonb END))), '[]'::jsonb) AS trainers
       FROM academic_batches ab
       LEFT JOIN users archiver ON archiver.user_id=ab.archived_by
       LEFT JOIN students s ON s.academic_batch_id = ab.academic_batch_id OR s.batch = ab.name
       WHERE ${conditions.join(" AND ")}
       GROUP BY ab.academic_batch_id, archiver.full_name
       ORDER BY ab.created_at DESC`,
      params
    );
    res.json(rows.map((b) => batchDto(b, b.trainers)));
  } catch (err) {
    next(err);
  }
});

router.post("/batches", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { name, department, academicYears, sections = ["A", "B"], trainerIds = [] } = req.body;
    const normalizedTrainerIds = await validateTrainerIds(trainerIds);
    const normalizedSections = validateBatchSections(sections);
    const { rows } = await pool.query(
      `INSERT INTO academic_batches (name, department, academic_years, sections, trainer_ids, status)
       VALUES ($1, $2, $3, $4, $5, $6::batch_status) RETURNING *`,
      [name, department, academicYears, JSON.stringify(normalizedSections), JSON.stringify(normalizedTrainerIds), "active"]
    );
    const b = rows[0];

    res.status(201).json({
      id: String(b.academic_batch_id),
      name: b.name,
      department: b.department,
      academicYears: b.academic_years,
      sections: b.sections,
      trainerIds: trainerIdsOf(b.trainer_ids),
      trainers: await trainerSummaries(b.trainer_ids),
      status: b.status,
      studentCount: 0,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/batches/:batchId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { name, department, academicYears, sections, trainerIds, status } = req.body;
    if (status !== undefined) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Use the archive or restore action to change batch status" } });
    }
    const saved = await withTransaction(async (client) => {
      const current = await client.query(
        "SELECT * FROM academic_batches WHERE academic_batch_id=$1 FOR UPDATE",
        [req.params.batchId]
      );
      if (!current.rows.length) return null;
      const batch = current.rows[0];
      if (batch.status === "archived") {
        const error = new Error("Restore this batch before editing it"); error.statusCode = 409; error.code = "BATCH_ARCHIVED"; throw error;
      }
      const normalizedTrainerIds = trainerIds === undefined
        ? undefined
        : await validateTrainerIds(trainerIds, trainerIdsOf(batch.trainer_ids), client);
      let normalizedSections;
      if (sections !== undefined) {
        normalizedSections = validateBatchSections(sections);
        const nextNames = new Set(normalizedSections.map((section) => section.toLocaleLowerCase()));
        const removed = validateBatchSections(batch.sections ?? []).filter(
          (section) => !nextNames.has(section.toLocaleLowerCase())
        );
        if (removed.length) {
          const referenced = await client.query(
            `SELECT section, COUNT(*)::int AS count FROM students
             WHERE (academic_batch_id=$1 OR batch=$2) AND section=ANY($3::text[])
             GROUP BY section ORDER BY section`,
            [batch.academic_batch_id, batch.name, removed]
          );
          if (referenced.rows.length) {
            const details = referenced.rows.map((row) => ({
              field: "section", section: row.section, count: row.count, batchId: String(batch.academic_batch_id),
              message: `Cannot delete Section ${row.section} because ${row.count} student${row.count === 1 ? " is" : "s are"} currently assigned to it. Transfer or unassign them first.`,
            }));
            const error = new Error(details.map((detail) => detail.message).join(" "));
            error.statusCode = 409; error.code = "SECTIONS_IN_USE"; error.details = details; throw error;
          }
        }
      }
      const result = await client.query(
        `UPDATE academic_batches SET name=COALESCE($1,name),department=COALESCE($2,department),
         academic_years=COALESCE($3,academic_years),sections=COALESCE($4,sections),
         trainer_ids=COALESCE($5,trainer_ids),status=COALESCE($6::batch_status,status)
         WHERE academic_batch_id=$7 RETURNING *`,
        [name, department, academicYears,
          normalizedSections === undefined ? null : JSON.stringify(normalizedSections),
          normalizedTrainerIds === undefined ? null : JSON.stringify(normalizedTrainerIds),
          null, req.params.batchId]
      );
      const count = await client.query(
        "SELECT COUNT(*)::int AS count FROM students WHERE academic_batch_id=$1 OR batch=$2",
        [batch.academic_batch_id, batch.name]
      );
      return { batch: result.rows[0], studentCount: count.rows[0].count };
    });
    if (!saved) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });
    const b = saved.batch;
    res.json({
      id: String(b.academic_batch_id),
      name: b.name,
      department: b.department,
      academicYears: b.academic_years,
      sections: b.sections,
      trainerIds: trainerIdsOf(b.trainer_ids),
      trainers: await trainerSummaries(b.trainer_ids),
      status: b.status,
      studentCount: saved.studentCount,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/batches/:batchId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  res.status(405).json({ error: { code: "BATCH_DELETION_DISABLED", message: "Permanent batch deletion is disabled. Archive the batch instead." } });
});

router.post("/batches/:batchId/archive", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const found = await withTransaction(async (client) => {
      const { rows } = await client.query("SELECT * FROM academic_batches WHERE academic_batch_id=$1 FOR UPDATE", [req.params.batchId]);
      if (!rows.length) return false;
      if (rows[0].status === "archived") return true;
      await client.query(
        `UPDATE academic_batches SET status='archived',archived_at=CURRENT_TIMESTAMP,archived_by=$2 WHERE academic_batch_id=$1`,
        [req.params.batchId, req.user.id]
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Batches',$3,'success')`,
        [req.user.id, req.user.name, `Archived batch ${rows[0].name} (${rows[0].academic_batch_id})`]
      );
      return true;
    });
    if (!found) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });
    res.json(await loadBatchDto(pool, req.params.batchId));
  } catch (error) { next(error); }
});

router.post("/batches/:batchId/restore", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const found = await withTransaction(async (client) => {
      const { rows } = await client.query("SELECT * FROM academic_batches WHERE academic_batch_id=$1 FOR UPDATE", [req.params.batchId]);
      if (!rows.length) return false;
      if (rows[0].status === "active") return true;
      await client.query(
        `UPDATE academic_batches SET status='active',archived_at=NULL,archived_by=NULL WHERE academic_batch_id=$1`,
        [req.params.batchId]
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Batches',$3,'success')`,
        [req.user.id, req.user.name, `Restored batch ${rows[0].name} (${rows[0].academic_batch_id})`]
      );
      return true;
    });
    if (!found) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });
    res.json(await loadBatchDto(pool, req.params.batchId));
  } catch (error) { next(error); }
});

router.post("/batches/:batchId/trainer-assignments/resolve", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const missingTrainerId = typeof req.body?.missingTrainerId === "string" || typeof req.body?.missingTrainerId === "number"
      ? String(req.body.missingTrainerId) : "";
    const action = req.body?.action;
    const replacementTrainerId = req.body?.replacementTrainerId === undefined ? "" : String(req.body.replacementTrainerId);
    if (!/^[1-9]\d*$/.test(missingTrainerId) || !["remove", "replace"].includes(action) ||
        (action === "replace" && !/^[1-9]\d*$/.test(replacementTrainerId))) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Provide a valid unresolved assignment action" } });
    }
    const result = await withTransaction(async (client) => {
      const batchResult = await client.query("SELECT * FROM academic_batches WHERE academic_batch_id=$1 FOR UPDATE", [req.params.batchId]);
      if (!batchResult.rows.length) return null;
      const batch = batchResult.rows[0];
      const current = trainerIdsOf(batch.trainer_ids);
      if (!current.includes(missingTrainerId)) {
        const error = new Error(`Trainer assignment ${missingTrainerId} is no longer present`); error.statusCode = 409; error.code = "ASSIGNMENT_CHANGED"; throw error;
      }
      const missingAccount = await client.query("SELECT 1 FROM users WHERE user_id=$1 AND role='TRAINER'", [missingTrainerId]);
      if (missingAccount.rows.length) {
        const error = new Error(`User ID ${missingTrainerId} is a valid trainer and cannot be resolved as missing`); error.statusCode = 409; error.code = "ASSIGNMENT_IS_VALID"; throw error;
      }
      let next;
      let auditAction;
      if (action === "remove") {
        next = current.filter((id) => id !== missingTrainerId);
        auditAction = `Removed unresolved trainer assignment ${missingTrainerId} from batch ${batch.name} (${batch.academic_batch_id})`;
      } else {
        const replacement = await client.query(
          "SELECT user_id,full_name FROM users WHERE user_id=$1 AND role='TRAINER' AND status='active' FOR KEY SHARE",
          [replacementTrainerId]
        );
        if (!replacement.rows.length) {
          const error = new Error("Replacement must be an existing active trainer"); error.statusCode = 400; error.code = "INVALID_REPLACEMENT"; throw error;
        }
        if (current.includes(replacementTrainerId)) {
          const error = new Error("Replacement trainer is already assigned to this batch"); error.statusCode = 409; error.code = "DUPLICATE_ASSIGNMENT"; throw error;
        }
        next = current.map((id) => id === missingTrainerId ? replacementTrainerId : id);
        auditAction = `Replaced unresolved trainer assignment ${missingTrainerId} with ${replacement.rows[0].full_name} (${replacementTrainerId}) in batch ${batch.name} (${batch.academic_batch_id})`;
      }
      await client.query("UPDATE academic_batches SET trainer_ids=$2::jsonb WHERE academic_batch_id=$1", [batch.academic_batch_id, JSON.stringify(next)]);
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Batches',$3,'success')`,
        [req.user.id, req.user.name, auditAction]
      );
      return batch.academic_batch_id;
    });
    if (!result) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });
    res.json(await loadBatchDto(pool, String(result)));
  } catch (error) { next(error); }
});

router.get("/batches/:batchId/stats", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const batchParams = [req.params.batchId];
    const access = req.user.role === "trainer"
      ? (batchParams.push(String(req.user.id)), ` AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(trainer_ids)='array' THEN trainer_ids ELSE '[]'::jsonb END) trainer_id WHERE trainer_id=$2)`)
      : "";
    const batch = await pool.query(
      `SELECT academic_batch_id, name, sections FROM academic_batches WHERE academic_batch_id::text=$1${access}`,
      batchParams
    );
    if (!batch.rows.length) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });
    const params = [String(batch.rows[0].academic_batch_id), batch.rows[0].name];
    const population = "SELECT * FROM students WHERE academic_batch_id::text=$1 OR batch=$2";
    const counts = await pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE readiness_status='PR')::int AS pr,
      COUNT(*) FILTER (WHERE readiness_status='NPR')::int AS npr,
      COALESCE(ROUND(AVG(cgpa),2),0)::float AS cgpa FROM (${population}) population`, params);
    // Match the existing per-student domain mean, including zero for unscored students.
    const domains = await pool.query(`WITH population AS (${population}),
      skill_means AS (
        SELECT sr.student_id, st.domain_id, st.skill_id, ROUND(AVG(sr.score_percentage),1) AS score
        FROM skill_ratings sr JOIN population p ON p.student_id=sr.student_id
        JOIN skill_taxonomy st ON st.skill_id=sr.skill_id AND st.deleted_at IS NULL
        GROUP BY sr.student_id,st.domain_id,st.skill_id
      ), domain_means AS (
        SELECT student_id,domain_id,ROUND(AVG(score),1) AS score FROM skill_means GROUP BY student_id,domain_id
      ) SELECT d.name AS label,
        COALESCE(ROUND(SUM(m.score) / NULLIF((SELECT COUNT(*) FROM population),0),1),0)::float AS value
      FROM evaluation_domains d LEFT JOIN domain_means m ON m.domain_id=d.domain_id
      WHERE EXISTS (SELECT 1 FROM skill_taxonomy st WHERE st.domain_id=d.domain_id AND st.deleted_at IS NULL)
      GROUP BY d.domain_id,d.name ORDER BY d.domain_id`, params);
    const topRows = await pool.query(`SELECT * FROM (${population}) population ORDER BY average_score DESC, student_id DESC LIMIT 3`, params);
    const top = await Promise.all(topRows.rows.map(row => buildStudentResponseObject(pool, row)));
    const sectionCounts = await pool.query(
      `SELECT configured.section, COUNT(s.student_id)::int AS count
       FROM unnest($3::text[]) WITH ORDINALITY configured(section, position)
       LEFT JOIN students s ON (s.academic_batch_id::text=$1 OR s.batch=$2) AND s.section=configured.section
       GROUP BY configured.section, configured.position ORDER BY configured.position`,
      [...params, batch.rows[0].sections || []]
    );
    const count = counts.rows[0];
    res.json({ batchId: req.params.batchId, studentCount: count.total, prCount: count.pr,
      nprCount: count.npr, averageCgpa: count.cgpa, domains: domains.rows, top,
      sectionCounts: sectionCounts.rows });
  } catch (err) { next(err); }
});

function validateDomain(req, res, next) {
  const body = req.body;
  const invalid = (message) => res.status(400).json({ error: { code: "VALIDATION", message } });
  if ((req.method === "POST" || body.name !== undefined) &&
      (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100)) {
    return invalid("Domain name must contain 1-100 characters.");
  }
  if (body.name !== undefined) body.name = body.name.trim();
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 2000)) {
    return invalid("Description must be at most 2000 characters.");
  }
  if (body.code !== undefined && body.code !== null) {
    if (typeof body.code !== "string") return invalid("Domain code must be text.");
    body.code = body.code.trim();
    if (body.code && !/^[a-z][a-z0-9_]{0,39}$/.test(body.code)) {
      return invalid("Domain code must start with a lowercase letter and contain up to 40 lowercase letters, numbers or underscores.");
    }
  }
  if (body.active !== undefined && typeof body.active !== "boolean") return invalid("Active must be a boolean.");
  next();
}

function domainDto(row) {
  return {
    id: String(row.domain_id), code: row.domain_code, name: row.name,
    description: row.description || "", active: Boolean(row.is_active),
    parameterCount: Number(row.parameter_count || 0),
  };
}

router.get("/domains", requireAuth, requireRole(["admin", "trainer", "student"]), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT d.domain_id, d.domain_code, d.name, d.description, d.is_active,
        COUNT(st.skill_id)::int AS parameter_count
      FROM evaluation_domains d
      LEFT JOIN skill_taxonomy st ON st.domain_id = d.domain_id
      GROUP BY d.domain_id
      ORDER BY d.domain_id`);
    res.json(rows.map(domainDto));
  } catch (err) { next(err); }
});

router.post("/domains", requireAuth, requireRole(["admin"]), validateDomain, async (req, res, next) => {
  try {
    const { name, description = "", code, active = true } = req.body;
    const { rows } = await pool.query(`INSERT INTO evaluation_domains (domain_code, name, description, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING domain_id, domain_code, name, description, is_active, 0::int AS parameter_count`,
    [code || null, name, description, active]);
    res.status(201).json(domainDto(rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: { code: "DUPLICATE_DOMAIN", message: "A domain with this name or code already exists." } });
    next(err);
  }
});

router.patch("/domains/:domainId", requireAuth, requireRole(["admin"]), validateDomain, async (req, res, next) => {
  try {
    if (!/^[1-9]\d{0,18}$/.test(req.params.domainId) || BigInt(req.params.domainId) > 9223372036854775807n) {
      return res.status(400).json({ error: { code: "INVALID_DOMAIN_ID", message: "Invalid domain id." } });
    }
    const { name, description, code, active } = req.body;
    const { rows } = await pool.query(`UPDATE evaluation_domains
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          domain_code = CASE WHEN $3::boolean THEN NULLIF($4, '') ELSE domain_code END,
          is_active = COALESCE($5, is_active)
      WHERE domain_id = $6
      RETURNING domain_id, domain_code, name, description, is_active,
        (SELECT COUNT(*)::int FROM skill_taxonomy st WHERE st.domain_id = evaluation_domains.domain_id) AS parameter_count`,
    [name ?? null, description ?? null, Object.hasOwn(req.body, "code"), code || "", active ?? null, req.params.domainId]);
    if (!rows.length) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Domain not found." } });
    res.json(domainDto(rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: { code: "DUPLICATE_DOMAIN", message: "A domain with this name or code already exists." } });
    next(err);
  }
});

router.delete("/domains/:domainId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    if (!/^[1-9]\d{0,18}$/.test(req.params.domainId) || BigInt(req.params.domainId) > 9223372036854775807n) {
      return res.status(400).json({ error: { code: "INVALID_DOMAIN_ID", message: "Invalid domain id." } });
    }
    const { rows } = await pool.query(`DELETE FROM evaluation_domains d
      WHERE d.domain_id = $1 AND NOT EXISTS (SELECT 1 FROM skill_taxonomy st WHERE st.domain_id = d.domain_id)
      RETURNING d.domain_id`, [req.params.domainId]);
    if (!rows.length) {
      const exists = await pool.query("SELECT 1 FROM evaluation_domains WHERE domain_id = $1", [req.params.domainId]);
      if (!exists.rowCount) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Domain not found." } });
      return res.status(409).json({ error: { code: "DOMAIN_IN_USE", message: "This domain has associated parameters or historical results. Deactivate it instead." } });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === "23503") return res.status(409).json({ error: { code: "DOMAIN_IN_USE", message: "This domain is still in use. Deactivate it instead." } });
    next(err);
  }
});

router.get("/skills", requireAuth, requireRole(["admin", "trainer", "student"]), async (req, res, next) => {
  try {
    const active = req.query.active === "true" ? true : req.query.active === "false" ? false : null;
    const { rows } = await pool.query(
      `SELECT st.*, d.name AS domain_name FROM skill_taxonomy st
       JOIN evaluation_domains d ON d.domain_id = st.domain_id
       WHERE st.deleted_at IS NULL AND ($1::boolean IS NULL OR st.is_active = $1) ORDER BY st.skill_id ASC`, [active]
    );

    res.json(
      rows.map(skill => ({ ...skillDto(skill), parameterType: skill.parameter_type || "numeric" }))
    );
  } catch (err) {
    next(err);
  }
});

function validateSkill(req, res, next) {
  const b = req.body;
  const invalid = (message) => res.status(400).json({ error: { code: "VALIDATION", message } });
  if ((req.method === "POST" || b.name !== undefined) && (typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > 80)) return invalid("Subject name must contain 1-80 characters.");
  if (b.name !== undefined) b.name = b.name.trim();
  if (b.code !== undefined && (req.method !== "POST" || typeof b.code !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(b.code))) return invalid("Subject code must start with a lowercase letter and contain up to 40 lowercase letters, numbers or underscores. Codes cannot be changed after creation.");
  if (b.description !== undefined && (typeof b.description !== "string" || b.description.length > 5000)) return invalid("Description must be at most 5000 characters.");
  for (const key of ["active", "defaultVisible"]) if (b[key] !== undefined && typeof b[key] !== "boolean") return invalid(`${key} must be a boolean.`);
  if (req.method === "POST" && b.domainId === undefined && b.domain === undefined) return invalid("Select a domain for this parameter.");
  if (b.domainId !== undefined && !/^[1-9]\d{0,18}$/.test(String(b.domainId))) return invalid("Invalid domain id.");
  if (b.domain !== undefined && (typeof b.domain !== "string" || !b.domain.trim() || b.domain.trim().length > 100)) return invalid("Invalid subject domain.");
  if (b.parameterType !== undefined && !["numeric", "text"].includes(b.parameterType)) return invalid("Invalid parameter type.");
  next();
}

async function resolveSkillDomain(body, currentDomainId = null) {
  if (body.domainId === undefined && body.domain === undefined) return null;
  const { rows } = await pool.query(`SELECT domain_id, name FROM evaluation_domains
    WHERE (domain_id = $1::bigint OR lower(btrim(name)) = lower(btrim($2)))
      AND (is_active = TRUE OR domain_id = $3::bigint)
    ORDER BY CASE WHEN domain_id = $1::bigint THEN 0 ELSE 1 END LIMIT 1`,
  [body.domainId ?? null, body.domain ?? null, currentDomainId]);
  return rows[0] || null;
}

function skillDto(skill) {
  return {
    id: skill.skill_code,
    name: skill.skill_name,
    domain: skill.domain_name,
    domainId: String(skill.domain_id),
    description: skill.description || "",
    parameterType: skill.parameter_type,
    active: Boolean(skill.is_active),
    defaultVisible: Boolean(skill.default_visible),
    numericId: String(skill.skill_id),
  };
}

router.post("/skills", requireAuth, requireRole(["admin"]), validateSkill, async (req, res, next) => {
  try {
    const {
      name,
      description = "",
      parameterType = "numeric",
      active = true,
      defaultVisible = false,
    } = req.body;
    const domain = await resolveSkillDomain(req.body);
    if (!domain) return res.status(400).json({ error: { code: "INVALID_DOMAIN", message: "Select an active domain for this parameter." } });
    const code = req.body.code || String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    if (!code) return res.status(400).json({ error: { code: "VALIDATION", message: "Subject name must include letters or numbers for its identifier." } });

    const inserted = await pool.query(
      `INSERT INTO skill_taxonomy (skill_code, skill_name, domain_id, description, parameter_type, is_active, default_visible)
       VALUES ($1, $2, $3, $4, $5::param_type, $6, $7) RETURNING skill_id`,
      [code, name, domain.domain_id, description, parameterType, active, defaultVisible]
    );
    const { rows } = await pool.query(`SELECT st.*, d.name AS domain_name FROM skill_taxonomy st
      JOIN evaluation_domains d ON d.domain_id = st.domain_id WHERE st.skill_id = $1`, [inserted.rows[0].skill_id]);
    res.status(201).json(skillDto(rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: { code: "DUPLICATE_SUBJECT", message: "A subject with this name or identifier already exists." } });
    next(err);
  }
});

router.patch("/skills/:skillId", requireAuth, requireRole(["admin"]), validateSkill, async (req, res, next) => {
  try {
    const { name, description, active, defaultVisible, parameterType } = req.body;
    const current = await pool.query(`SELECT skill_id, domain_id FROM skill_taxonomy
      WHERE (skill_code = $1 OR CAST(skill_id AS TEXT) = $1) AND deleted_at IS NULL`, [req.params.skillId]);
    if (!current.rows.length) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Skill not found" } });
    const domain = await resolveSkillDomain(req.body, current.rows[0].domain_id);
    if ((req.body.domainId !== undefined || req.body.domain !== undefined) && !domain) {
      return res.status(400).json({ error: { code: "INVALID_DOMAIN", message: "Select an active domain for this parameter." } });
    }
    const updated = await pool.query(
      `UPDATE skill_taxonomy
       SET skill_name = COALESCE($1, skill_name),
           description = COALESCE($2, description),
           is_active = COALESCE($3, is_active),
           default_visible = COALESCE($5, default_visible),
           domain_id = COALESCE($6::bigint, domain_id),
           parameter_type = COALESCE($7::param_type, parameter_type)
       WHERE skill_id = $4 AND deleted_at IS NULL RETURNING skill_id`,
      [name, description, active, current.rows[0].skill_id, defaultVisible, domain?.domain_id ?? null, parameterType]
    );
    const { rows } = await pool.query(`SELECT st.*, d.name AS domain_name FROM skill_taxonomy st
      JOIN evaluation_domains d ON d.domain_id = st.domain_id WHERE st.skill_id = $1`, [updated.rows[0].skill_id]);
    res.json(skillDto(rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: { code: "DUPLICATE_SUBJECT", message: "A subject with this name or identifier already exists." } });
    next(err);
  }
});

router.delete("/skills/:skillId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE skill_taxonomy SET deleted_at = NOW(), is_active = FALSE
       WHERE skill_code = $1 OR CAST(skill_id AS TEXT) = $1`,
      [req.params.skillId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get("/audit-logs", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { q = "", module: moduleName, status, page = "1", pageSize = "15" } = req.query;
    const conditions = ["(action ILIKE $1 OR actor_name ILIKE $1)"];
    const params = [`%${q}%`];

    if (moduleName) {
      params.push(moduleName);
      conditions.push(`module = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}::audit_status`);
    }

    const p = Math.max(1, parseInt(page, 10));
    const ps = Math.max(1, parseInt(pageSize, 10));

    const { rows } = await pool.query(
      `SELECT *, COUNT(*) OVER() AS total_count FROM audit_logs
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, ps, (p - 1) * ps]
    );

    res.json({
      items: rows.map((l) => ({
        id: String(l.log_id),
        actor: l.actor_name,
        module: l.module,
        action: l.action,
        status: l.status,
        timestamp: new Date(l.created_at).toISOString(),
      })),
      page: p,
      pageSize: ps,
      total: rows.length ? Number(rows[0].total_count) : 0,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/import-student-reviews", requireAuth, requireRole(["admin"]), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.review_id, r.row_number, r.roll_no, r.raw_row, r.created_at, r.status, r.rejection_reason,
              ib.batch_id AS import_id, ib.event_title, ib.original_filename,
              ab.name AS batch_name
       FROM import_student_reviews r
       JOIN import_batches ib ON ib.batch_id = r.import_batch_id
       LEFT JOIN academic_batches ab ON ab.academic_batch_id = ib.academic_batch_id
       ORDER BY r.created_at ASC`
    );

    res.json(
      rows.map((row) => ({
        id: String(row.review_id),
        importId: String(row.import_id),
        rowNumber: row.row_number,
        rollNumber: row.roll_no,
        rawRow: row.raw_row,
        assessmentName: row.event_title,
        fileName: row.original_filename,
        batchName: row.batch_name || "Unassigned batch",
        createdAt: new Date(row.created_at).toISOString(),
        status: row.status,
        rejectionReason: row.rejection_reason,
      }))
    );
  } catch (err) {
    next(err);
  }
});
router.post("/import-student-reviews/:reviewId/approve", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { name, email, branch = "CSE", section = "A" } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Student name and email are required" } });
    }

    const result = await withTransaction(async (client) => {
      const reviewRes = await client.query(
        `SELECT r.*, ib.*
         FROM import_student_reviews r
         JOIN import_batches ib ON ib.batch_id = r.import_batch_id
         WHERE r.review_id = $1 FOR UPDATE`,
        [req.params.reviewId]
      );

      if (!reviewRes.rows.length) {
        const error = new Error("Pending student review not found");
        error.statusCode = 404;
        throw error;
      }

      const review = reviewRes.rows[0];
      if (review.status !== "PENDING" || review.import_status !== "CONFIRMED") {
        const error = new Error("This verification request has already been reviewed");
        error.statusCode = 409;
        throw error;
      }

      const existingStudent = await findStudentByIdentity(client, {
        rollNumber: review.roll_no, name, email, academicBatchId: review.academic_batch_id,
      });

      const batchRes = review.academic_batch_id
        ? await client.query(`SELECT name FROM academic_batches WHERE academic_batch_id = $1`, [review.academic_batch_id])
        : { rows: [] };
      const batchName = batchRes.rows[0]?.name || "Unassigned";

      const studentRes = existingStudent
        ? null
        : await client.query(
            `INSERT INTO students
             (academic_batch_id, roll_no, full_name, email, batch, branch, section)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING student_id`,
            [
              review.academic_batch_id,
              review.roll_no,
              String(name).trim(),
              String(email).trim().toLowerCase(),
              batchName,
              branch,
              section,
            ]
          );

      const studentId = existingStudent ? existingStudent.student_id : studentRes.rows[0].student_id;
      const mapping = review.column_mapping_config || {};
      const skillColumns = mapping.skillColumns || [];

      let totalMarks = 0;
      let totalMax = 0;
      const ratings = [];

      for (const column of skillColumns) {
        const skillRes = await client.query(
          `SELECT skill_id FROM skill_taxonomy
           WHERE skill_code = $1 OR CAST(skill_id AS TEXT) = $1`,
          [String(column.skillId)]
        );
        if (!skillRes.rows.length) {
          throw new Error(`Skill '${column.skillId}' no longer exists`);
        }

        const score = Number(review.raw_row[review.headers[column.columnIndex]]);
        const maxMarks = Number(column.maxMarks);
        if (!Number.isFinite(maxMarks) || maxMarks <= 0 || !Number.isFinite(score) || score < 0 || score > maxMarks) {
          throw new Error(`The saved score for '${review.headers[column.columnIndex]}' is invalid`);
        }

        totalMarks += score;
        totalMax += maxMarks;
        ratings.push({ skillId: skillRes.rows[0].skill_id, score, maxMarks });
      }

      const overallPct = totalMax ? Number(((totalMarks / totalMax) * 100).toFixed(2)) : 0;
      const evaluationRes = await client.query(
        `INSERT INTO evaluation_records
         (batch_id, student_id, trainer_id, marks_obtained, max_marks, overall_score_pct, raw_excel_row)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING record_id`,
        [
          review.batch_id,
          studentId,
          review.uploaded_by,
          totalMarks,
          totalMax,
          overallPct,
          JSON.stringify(review.raw_row),
        ]
      );

      for (const rating of ratings) {
        await client.query(
          `INSERT INTO skill_ratings
           (student_id, skill_id, marks_obtained, max_marks, score_percentage, source_type, source_id)
           VALUES ($1, $2, $3, $4, $5, $6::event_type, $7)`,
          [
            studentId,
            rating.skillId,
            rating.score,
            rating.maxMarks,
            Number(((rating.score / rating.maxMarks) * 100).toFixed(2)),
            review.event_type,
            evaluationRes.rows[0].record_id,
          ]
        );
      }

      await recomputeAndSyncStudentReadiness(client, studentId);

      await client.query(
        `UPDATE import_student_reviews
         SET status = 'APPROVED', student_id = $1, reviewed_by = $2, reviewed_at = NOW(), proposed_student_data = $3
         WHERE review_id = $4`,
        [
          studentId,
          req.user.id,
          JSON.stringify({ name: String(name).trim(), email: String(email).trim().toLowerCase(), branch, section }),
          review.review_id,
        ]
      );

      return { id: String(studentId), rollNumber: review.roll_no, name: String(name).trim() };
    });

    await writeAuditLog(req.user.id, req.user.name, "Imports", `Approved unmatched roll number ${result.rollNumber} and created ${result.name}`);
    res.status(201).json({ student: result });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: { code: "REVIEW_FAILED", message: err.message } });
    }
    next(err);
  }
});
router.delete("/import-student-reviews/:reviewId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || "Rejected by administrator").trim();
    const { rows } = await pool.query(
      `UPDATE import_student_reviews
       SET status = 'REJECTED', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2, raw_row = '{}'::jsonb
       WHERE review_id = $3 AND status = 'PENDING' RETURNING roll_no`,
      [req.user.id, reason, req.params.reviewId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Pending student review not found" } });
    }

    await writeAuditLog(req.user.id, req.user.name, "Imports", `Rejected unmatched roll number ${rows[0].roll_no}: ${reason}`, "warning");
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
