const { Router } = require("express");
const { pool, withTransaction } = require("../../../config/db");
const { buildStudentResponseObject } = require("../../../utils/student-metrics");
const { requireAuth, requireRole } = require("../../../middleware/auth.middleware");
const profileIntelligenceRouter = require("./profile-intelligence.controller");
const projectsRouter = require("./projects.controller");

const { registerAccount, normalizeMobile } = require("../../../utils/registration");
const router = Router();

const trainerAssignmentSql = (batchAlias, parameter) => `EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(${batchAlias}.trainer_ids)='array' THEN ${batchAlias}.trainer_ids ELSE '[]'::jsonb END
  ) trainer_id WHERE trainer_id=$${parameter}
)`;

function trainerStudentScope(studentAlias, parameter) {
  return `EXISTS (SELECT 1 FROM academic_batches access_batch
    WHERE (access_batch.academic_batch_id=${studentAlias}.academic_batch_id OR access_batch.name=${studentAlias}.batch)
      AND ${trainerAssignmentSql("access_batch", parameter)})`;
}

async function lockStudentAndBatch(client, studentId, actor) {
  const studentResult = await client.query(
    `SELECT s.*, u.mobile_number FROM students s LEFT JOIN users u ON u.user_id=s.user_id
     WHERE s.student_id=$1 FOR UPDATE OF s`,
    [studentId],
  );
  if (!studentResult.rows.length) return null;
  const student = studentResult.rows[0];
  const batchResult = await client.query(
    `SELECT * FROM academic_batches
     WHERE academic_batch_id=$1 OR ($1 IS NULL AND name=$2)
     ORDER BY academic_batch_id LIMIT 1 FOR UPDATE`,
    [student.academic_batch_id, student.batch],
  );
  const batch = batchResult.rows[0] || null;
  if (actor.role === "trainer" && (!batch || !trainerIds(batch.trainer_ids).includes(String(actor.id)))) {
    const error = new Error("You can only manage students in your assigned batches");
    error.statusCode = 403; error.code = "FORBIDDEN"; throw error;
  }
  return { student, batch };
}

function trainerIds(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

router.post("/students", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const created = req.user.role === "admin"
      ? await registerAccount(req.body, "STUDENT", req.user)
      : await withTransaction(async (client) => {
        const batch = await client.query(
          `SELECT trainer_ids FROM academic_batches WHERE academic_batch_id=$1 FOR UPDATE`,
          [req.body.academicBatchId],
        );
        if (!batch.rows.length || !trainerIds(batch.rows[0].trainer_ids).includes(String(req.user.id))) {
          const error = new Error("You can only add students to your assigned batches");
          error.statusCode = 403; error.code = "FORBIDDEN"; throw error;
        }
        return registerAccount(req.body, "STUDENT", req.user, { client });
      });
    res.status(201).json(created);
  }
  catch (error) { next(error); }
});

router.use(profileIntelligenceRouter);
router.use(require("./github-preview.controller"));
router.use(projectsRouter);

// Preferences are owned by the authenticated user, never a request-supplied user id.
router.get("/me/subject-columns", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`UPDATE users SET subject_column_preferences =
      CASE WHEN subject_column_preferences IS NULL THEN NULL ELSE
        COALESCE((SELECT jsonb_object_agg(skill_code, default_visible) FROM skill_taxonomy WHERE deleted_at IS NULL), '{}'::jsonb)
        || subject_column_preferences END
      WHERE user_id = $1 RETURNING subject_column_preferences`, [req.user.id]);
    res.json({ columns: rows[0].subject_column_preferences });
  } catch (err) { next(err); }
});
router.patch("/me/subject-columns", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const { columns, reset } = req.body;
    if (reset !== true && (!columns || typeof columns !== "object" || Array.isArray(columns) || Object.values(columns).some(v => typeof v !== "boolean"))) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Columns must map subject identifiers to booleans." } });
    }
    if (reset !== true) {
      const known = await pool.query("SELECT skill_code FROM skill_taxonomy WHERE deleted_at IS NULL");
      const codes = new Set(known.rows.map(r => r.skill_code));
      if (Object.keys(columns).some(k => !codes.has(k))) return res.status(400).json({ error: { code: "VALIDATION", message: "Unknown subject identifier." } });
    }
    const { rows } = await pool.query(`UPDATE users SET subject_column_preferences = CASE WHEN $2 THEN NULL ELSE
      COALESCE((SELECT jsonb_object_agg(skill_code, default_visible) FROM skill_taxonomy WHERE deleted_at IS NULL), '{}'::jsonb)
      || COALESCE(subject_column_preferences, '{}'::jsonb) || $3::jsonb END
      WHERE user_id = $1 RETURNING subject_column_preferences`, [req.user.id, reset === true, JSON.stringify(columns || {})]);
    res.json({ columns: rows[0].subject_column_preferences });
  } catch (err) { next(err); }
});

