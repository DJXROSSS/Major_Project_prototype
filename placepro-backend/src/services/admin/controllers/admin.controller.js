const { Router } = require("express");
const bcrypt = require("bcryptjs");
const { pool, withTransaction, writeAuditLog } = require("../../../config/db");
const { recomputeAndSyncStudentReadiness } = require("../../../utils/student-metrics");
const { requireAuth, requireRole } = require("../../../middleware/auth.middleware");

const router = Router();

router.get("/users", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { q = "", role, status, page = "1", pageSize = "10" } = req.query;
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

    const p = Math.max(1, parseInt(page, 10));
    const ps = Math.max(1, parseInt(pageSize, 10));

    const { rows } = await pool.query(
      `SELECT *, COUNT(*) OVER() AS total_count FROM users
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, ps, (p - 1) * ps]
    );

    res.json({
      items: rows.map((u) => ({
        id: String(u.user_id),
        name: u.full_name,
        email: u.email,
        role: String(u.role).toLowerCase(),
        status: u.status,
        lastActive: u.last_active ? new Date(u.last_active).toISOString() : null,
      })),
      page: p,
      pageSize: ps,
      total: rows.length ? Number(rows[0].total_count) : 0,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/users", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { name, email, role = "trainer", status = "active" } = req.body;
    const defaultHash = await bcrypt.hash("secret", 10);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4::user_role, $5::account_status) RETURNING *`,
      [name, email, defaultHash, String(role).toUpperCase(), status]
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
    const { rows } = await pool.query(
      `SELECT ab.*, COUNT(s.student_id)::int AS student_count
       FROM academic_batches ab
       LEFT JOIN students s ON s.academic_batch_id = ab.academic_batch_id OR s.batch = ab.name
       GROUP BY ab.academic_batch_id
       ORDER BY ab.created_at DESC`
    );

    res.json(
      rows.map((b) => ({
        id: String(b.academic_batch_id),
        name: b.name,
        department: b.department,
        academicYears: b.academic_years,
        sections: b.sections || ["A", "B"],
        trainerIds: b.trainer_ids || [],
        status: b.status,
        studentCount: b.student_count,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/batches", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { name, department, academicYears, sections = ["A", "B"], trainerIds = [], status = "active" } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO academic_batches (name, department, academic_years, sections, trainer_ids, status)
       VALUES ($1, $2, $3, $4, $5, $6::batch_status) RETURNING *`,
      [name, department, academicYears, JSON.stringify(sections), JSON.stringify(trainerIds), status]
    );
    const b = rows[0];

    res.status(201).json({
      id: String(b.academic_batch_id),
      name: b.name,
      department: b.department,
      academicYears: b.academic_years,
      sections: b.sections,
      trainerIds: b.trainer_ids,
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
    const { rows } = await pool.query(
      `UPDATE academic_batches
       SET name = COALESCE($1, name),
           department = COALESCE($2, department),
           academic_years = COALESCE($3, academic_years),
           sections = COALESCE($4, sections),
           trainer_ids = COALESCE($5, trainer_ids),
           status = COALESCE($6::batch_status, status)
       WHERE academic_batch_id = $7 RETURNING *`,
      [
        name,
        department,
        academicYears,
        sections ? JSON.stringify(sections) : null,
        trainerIds ? JSON.stringify(trainerIds) : null,
        status,
        req.params.batchId,
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });
    }

    const b = rows[0];
    res.json({
      id: String(b.academic_batch_id),
      name: b.name,
      department: b.department,
      academicYears: b.academic_years,
      sections: b.sections,
      trainerIds: b.trainer_ids,
      status: b.status,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/batches/:batchId/stats", requireAuth, requireRole(["admin", "trainer"]), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM students WHERE CAST(academic_batch_id AS TEXT) = $1 OR batch = $1`,
      [req.params.batchId]
    );

    const prCount = rows.filter((r) => r.readiness_status === "PR").length;
    const avgCgpa = rows.length
      ? Number((rows.reduce((a, r) => a + Number(r.cgpa), 0) / rows.length).toFixed(2))
      : 0;

    res.json({
      batchId: req.params.batchId,
      studentCount: rows.length,
      prCount,
      nprCount: rows.length - prCount,
      averageCgpa: avgCgpa,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/skills", requireAuth, requireRole(["admin", "trainer", "student"]), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM skill_taxonomy WHERE deleted_at IS NULL ORDER BY skill_id ASC`
    );

    res.json(
      rows.map((s) => ({
        id: s.skill_code || String(s.skill_id),
        numericId: String(s.skill_id),
        name: s.skill_name,
        domain: s.domain_category,
        description: s.description || "",
        parameterType: s.parameter_type || "numeric",
        active: Boolean(s.is_active),
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/skills", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const {
      name,
      domain = "Programming & Problem Solving",
      description = "",
      parameterType = "numeric",
      active = true,
    } = req.body;
    const code = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_");

    const { rows } = await pool.query(
      `INSERT INTO skill_taxonomy (skill_code, skill_name, domain_category, description, parameter_type, is_active)
       VALUES ($1, $2, $3::skill_domain, $4, $5::param_type, $6) RETURNING *`,
      [code, name, domain, description, parameterType, active]
    );

    const s = rows[0];
    res.status(201).json({
      id: s.skill_code,
      name: s.skill_name,
      domain: s.domain_category,
      description: s.description,
      parameterType: s.parameter_type,
      active: s.is_active,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/skills/:skillId", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { name, description, active } = req.body;
    const { rows } = await pool.query(
      `UPDATE skill_taxonomy
       SET skill_name = COALESCE($1, skill_name),
           description = COALESCE($2, description),
           is_active = COALESCE($3, is_active)
       WHERE skill_code = $4 OR CAST(skill_id AS TEXT) = $4 RETURNING *`,
      [name, description, active, req.params.skillId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Skill not found" } });
    }

    const s = rows[0];
    res.json({
      id: s.skill_code,
      name: s.skill_name,
      domain: s.domain_category,
      description: s.description,
      parameterType: s.parameter_type,
      active: s.is_active,
    });
  } catch (err) {
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
      if (review.status !== "PENDING") {
        const error = new Error("This verification request has already been reviewed");
        error.statusCode = 409;
        throw error;
      }

      const duplicate = await client.query(
        `SELECT student_id FROM students WHERE roll_no = $1 FOR UPDATE`,
        [review.roll_no]
      );

      const batchRes = review.academic_batch_id
        ? await client.query(`SELECT name FROM academic_batches WHERE academic_batch_id = $1`, [review.academic_batch_id])
        : { rows: [] };
      const batchName = batchRes.rows[0]?.name || "Unassigned";

      const studentRes = duplicate.rows.length
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

      const studentId = duplicate.rows.length ? duplicate.rows[0].student_id : studentRes.rows[0].student_id;
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
        if (!Number.isFinite(score) || score < 0 || score > maxMarks) {
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
