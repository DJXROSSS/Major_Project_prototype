const { Router } = require("express");
const { pool } = require("../../../config/db");
const { buildStudentResponseObject } = require("../../../utils/student-metrics");
const { requireAuth, requireRole } = require("../../../middleware/auth.middleware");

const router = Router();

router.get("/students", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const {
      q = "",
      batchId,
      section,
      prStatus,
      domain,
      page = "1",
      pageSize = "10",
      sort = "average_desc",
    } = req.query;

    const conditions = ["1=1"];
    const params = [];

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

    if (domain) {
      params.push(domain);
      conditions.push(`
        EXISTS (
          SELECT 1 
          FROM skill_ratings sr
          JOIN skill_taxonomy st 
            ON st.skill_id = sr.skill_id
          WHERE sr.student_id = s.student_id 
            AND CAST(st.domain_category AS TEXT) = $${params.length}
          GROUP BY sr.student_id
          HAVING AVG(sr.score_percentage) < 60
        )
      `);
    }

    const orderMap = {
      average_desc: "s.average_score DESC",
      average_asc: "s.average_score ASC",
      cgpa_desc: "s.cgpa DESC",
      name_asc: "s.full_name ASC",
    };
    const orderBy = orderMap[sort] || "s.average_score DESC";
    const p = Math.max(1, parseInt(page, 10));
    const ps = Math.max(1, parseInt(pageSize, 10));
    const offset = (p - 1) * ps;

    const countRes = await pool.query(
      `SELECT COUNT(*) 
       FROM students s 
       WHERE ${conditions.join(" AND ")}`,
      params
    );

    const total = parseInt(countRes.rows[0].count, 10);
    const rowsRes = await pool.query(
      `SELECT s.* FROM students s
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${orderBy}
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
    const { rows } = await pool.query(
      `SELECT * 
       FROM students WHERE student_id = $1`,
      [req.params.studentId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" } });
    }
    res.json(await buildStudentResponseObject(pool, rows[0]));
  } catch (err) {
    next(err);
  }
});

router.get("/students/:studentId/assessments", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const p = Math.max(1, parseInt(req.query.page || "1", 10));
    const ps = Math.max(1, parseInt(req.query.pageSize || "10", 10));
    const { rows } = await pool.query(
      `SELECT er.record_id, ib.batch_id, ib.event_title, ib.event_type, ib.event_date,
       er.marks_obtained, er.max_marks, er.overall_score_pct, COUNT(*) OVER() AS total_count
       FROM evaluation_records er
       JOIN import_batches ib
         ON ib.batch_id = er.batch_id
       WHERE er.student_id = $1 
         AND ib.import_status = 'CONFIRMED'
       ORDER BY ib.event_date DESC, er.evaluated_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.studentId, ps, (p - 1) * ps]
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
      filterSql = `AND er.is_feedback_approved = $2`;
    }

    const { rows } = await pool.query(
      `SELECT er.*, ib.event_title, ib.event_date, COALESCE(u.full_name, 'Trainer') AS trainer_name
       FROM evaluation_records er
       JOIN import_batches ib ON ib.batch_id = er.batch_id
       LEFT JOIN users u ON
         u.user_id = COALESCE(er.trainer_id, ib.uploaded_by)
       WHERE er.student_id = $1
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
      `SELECT * FROM students WHERE user_id = $1 OR email = $2`,
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
