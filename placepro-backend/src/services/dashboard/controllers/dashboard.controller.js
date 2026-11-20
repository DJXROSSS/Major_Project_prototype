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
        SELECT ab.name AS batch,
        COUNT(s.student_id)::int AS total,
        COUNT(s.student_id) FILTER (WHERE s.readiness_status = 'PR')::int AS pr_count,
        COUNT(s.student_id) FILTER (WHERE s.readiness_status = 'NPR')::int AS npr_count
        FROM academic_batches ab
        LEFT JOIN students s ON s.academic_batch_id = ab.academic_batch_id OR s.batch = ab.name
        WHERE ab.status='active'
        GROUP BY ab.academic_batch_id, ab.name
        ORDER BY ab.name`
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
    const params = [String(req.user.id)];
    const conditions = ["ab.status='active'", `EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(ab.trainer_ids)='array' THEN ab.trainer_ids ELSE '[]'::jsonb END) trainer_id WHERE trainer_id=$1)`];
    if (batchId) {
      params.push(batchId);
      conditions.push(`(CAST(ab.academic_batch_id AS TEXT) = $2 OR ab.name = $2)`);
    }

    const studentsRes = await pool.query(
      `SELECT s.* FROM students s
       JOIN academic_batches ab ON ab.academic_batch_id=s.academic_batch_id OR ab.name=s.batch
       WHERE ${conditions.join(" AND ")}
       ORDER BY s.average_score DESC`,
      params
    );

    const students = await Promise.all(
      studentsRes.rows.map((r) => buildStudentResponseObject(pool, r))
    );
    const prCount = students.filter((s) => s.prStatus === "PR").length;
    const nprCount = students.length - prCount;
    const domainNames = new Set(students.flatMap((student) => Object.keys(student.domainAverages ?? {})));
    const domainAverages = Object.fromEntries([...domainNames].map((domain) => {
      const total = students.reduce((sum, student) => sum + Number(student.domainAverages?.[domain] ?? 0), 0);
      return [domain, students.length ? Number((total / students.length).toFixed(1)) : 0];
    }));

    return res.json({
      role: "trainer",
      totalStudents: students.length,
      prCount,
      nprCount,
      averageScore: students.length ? Number((students.reduce((sum, student) => sum + student.average, 0) / students.length).toFixed(1)) : 0,
      domainAverages,
      topPerformers: students.slice(0, 5),
      attentionList: students.filter((s) => s.average < 60).slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