router.get("/students", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const {
      q = "",
      batchId,
      section,
      prStatus,
      domain,
      domainId,
      page = "1",
      pageSize = "10",
      sort = "name_asc",
    } = req.query;

    const conditions = ["1=1"];
    const params = [];

    if (req.user.role === "trainer") {
      params.push(String(req.user.id));
      conditions.push(trainerStudentScope("s", params.length));
    }

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`
        (s.full_name ILIKE $${params.length} OR 
        s.roll_no ILIKE $${params.length} OR 
        s.email ILIKE $${params.length})
      `);
    }

    if (batchId) {
      params.push(batchId);
      conditions.push(`
        (CAST(s.academic_batch_id AS TEXT) = $${params.length} OR 
        s.batch = $${params.length})
      `);
    }

    if (section) {
      params.push(section);
      conditions.push(`s.section = $${params.length}`);
    }

    if (prStatus === "PR" || prStatus === "NPR") {
      params.push(prStatus);
      conditions.push(`s.readiness_status = $${params.length}::readiness_status`);
    }

    if (domainId || domain) {
      params.push(domainId || domain);
      conditions.push(`
        EXISTS (
          SELECT 1 
          FROM skill_ratings sr
          JOIN skill_taxonomy st 
            ON st.skill_id = sr.skill_id
          JOIN evaluation_domains d ON d.domain_id = st.domain_id
          WHERE sr.student_id = s.student_id 
            AND (CAST(d.domain_id AS TEXT) = $${params.length} OR lower(d.name) = lower($${params.length}))
          GROUP BY sr.student_id
          HAVING AVG(sr.score_percentage) < 60
        )
      `);
    }

    const projectFilters = {
      "has-project": "project_count > 0", "no-project": "project_count = 0",
      "score-below-60": "project_score < 60", "score-at-least-60": "project_score >= 60",
    };
    const projectCondition = Object.hasOwn(projectFilters, req.query.projectFilter) ? projectFilters[req.query.projectFilter] : null;
    if (projectCondition) conditions.push(`(SELECT ${projectCondition} FROM (
      SELECT COUNT(*) AS project_count, ROUND(AVG(score.final_score), 2) AS project_score
      FROM projects p
      JOIN LATERAL (SELECT final_score FROM project_score_snapshots WHERE project_id = p.project_id AND final_score IS NOT NULL ORDER BY computed_at DESC, project_score_snapshot_id DESC LIMIT 1) score ON TRUE
      JOIN LATERAL (SELECT review_status FROM project_reviews WHERE project_id = p.project_id ORDER BY created_at DESC, project_review_id DESC LIMIT 1) review ON TRUE
      WHERE p.student_id = s.student_id AND p.ownership_status = 'VERIFIED' AND review.review_status = 'APPROVED'
    ) project_metrics)`);

    const orderMap = {
      cgpa_desc: "s.cgpa DESC NULLS LAST",
      cgpa_asc: "s.cgpa ASC NULLS LAST",
      name_asc: "LOWER(s.full_name) ASC",
      name_desc: "LOWER(s.full_name) DESC",
    };
    const orderBy = Object.hasOwn(orderMap, sort) ? orderMap[sort] : orderMap.name_asc;
    let p = /^\d+$/.test(page) && Number.isSafeInteger(Number(page)) ? Math.max(1, Number(page)) : 1;
    const ps = /^\d+$/.test(pageSize) ? Math.min(1000, Math.max(1, Number(pageSize))) : 10;

    const countRes = await pool.query(
      `SELECT COUNT(*) 
       FROM students s 
       WHERE ${conditions.join(" AND ")}`,
      params
    );

    const total = parseInt(countRes.rows[0].count, 10);
    p = Math.min(p, Math.max(1, Math.ceil(total / ps)));
    const offset = (p - 1) * ps;
    const rowsRes = await pool.query(
      `SELECT s.*, u.mobile_number FROM students s LEFT JOIN users u ON u.user_id=s.user_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${orderBy}, s.student_id ASC
       LIMIT $${params.length + 1} 
       OFFSET $${params.length + 2}`,
      [...params, ps, offset]
    );

    const items = await Promise.all(rowsRes.rows.map((row) => buildStudentResponseObject(pool, row)));
    res.json({ items, page: p, pageSize: ps, total });
  } catch (err) {
    next(err);
  }
});

