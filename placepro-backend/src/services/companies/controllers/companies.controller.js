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
router.get("/companies", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const { q = "", page = "1", pageSize = "10" } = req.query;
        const p = Math.max(1, parseInt(page, 10));
        const ps = Math.max(1, parseInt(pageSize, 10));
        const { rows } = await db_1.pool.query(`SELECT *, COUNT(*) OVER() AS total_count
       FROM company_roles
       WHERE company_name ILIKE $1 OR role_title ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`, [`%${q}%`, ps, (p - 1) * ps]);
        res.json({
            items: rows.map((c) => ({
                id: String(c.role_id),
                name: c.company_name,
                role: c.role_title,
                industry: c.industry,
                minCgpa: Number(c.min_cgpa),
                criteria: c.criteria_json || [],
            })),
            page: p,
            pageSize: ps,
            total: rows.length ? Number(rows[0].total_count) : 0,
        });
    }
    catch (err) {
        next(err);
    }
});
router.post("/companies", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const { name, role, industry = "IT Services", minCgpa = 6.0, criteria = [] } = req.body;
        const { rows } = await db_1.pool.query(`INSERT INTO company_roles (company_name, role_title, industry, min_cgpa, criteria_json)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [name, role, industry, minCgpa, JSON.stringify(criteria)]);
        const c = rows[0];
        await (0, db_1.writeAuditLog)(req.user.id, req.user.name, "Companies", `Created company ${name} (${role})`);
        res.status(201).json({
            id: String(c.role_id),
            name: c.company_name,
            role: c.role_title,
            industry: c.industry,
            minCgpa: Number(c.min_cgpa),
            criteria: c.criteria_json,
        });
    }
    catch (err) {
        next(err);
    }
});
router.get("/companies/:companyId", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const { rows } = await db_1.pool.query(`SELECT * FROM company_roles WHERE role_id = $1`, [req.params.companyId]);
        if (!rows.length) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
        }
        const c = rows[0];
        res.json({
            id: String(c.role_id),
            name: c.company_name,
            role: c.role_title,
            industry: c.industry,
            minCgpa: Number(c.min_cgpa),
            criteria: c.criteria_json,
        });
    }
    catch (err) {
        next(err);
    }
});
router.patch("/companies/:companyId", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const { name, role, industry, minCgpa, criteria } = req.body;
        const { rows } = await db_1.pool.query(`UPDATE company_roles
       SET company_name = COALESCE($1, company_name),
           role_title = COALESCE($2, role_title),
           industry = COALESCE($3, industry),
           min_cgpa = COALESCE($4, min_cgpa),
           criteria_json = COALESCE($5, criteria_json)
       WHERE role_id = $6 RETURNING *`, [name, role, industry, minCgpa, criteria ? JSON.stringify(criteria) : null, req.params.companyId]);
        if (!rows.length) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
        }
        const c = rows[0];
        res.json({
            id: String(c.role_id),
            name: c.company_name,
            role: c.role_title,
            industry: c.industry,
            minCgpa: Number(c.min_cgpa),
            criteria: c.criteria_json,
        });
    }
    catch (err) {
        next(err);
    }
});
router.delete("/companies/:companyId", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        await db_1.pool.query(`DELETE FROM company_roles WHERE role_id = $1`, [req.params.companyId]);
        await (0, db_1.writeAuditLog)(req.user.id, req.user.name, "Companies", `Deleted company ${req.params.companyId}`);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
router.post("/companies/:companyId/matches", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const { criteriaOverride, filters = {}, page = 1, pageSize = 10 } = req.body;
        const compRes = await db_1.pool.query(`SELECT * FROM company_roles WHERE role_id = $1`, [
            req.params.companyId,
        ]);
        if (!compRes.rows.length) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
        }
        const comp = compRes.rows[0];
        const minCgpa = criteriaOverride?.minCgpa ?? Number(comp.min_cgpa);
        const criteria = criteriaOverride?.criteria ?? comp.criteria_json ?? [];
        const studentsRes = await db_1.pool.query(`SELECT * FROM students`);
        const allStudents = await Promise.all(studentsRes.rows.map((r) => (0, student_metrics_1.buildStudentResponseObject)(db_1.pool, r)));
        const totalWeight = criteria.reduce((acc, c) => acc + Number(c.weightage || 0), 0) || 1;
        let evaluated = allStudents.map((stu) => {
            const failedRequirements = [];
            if (stu.cgpa < minCgpa) {
                failedRequirements.push(`CGPA ${stu.cgpa} is below minimum ${minCgpa}`);
            }
            let weightedSum = 0;
            for (const c of criteria) {
                const score = stu.scores[c.skillId] ?? 0;
                weightedSum += score * Number(c.weightage);
                if (c.mandatory && score < c.minCutoff) {
                    failedRequirements.push(`${c.skillId.toUpperCase()} score ${score}% < ${c.minCutoff}%`);
                }
            }
            return {
                student: stu,
                eligible: failedRequirements.length === 0,
                compatibility: Number((weightedSum / totalWeight).toFixed(1)),
                failedRequirements,
            };
        });
        if (filters.prStatus) {
            evaluated = evaluated.filter((e) => e.student.prStatus === filters.prStatus);
        }
        if (filters.eligibility === "eligible") {
            evaluated = evaluated.filter((e) => e.eligible);
        }
        else if (filters.eligibility === "ineligible") {
            evaluated = evaluated.filter((e) => !e.eligible);
        }
        if (filters.q) {
            const qLower = String(filters.q).toLowerCase();
            evaluated = evaluated.filter((e) => e.student.name.toLowerCase().includes(qLower) ||
                e.student.rollNumber.toLowerCase().includes(qLower));
        }
        evaluated.sort((a, b) => b.compatibility - a.compatibility);
        const start = (page - 1) * pageSize;
        res.json({
            items: evaluated.slice(start, start + pageSize),
            page,
            pageSize,
            total: evaluated.length,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
