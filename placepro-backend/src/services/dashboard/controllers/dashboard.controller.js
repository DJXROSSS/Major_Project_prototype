const { Router } = require("express");
const { pool } = require("../../../config/db");
const { buildStudentResponseObject } = require("../../../utils/student-metrics");
const { requireAuth } = require("../../../middleware/auth.middleware");

const router = Router();

router.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    const role = req.user.role;
    if (role === "admin") {
      const userCounts = await pool.query(`
        SELECT LOWER(role::text) AS role, 
        status, 
        COUNT(*)::int AS count 
        FROM users GROUP BY role, status`
      );

      const batchReadiness = await pool.query(`
        SELECT batch,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE readiness_status = 'PR')::int AS pr_count,
        COUNT(*) FILTER (WHERE readiness_status = 'NPR')::int AS npr_count
        FROM students GROUP BY batch`
      );

      const recentAudit = await pool.query(`
        SELECT log_id AS id, 
        actor_name AS actor, 
        module, action, status, 
        created_at AS timestamp
        FROM audit_logs 
        ORDER BY created_at DESC LIMIT 10`
      );

      const studentCounts = await pool.query(`
        SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE readiness_status = 'PR')::int AS pr_count,
        COUNT(*) FILTER (WHERE readiness_status = 'NPR')::int AS npr_count
        FROM students`
      );

      return res.json({
        role: "admin",
        totalStudents: studentCounts.rows[0]?.total ?? 0,
        prCount: studentCounts.rows[0]?.pr_count ?? 0,
        nprCount: studentCounts.rows[0]?.npr_count ?? 0,
        userCounts: userCounts.rows,
        batchReadiness: batchReadiness.rows,
        recentAuditLogs: recentAudit.rows,
      });
    }

    if (role === "student") {
      const { rows } = await pool.query(
        `SELECT * 
         FROM students 
         WHERE user_id = $1 
         OR email = $2`,
        [req.user.id, req.user.email]
      );
      if (!rows.length) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not found" } });
      }
      const studentObj = await buildStudentResponseObject(pool, rows[0]);
      return res.json({
        role: "student",
        student: studentObj,
      });
    }

    // Trainer dashboard
    const batchId = req.query.batchId;
    const params = [];

    let whereClause = "";
    if (batchId) {
      params.push(batchId);
      whereClause = `WHERE CAST(academic_batch_id AS TEXT) = $1 OR batch = $1`;
    }

    const studentsRes = await pool.query(
      `SELECT * 
       FROM students ${whereClause} 
       ORDER BY average_score DESC`,
      params
    );

    const students = await Promise.all(
      studentsRes.rows.map((r) => buildStudentResponseObject(pool, r))
    );
    const prCount = students.filter((s) => s.prStatus === "PR").length;
    const nprCount = students.length - prCount;

    return res.json({
      role: "trainer",
      totalStudents: students.length,
      prCount,
      nprCount,
      topPerformers: students.slice(0, 5),
      attentionList: students.filter((s) => s.average < 60).slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