router.get("/students/:studentId", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const params = [req.params.studentId];
    const access = req.user.role === "trainer"
      ? (params.push(String(req.user.id)), ` AND ${trainerStudentScope("s", params.length)}`)
      : "";
    const { rows } = await pool.query(
      `SELECT s.*, u.mobile_number FROM students s LEFT JOIN users u ON u.user_id=s.user_id WHERE student_id = $1${access}`,
      params
    );
    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" } });
    }
    res.json(await buildStudentResponseObject(pool, rows[0]));
  } catch (err) {
    next(err);
  }
});

router.patch("/students/:studentId", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const allowed = ["name", "email", "mobileNumber", "section", "cgpa"];
    if (!req.body || Object.keys(req.body).some((key) => !allowed.includes(key)) || !Object.keys(req.body).length) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Provide only editable student fields" } });
    }
    const updated = await withTransaction(async (client) => {
      const locked = await lockStudentAndBatch(client, req.params.studentId, req.user);
      if (!locked) return null;
      const { student, batch } = locked;
      const name = req.body.name === undefined ? student.full_name : typeof req.body.name === "string" ? req.body.name.trim() : "";
      const email = req.body.email === undefined ? student.email : typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
      let mobile = student.mobile_number;
      if (req.body.mobileNumber !== undefined) {
        if (!student.user_id && !String(req.body.mobileNumber).trim()) mobile = null;
        else if (!student.user_id) {
          const error = new Error("Register a login account before adding a mobile number");
          error.statusCode = 409; throw error;
        } else mobile = normalizeMobile(req.body.mobileNumber);
      }
      const section = req.body.section === undefined ? student.section : req.body.section;
      const cgpa = req.body.cgpa === undefined ? student.cgpa : req.body.cgpa;
      if (!name || name.length > 100) { const error = new Error("Full name is required (maximum 100 characters)"); error.statusCode = 400; throw error; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) { const error = new Error("Enter a valid email address"); error.statusCode = 400; throw error; }
      if (req.body.section !== undefined && batch?.status !== "active") { const error = new Error("Restore this batch before changing section assignments"); error.statusCode = 409; error.code = "BATCH_ARCHIVED"; throw error; }
      if (typeof section !== "string" || !batch || !(batch.sections || []).includes(section)) { const error = new Error("Choose a section from the student's batch"); error.statusCode = 400; throw error; }
      // if (typeof cgpa !== "number" || !Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) { const error = new Error("CGPA must be between 0 and 10"); error.statusCode = 400; throw error; }
      const result = await client.query(
        `UPDATE students SET full_name=$1,email=$2,section=$3,cgpa=$4 WHERE student_id=$5 RETURNING *`,
        [name, email, section, cgpa, student.student_id],
      );
      if (student.user_id) await client.query(
        `UPDATE users SET full_name=$1,email=$2,mobile_number=$3 WHERE user_id=$4`,
        [name, email, mobile, student.user_id],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Students',$3,'success')`,
        [req.user.id, req.user.name, section !== student.section
          ? `Transferred student ${student.student_id} from section ${student.section || "unassigned"} to ${section}`
          : `Updated student ${student.student_id}`],
      );
      return buildStudentResponseObject(client, { ...result.rows[0], mobile_number: mobile });
    });
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" } });
    res.json(updated);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: { code: "DUPLICATE", message: "Email is already registered" } });
    next(error);
  }
});

