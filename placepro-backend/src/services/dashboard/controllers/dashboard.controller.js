"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../../../config/db");
const student_metrics_1 = require("../../../utils/student-metrics");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.get("/dashboard", auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const role = req.user.role;
        if (role === "admin") {
            const userCounts = await db_1.pool.query(`SELECT LOWER(role::text) AS role, status, COUNT(*)::int AS count FROM users GROUP BY role, status`);
            const batchReadiness = await db_1.pool.query(`SELECT batch,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE readiness_status = 'PR')::int AS pr_count,
                COUNT(*) FILTER (WHERE readiness_status = 'NPR')::int AS npr_count
         FROM students GROUP BY batch`);
            const recentAudit = await db_1.pool.query(`SELECT log_id AS id, actor_name AS actor, module, action, status, created_at AS timestamp
         FROM audit_logs ORDER BY created_at DESC LIMIT 10`);
            return res.json({
                role: "admin",
                userCounts: userCounts.rows,
                batchReadiness: batchReadiness.rows,
                recentAuditLogs: recentAudit.rows,
            });
        }
        if (role === "student") {
            const { rows } = await db_1.pool.query(`SELECT * FROM students WHERE user_id = $1`, [req.user.id]);
            if (!rows.length) {
                return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not found" } });
            }
            const studentObj = await (0, student_metrics_1.buildStudentResponseObject)(db_1.pool, rows[0]);
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
        const studentsRes = await db_1.pool.query(`SELECT * FROM students ${whereClause} ORDER BY average_score DESC`, params);
        const students = await Promise.all(studentsRes.rows.map((r) => (0, student_metrics_1.buildStudentResponseObject)(db_1.pool, r)));
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
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
