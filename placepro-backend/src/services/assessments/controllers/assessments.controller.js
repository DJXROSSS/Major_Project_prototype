"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const XLSX = __importStar(require("xlsx"));
const db_1 = require("../../../config/db");
const student_metrics_1 = require("../../../utils/student-metrics");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.get("/assessments", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const { q, type, batchId, month, page = "1", pageSize = "10" } = req.query;
        const conditions = ["ib.import_status = 'CONFIRMED'"];
        const params = [];
        if (q) {
            params.push(`%${q}%`);
            conditions.push(`ib.event_title ILIKE $${params.length}`);
        }
        if (type) {
            params.push(type === "mock-interview" ? "MOCK_INTERVIEW" : "EXAM");
            conditions.push(`ib.event_type = $${params.length}::event_type`);
        }
        if (batchId) {
            params.push(batchId);
            conditions.push(`CAST(ib.academic_batch_id AS TEXT) = $${params.length}`);
        }
        if (month) {
            params.push(`${month}%`);
            conditions.push(`TO_CHAR(ib.event_date, 'YYYY-MM') LIKE $${params.length}`);
        }
        const p = Math.max(1, parseInt(page, 10));
        const ps = Math.max(1, parseInt(pageSize, 10));
        const { rows } = await db_1.pool.query(`SELECT ib.*, COALESCE(u.full_name, 'Trainer') AS uploader_name, COUNT(*) OVER() AS total_count
       FROM import_batches ib
       LEFT JOIN users u ON u.user_id = ib.uploaded_by
       WHERE ${conditions.join(" AND ")}
       ORDER BY ib.event_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, ps, (p - 1) * ps]);
        res.json({
            items: rows.map((r) => ({
                id: String(r.batch_id),
                name: r.event_title,
                type: r.event_type === "MOCK_INTERVIEW" ? "mock-interview" : "exam",
                batchId: r.academic_batch_id ? String(r.academic_batch_id) : "default",
                date: new Date(r.event_date).toISOString().slice(0, 10),
                uploadedBy: { id: String(r.uploaded_by || ""), name: r.uploader_name },
                reviewed: Boolean(r.reviewed),
                sourceId: String(r.batch_id),
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
router.get("/assessments/:assessmentId", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const batchRes = await db_1.pool.query(`SELECT ib.*, COALESCE(u.full_name, 'Trainer') AS uploader_name
       FROM import_batches ib
       LEFT JOIN users u ON u.user_id = ib.uploaded_by
       WHERE ib.batch_id = $1`, [req.params.assessmentId]);
        if (!batchRes.rows.length) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assessment not found" } });
        }
        const r = batchRes.rows[0];
        const resultsRes = await db_1.pool.query(`SELECT student_id, marks_obtained, max_marks, overall_score_pct
       FROM evaluation_records WHERE batch_id = $1`, [r.batch_id]);
        res.json({
            id: String(r.batch_id),
            name: r.event_title,
            type: r.event_type === "MOCK_INTERVIEW" ? "mock-interview" : "exam",
            batchId: r.academic_batch_id ? String(r.academic_batch_id) : "default",
            date: new Date(r.event_date).toISOString().slice(0, 10),
            uploadedBy: { id: String(r.uploaded_by || ""), name: r.uploader_name },
            reviewed: Boolean(r.reviewed),
            sourceId: String(r.batch_id),
            results: resultsRes.rows.map((er) => ({
                studentId: String(er.student_id),
                marks: Number(er.marks_obtained),
                maxMarks: Number(er.max_marks),
                percentage: Number(er.overall_score_pct),
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
router.patch("/assessments/:assessmentId", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const { reviewed } = req.body;
        await db_1.pool.query(`UPDATE import_batches SET reviewed = $1 WHERE batch_id = $2`, [
            Boolean(reviewed),
            req.params.assessmentId,
        ]);
        await (0, db_1.writeAuditLog)(req.user.id, req.user.name, "Assessments", `Marked assessment ${req.params.assessmentId} reviewed=${reviewed}`);
        res.json({ id: req.params.assessmentId, reviewed: Boolean(reviewed) });
    }
    catch (err) {
        next(err);
    }
});
router.post("/assessment-imports/preview", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), upload.single("file"), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: { code: "VALIDATION_ERROR", message: "Spreadsheet file is required" },
            });
        }
        const { name, type, batchId, date } = req.body;
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (matrix.length < 2) {
            return res.status(422).json({
                error: { code: "EMPTY_SHEET", message: "Spreadsheet must contain headers and at least one row" },
            });
        }
        const headers = matrix[0].map((h) => String(h).trim());
        const dataRows = matrix.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== ""));
        const dbEventType = type === "mock-interview" ? "MOCK_INTERVIEW" : "EXAM";
        const { rows } = await db_1.pool.query(`INSERT INTO import_batches
          (uploaded_by, academic_batch_id, event_type, event_title, event_date, original_filename,
           headers, raw_preview_rows, column_mapping_config, total_rows_processed, import_status)
         VALUES ($1, $2, $3::event_type, $4, $5, $6, $7, $8, '{}'::jsonb, $9, 'PREVIEW')
         RETURNING batch_id`, [
            req.user.id,
            batchId && !isNaN(Number(batchId)) ? Number(batchId) : null,
            dbEventType,
            name || req.file.originalname,
            date || new Date().toISOString().slice(0, 10),
            req.file.originalname,
            JSON.stringify(headers),
            JSON.stringify(dataRows),
            dataRows.length,
        ]);
        res.status(201).json({
            importId: String(rows[0].batch_id),
            fileName: req.file.originalname,
            rowCount: dataRows.length,
            columnCount: headers.length,
            headers,
            sampleRows: dataRows.slice(0, 5),
            issues: [],
        });
    }
    catch (err) {
        next(err);
    }
});
router.post("/assessment-imports/:importId/confirm", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)(["admin", "trainer"]), async (req, res, next) => {
    try {
        const { rollNumberColumn, skillColumns } = req.body;
        const batchRes = await db_1.pool.query(`SELECT * FROM import_batches WHERE batch_id = $1`, [
            req.params.importId,
        ]);
        if (!batchRes.rows.length) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Import session not found" } });
        }
        const imp = batchRes.rows[0];
        const headers = imp.headers;
        const dataRows = imp.raw_preview_rows;
        const skillRes = await db_1.pool.query(`SELECT skill_id, skill_code, parameter_type, is_active
         FROM skill_taxonomy WHERE deleted_at IS NULL`);
        const skillLookup = new Map();
        for (const s of skillRes.rows) {
            skillLookup.set(String(s.skill_id), s);
            skillLookup.set(String(s.skill_code), s);
        }
        const issues = [];
        for (const sc of skillColumns) {
            const meta = skillLookup.get(String(sc.skillId));
            if (!meta || !meta.is_active || meta.parameter_type !== "numeric") {
                issues.push({ row: 0, field: sc.skillId, message: `Skill '${sc.skillId}' is invalid or inactive` });
            }
            if (sc.columnIndex < 0 || sc.columnIndex >= headers.length) {
                issues.push({ row: 0, field: String(sc.columnIndex), message: `Column index ${sc.columnIndex} out of bounds` });
            }
        }
        const studentRes = await db_1.pool.query(`SELECT student_id, roll_no FROM students`);
        const rollMap = new Map();
        for (const s of studentRes.rows) {
            rollMap.set(String(s.roll_no).toUpperCase(), Number(s.student_id));
        }
        const seenRolls = new Set();
        const validatedRows = [];
        const pendingReviews = [];
        dataRows.forEach((row, idx) => {
            const rowNum = idx + 2;
            const roll = String(row[rollNumberColumn] || "").trim().toUpperCase();
            const rawObj = {};
            headers.forEach((h, i) => (rawObj[h] = row[i]));
            if (!roll) {
                issues.push({ row: rowNum, field: "rollNumber", message: "Missing roll number" });
                return;
            }
            if (seenRolls.has(roll)) {
                issues.push({ row: rowNum, field: "rollNumber", message: `Duplicate roll number ${roll}` });
                return;
            }
            seenRolls.add(roll);
            const studentId = rollMap.get(roll);
            if (!studentId) {
                pendingReviews.push({ rowNum, roll, rawObj });
                return;
            }
            let totalMarks = 0;
            let totalMax = 0;
            const perSkill = [];
            for (const sc of skillColumns) {
                const rawVal = Number(row[sc.columnIndex]);
                const meta = skillLookup.get(String(sc.skillId));
                if (isNaN(rawVal) || rawVal < 0 || rawVal > sc.maxMarks) {
                    issues.push({
                        row: rowNum,
                        field: headers[sc.columnIndex] || String(sc.columnIndex),
                        message: `Score '${row[sc.columnIndex]}' must be between 0 and ${sc.maxMarks}`,
                    });
                    continue;
                }
                totalMarks += rawVal;
                totalMax += sc.maxMarks;
                perSkill.push({
                    skillId: Number(meta.skill_id),
                    marks: rawVal,
                    maxMarks: sc.maxMarks,
                    pct: Number(((rawVal / sc.maxMarks) * 100).toFixed(2)),
                });
            }
            validatedRows.push({
                studentId,
                rawObj,
                totalMarks,
                totalMax,
                overallPct: totalMax > 0 ? Number(((totalMarks / totalMax) * 100).toFixed(2)) : 0,
                perSkill,
            });
        });
        if (issues.length > 0) {
            await db_1.pool.query(`UPDATE import_batches SET validation_issues = $1 WHERE batch_id = $2`, [
                JSON.stringify(issues),
                imp.batch_id,
            ]);
            return res.status(422).json({
                error: {
                    code: "IMPORT_VALIDATION_FAILED",
                    message: "Spreadsheet contains validation errors",
                    details: issues,
                },
            });
        }
        await (0, db_1.withTransaction)(async (client) => {
            await client.query(`UPDATE import_batches
           SET column_mapping_config = $1, import_status = 'CONFIRMED', total_rows_processed = $2
           WHERE batch_id = $3`, [JSON.stringify({ rollNumberColumn, skillColumns }), validatedRows.length, imp.batch_id]);
            for (const review of pendingReviews) {
                await client.query(`INSERT INTO import_student_reviews
              (import_batch_id, row_number, roll_no, raw_row, requested_by, status)
             VALUES ($1, $2, $3, $4, $5, 'PENDING')
             ON CONFLICT (import_batch_id, roll_no)
             DO UPDATE SET row_number = EXCLUDED.row_number, raw_row = EXCLUDED.raw_row
             WHERE import_student_reviews.status = 'PENDING'`, [
                    imp.batch_id,
                    review.rowNum,
                    review.roll,
                    JSON.stringify(review.rawObj),
                    req.user.id,
                ]);
            }
            for (const vr of validatedRows) {
                const evalInsert = await client.query(`INSERT INTO evaluation_records
              (batch_id, student_id, trainer_id, marks_obtained, max_marks, overall_score_pct, raw_excel_row)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING record_id`, [
                    imp.batch_id,
                    vr.studentId,
                    req.user.id,
                    vr.totalMarks,
                    vr.totalMax,
                    vr.overallPct,
                    JSON.stringify(vr.rawObj),
                ]);
                const recordId = evalInsert.rows[0].record_id;
                for (const sk of vr.perSkill) {
                    await client.query(`INSERT INTO skill_ratings
                (student_id, skill_id, marks_obtained, max_marks, score_percentage, source_type, source_id)
               VALUES ($1, $2, $3, $4, $5, $6::event_type, $7)`, [
                        vr.studentId,
                        sk.skillId,
                        sk.marks,
                        sk.maxMarks,
                        sk.pct,
                        imp.event_type,
                        recordId,
                    ]);
                }
                await (0, student_metrics_1.recomputeAndSyncStudentReadiness)(client, vr.studentId);
            }
        });
        await (0, db_1.writeAuditLog)(req.user.id, req.user.name, "Assessments", `Confirmed import ${imp.event_title} (${validatedRows.length} rows)`, "success");
        res.status(201).json({
            id: String(imp.batch_id),
            name: imp.event_title,
            type: imp.event_type === "MOCK_INTERVIEW" ? "mock-interview" : "exam",
            batchId: imp.academic_batch_id ? String(imp.academic_batch_id) : "default",
            date: new Date(imp.event_date).toISOString().slice(0, 10),
            uploadedBy: { id: String(req.user.id), name: req.user.name },
            reviewed: false,
            sourceId: String(imp.batch_id),
            results: validatedRows.map((vr) => ({
                studentId: String(vr.studentId),
                marks: vr.totalMarks,
                maxMarks: vr.totalMax,
                percentage: vr.overallPct,
            })),
            pendingReviews: pendingReviews.map((review) => ({
                row: review.rowNum,
                rollNumber: review.roll,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