router.delete("/students/:studentId/section", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const updated = await withTransaction(async (client) => {
      const locked = await lockStudentAndBatch(client, req.params.studentId, req.user);
      if (!locked) return null;
      const { student } = locked;
      if (locked.batch?.status !== "active") { const error = new Error("Restore this batch before changing section assignments"); error.statusCode = 409; error.code = "BATCH_ARCHIVED"; throw error; }
      const result = await client.query("UPDATE students SET section=NULL WHERE student_id=$1 RETURNING *", [student.student_id]);
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Students',$3,'success')`,
        [req.user.id, req.user.name, `Unassigned student ${student.student_id} from section ${student.section || "unassigned"}`],
      );
      return buildStudentResponseObject(client, { ...result.rows[0], mobile_number: student.mobile_number });
    });
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" } });
    res.json(updated);
  } catch (error) { next(error); }
});

router.get("/students/:studentId/assessments", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const p = Math.max(1, parseInt(req.query.page || "1", 10));
    const ps = Math.max(1, parseInt(req.query.pageSize || "10", 10));
    const params = [req.params.studentId, ps, (p - 1) * ps];
    const access = req.user.role === "trainer"
      ? (params.push(String(req.user.id)), ` AND ${trainerStudentScope("s", params.length)}`)
      : "";
    const { rows } = await pool.query(
      `SELECT er.record_id, ib.batch_id, ib.event_title, ib.event_type, ib.event_date,
       er.marks_obtained, er.max_marks, er.overall_score_pct, COUNT(*) OVER() AS total_count
       FROM evaluation_records er
       JOIN students s ON s.student_id=er.student_id
       JOIN import_batches ib
         ON ib.batch_id = er.batch_id
       WHERE er.student_id = $1 
         ${access}
         AND ib.import_status = 'CONFIRMED'
       ORDER BY ib.event_date DESC, er.evaluated_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    res.json({
      items: rows.map((r) => ({
        assessmentId: String(r.batch_id),
        name: r.event_title,
        type: r.event_type === "MOCK_INTERVIEW" ? "mock-interview" : "exam",
        date: new Date(r.event_date).toISOString().slice(0, 10),
        marks: Number(r.marks_obtained),
        maxMarks: Number(r.max_marks),
        percentage: Number(r.overall_score_pct),
      })),
      page: p,
      pageSize: ps,
      total: rows.length ? Number(rows[0].total_count) : 0,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/students/:studentId/feedback", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const approvedFilter = req.query.approved;
    const params = [req.params.studentId];
    let filterSql = "";
    if (approvedFilter !== undefined) {
      params.push(approvedFilter === "true");
      filterSql = `AND er.is_feedback_approved = $${params.length}`;
    }
    let accessSql = "";
    if (req.user.role === "trainer") {
      params.push(String(req.user.id));
      accessSql = `AND ${trainerStudentScope("s", params.length)}`;
    }

    const { rows } = await pool.query(
      `SELECT er.*, ib.event_title, ib.event_date, COALESCE(u.full_name, 'Trainer') AS trainer_name
       FROM evaluation_records er
       JOIN students s ON s.student_id=er.student_id
       JOIN import_batches ib ON ib.batch_id = er.batch_id
       LEFT JOIN users u ON
         u.user_id = COALESCE(er.trainer_id, ib.uploaded_by)
       WHERE er.student_id = $1
         ${accessSql}
         AND (er.strengths IS NOT NULL OR er.technical_remarks IS NOT NULL OR er.behavior_remarks IS NOT NULL)
         ${filterSql}
       ORDER BY ib.event_date DESC`,
      params
    );

    res.json(
      rows.map((r) => ({
        id: String(r.record_id),
        studentId: String(r.student_id),
        date: new Date(r.event_date).toISOString().slice(0, 10),
        trainer: r.trainer_name,
        assessmentName: r.event_title,
        technical: r.technical_remarks || "",
        communication: r.communication_remarks || "",
        behavior: r.behavior_remarks || "",
        strengths: r.strengths ? String(r.strengths).split(";").map((s) => s.trim()) : [],
        weaknesses: r.weaknesses ? String(r.weaknesses).split(";").map((s) => s.trim()) : [],
        improvements: Array.isArray(r.improvements) ? r.improvements : [],
        approved: Boolean(r.is_feedback_approved),
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get("/me/student", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, u.mobile_number FROM students s LEFT JOIN users u ON u.user_id=s.user_id WHERE s.user_id = $1 OR s.email = $2`,
      [req.user.id, req.user.email]
    );
    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    res.json(await buildStudentResponseObject(pool, rows[0]));
  } catch (err) {
    next(err);
  }
});

router.get("/me/assessments", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    let studentId = req.user.studentId;
    if (!studentId) {
      const stuRes = await pool.query(
        `SELECT student_id FROM students WHERE user_id = $1 OR email = $2`,
        [req.user.id, req.user.email]
      );
      if (stuRes.rows.length) studentId = String(stuRes.rows[0].student_id);
    }
    if (!studentId) {
      return res.json({ items: [], page: 1, pageSize: 0, total: 0 });
    }

    const { rows } = await pool.query(
      `SELECT ib.batch_id, ib.event_title, ib.event_type, ib.event_date,
       er.marks_obtained, er.max_marks, er.overall_score_pct
       FROM evaluation_records er
       JOIN import_batches ib 
         ON ib.batch_id = er.batch_id
       WHERE er.student_id = $1 
         AND ib.import_status = 'CONFIRMED'
       ORDER BY ib.event_date DESC`,
      [studentId]
    );

    res.json({
      items: rows.map((r) => ({
        assessmentId: String(r.batch_id),
        name: r.event_title,
        type: r.event_type === "MOCK_INTERVIEW" ? "mock-interview" : "exam",
        date: new Date(r.event_date).toISOString().slice(0, 10),
        marks: Number(r.marks_obtained),
        maxMarks: Number(r.max_marks),
        percentage: Number(r.overall_score_pct),
      })),
      page: 1,
      pageSize: rows.length,
      total: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me/feedback", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    let studentId = req.user.studentId;
    if (!studentId) {
      const stuRes = await pool.query(
        `SELECT student_id FROM students WHERE user_id = $1 OR email = $2`,
        [req.user.id, req.user.email]
      );
      if (stuRes.rows.length) studentId = String(stuRes.rows[0].student_id);
    }
    if (!studentId) {
      return res.json([]);
    }

    const { rows } = await pool.query(
      `SELECT er.*, ib.event_title, ib.event_date, COALESCE(u.full_name, 'Trainer') AS trainer_name
       FROM evaluation_records er
       JOIN import_batches ib 
         ON ib.batch_id = er.batch_id
       LEFT JOIN users u 
         ON u.user_id = COALESCE(er.trainer_id, ib.uploaded_by)
       WHERE er.student_id = $1 
         AND er.is_feedback_approved = TRUE
       ORDER BY ib.event_date DESC`,
      [studentId]
    );

    res.json(
      rows.map((r) => ({
        id: String(r.record_id),
        studentId: String(r.student_id),
        date: new Date(r.event_date).toISOString().slice(0, 10),
        trainer: r.trainer_name,
        assessmentName: r.event_title,
        technical: r.technical_remarks || "",
        communication: r.communication_remarks || "",
        behavior: r.behavior_remarks || "",
        strengths: r.strengths ? String(r.strengths).split(";").map((s) => s.trim()) : [],
        weaknesses: r.weaknesses ? String(r.weaknesses).split(";").map((s) => s.trim()) : [],
        improvements: Array.isArray(r.improvements) ? r.improvements : [],
        approved: true,
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
