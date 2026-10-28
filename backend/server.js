require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const pool = require('./db/pool');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// In-memory upload storage for Excel/CSV files (up to 20MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

async function queryRows(client, sql, params = []) {
  let parameterIndex = 0;
  const postgresSql = sql.replace(/\?/g, () => `$${++parameterIndex}`);
  const result = await client.query(postgresSql, params);
  return result.rows;
}

// PostgreSQL's JSONB driver values are already parsed objects.
function parseJsonCol(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
}

// ============================================================================
// 1. TAXONOMY & ADMIN ENDPOINTS (Add Dynamic Skills & Company Roles)
// ============================================================================

app.get('/api/taxonomy', async (req, res) => {
  try {
    const rows = await queryRows(pool,
      'SELECT * FROM skill_taxonomy WHERE is_active = TRUE ORDER BY domain_category, skill_name'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/taxonomy', async (req, res) => {
  try {
    const { skillName, domainCategory = 'Software Development' } = req.body;
    await queryRows(pool,
      'INSERT INTO skill_taxonomy (skill_name, domain_category) VALUES (?, ?)',
      [skillName, domainCategory]
    );
    res.json({ status: 'SUCCESS', message: `Added new skill parameter: ${skillName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/companies', async (req, res) => {
  try {
    const rows = await queryRows(pool, 'SELECT * FROM company_roles ORDER BY company_name');
    const formatted = rows.map(r => ({
      ...r,
      skill_weights: typeof r.skill_weights === 'object' ? JSON.stringify(r.skill_weights) : r.skill_weights,
      skill_cutoffs: typeof r.skill_cutoffs === 'object' ? JSON.stringify(r.skill_cutoffs) : r.skill_cutoffs
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/company-role', async (req, res) => {
  try {
    const {
      companyName,
      roleTitle,
      packageLpa = 6.0,
      minCgpa = 6.5,
      skillWeights = {},
      skillCutoffs = {}
    } = req.body;

    await queryRows(pool,
      `INSERT INTO company_roles 
       (company_name, role_title, package_lpa, min_cgpa, skill_weights, skill_cutoffs) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        companyName,
        roleTitle,
        Number(packageLpa),
        Number(minCgpa),
        JSON.stringify(skillWeights),
        JSON.stringify(skillCutoffs)
      ]
    );
    res.json({ status: 'SUCCESS', message: `Created role for ${companyName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 2. UNSTRUCTURED EXCEL PREVIEW & DYNAMIC COLUMN MAPPING UPLOAD
// ============================================================================

app.post('/api/import/preview-headers', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel/CSV file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to array of objects with default empty string for blank cells
    const rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
    const headers = rows.length > 0 ? Object.keys(rows[0]).map(h => h.trim()) : [];
    const sampleRows = rows.slice(0, 3);

    res.json({
      fileName: req.file.originalname,
      totalRows: rows.length,
      headers,
      sampleRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/upload-mapped', upload.single('file'), async (req, res) => {
  const conn = await pool.connect();
  try {
    if (!req.file || !req.body.mappingConfig) {
      return res.status(400).json({ error: 'Missing file or mappingConfig payload' });
    }

    const config = JSON.parse(req.body.mappingConfig);
    const {
      eventType = 'EXAM',
      eventTitle = 'Uploaded Assessment',
      rollNoColumn,
      nameColumn = '',
      strengthsColumn = '',
      weaknessesColumn = '',
      behaviorColumn = '',
      skillMappings = {} // { "Excel_Header": { skillId: 1, maxMarks: 100 } }
    } = config;

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

    await conn.query('BEGIN');

    // 1. Insert import_batches audit record
    const [batchResult] = await queryRows(conn,
      `INSERT INTO import_batches 
       (uploaded_by, event_type, event_title, original_filename, column_mapping_config) 
       VALUES (2, ?, ?, ?, ?) RETURNING batch_id`,
      [eventType, eventTitle, req.file.originalname, JSON.stringify(config)]
    );
    const batchId = batchResult.batch_id;

    const explicitlyMappedCols = new Set([
      rollNoColumn,
      nameColumn,
      strengthsColumn,
      weaknessesColumn,
      behaviorColumn,
      ...Object.keys(skillMappings)
    ].filter(Boolean));

    let processedRows = 0;

    // 2. Process each student row in the Excel sheet
    for (const rawRow of rows) {
      const rollNo = String(rawRow[rollNoColumn] || '').trim();
      if (!rollNo) continue;

      const fallbackName = nameColumn ? String(rawRow[nameColumn] || '').trim() : `Student ${rollNo}`;
      const studentId = await findOrCreateStudent(conn, rollNo, fallbackName);

      // Bundle any unmapped/arbitrary columns into custom_attributes JSON
      const customAttrs = {};
      for (const [colKey, cellVal] of Object.entries(rawRow)) {
        if (!explicitlyMappedCols.has(colKey) && String(cellVal).trim() !== '') {
          customAttrs[colKey] = String(cellVal).trim();
        }
      }

      // Normalize mapped skill scores to 0-100%
      const skillScoresToInsert = [];
      let sumPct = 0;

      for (const [colName, mapInfo] of Object.entries(skillMappings)) {
        const rawCell = String(rawRow[colName] ?? '').trim();
        if (!rawCell) continue;

        const numericVal = parseFloat(rawCell.replace(/[^0-9.]/g, ''));
        if (!isNaN(numericVal)) {
          const skillId = Number(mapInfo.skillId);
          const maxMarks = Number(mapInfo.maxMarks || 100);
          const pct = Math.min(100.0, Math.max(0.0, (numericVal / maxMarks) * 100.0));
          skillScoresToInsert.push({ skillId, pct: Math.round(pct * 100) / 100 });
          sumPct += pct;
        }
      }

      const overallPct = skillScoresToInsert.length > 0
        ? Math.round((sumPct / skillScoresToInsert.length) * 100) / 100
        : 0.0;

      const strengths = strengthsColumn ? String(rawRow[strengthsColumn] || '') : null;
      const weaknesses = weaknessesColumn ? String(rawRow[weaknessesColumn] || '') : null;
      const behavior = behaviorColumn ? String(rawRow[behaviorColumn] || '') : null;

      // Insert into evaluation_records (preserving raw_excel_row & custom_attributes)
      const [evalResult] = await queryRows(conn,
        `INSERT INTO evaluation_records 
         (batch_id, student_id, overall_score_pct, strengths, weaknesses, behavior_remarks, raw_excel_row, custom_attributes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING record_id`,
        [
          batchId,
          studentId,
          overallPct,
          strengths,
          weaknesses,
          behavior,
          JSON.stringify(rawRow),
          JSON.stringify(customAttrs)
        ]
      );
      const recordId = evalResult.record_id;

      // Insert normalized scores into skill_ratings
      for (const sc of skillScoresToInsert) {
        await queryRows(conn,
          `INSERT INTO skill_ratings 
           (student_id, skill_id, score_percentage, source_type, source_id) 
           VALUES (?, ?, ?, ?, ?)`,
          [studentId, sc.skillId, sc.pct, eventType, recordId]
        );
      }

      // Recalculate student's dynamic persona badges & PR/NPR status
      await recalculateStudentPersonaAndReadiness(conn, studentId);
      processedRows++;
    }

    await queryRows(conn,
      'UPDATE import_batches SET total_rows_processed = ? WHERE batch_id = ?',
      [processedRows, batchId]
    );

    await conn.query('COMMIT');

    res.json({
      status: 'SUCCESS',
      batchId,
      processedRows,
      message: `Successfully imported ${processedRows} student records and preserved original Excel logs.`
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

async function findOrCreateStudent(conn, rollNo, fallbackName) {
  const existing = await queryRows(conn,
    'SELECT student_id FROM students WHERE roll_no = ?',
    [rollNo]
  );
  if (existing.length > 0) {
    return existing[0].student_id;
  }

  const safeName = fallbackName || `Student ${rollNo}`;
  const email = `${rollNo.toLowerCase()}@college.edu`;
  const [ins] = await queryRows(conn,
    `INSERT INTO students (roll_no, full_name, email, cgpa, persona_badges) 
     VALUES (?, ?, ?, 7.50, '["New Entrant"]'::jsonb) RETURNING student_id`,
    [rollNo, safeName, email]
  );
  return ins.student_id;
}

async function recalculateStudentPersonaAndReadiness(conn, studentId) {
  const domainAvgs = await queryRows(conn,
    `SELECT t.domain_category, AVG(r.score_percentage) AS avg_score
     FROM skill_ratings r
     JOIN skill_taxonomy t ON r.skill_id = t.skill_id
     WHERE r.student_id = ?
     GROUP BY t.domain_category`,
    [studentId]
  );

  const badges = [];
  let totalSum = 0;
  let count = 0;

  for (const row of domainAvgs) {
    const domain = String(row.domain_category);
    const avg = Number(row.avg_score);
    totalSum += avg;
    count++;
    if (domain.includes('Programming') && avg >= 75) badges.push('DSA Strong');
    if (domain.includes('Core Computer') && avg >= 75) badges.push('Core CS Strong');
    if (domain.includes('Software Development') && avg >= 75) badges.push('Development Strong');
    if (domain.includes('Employability') && avg >= 75) badges.push('Communication Strong');
  }

  const overallAvg = count === 0 ? 0 : totalSum / count;
  if (badges.length >= 3) badges.unshift('All-Rounder');
  if (overallAvg < 65 || badges.length === 0) badges.push('Needs Targeted Training');

  const readiness = overallAvg >= 70.0 ? 'PR' : 'NPR';
  await queryRows(conn,
    'UPDATE students SET readiness_status = ?, persona_badges = ? WHERE student_id = ?',
    [readiness, JSON.stringify(badges), studentId]
  );
}

// ============================================================================
// 3. TRAINER DASHBOARD & IMPORT LOG ENDPOINTS
// ============================================================================

app.get('/api/dashboard/trainer', async (req, res) => {
  try {
    const students = await queryRows(pool,
      `SELECT s.*, ROUND(AVG(r.score_percentage), 1) AS overall_avg
       FROM students s
       LEFT JOIN skill_ratings r ON s.student_id = r.student_id
       GROUP BY s.student_id
       ORDER BY overall_avg DESC`
    );

    const formattedStudents = students.map(s => ({
      ...s,
      persona_badges: typeof s.persona_badges === 'object' ? JSON.stringify(s.persona_badges) : s.persona_badges,
      custom_profile_fields: typeof s.custom_profile_fields === 'object' ? JSON.stringify(s.custom_profile_fields) : s.custom_profile_fields
    }));

    const prCount = formattedStudents.filter(s => s.readiness_status === 'PR').length;
    const nprCount = formattedStudents.length - prCount;

    const batches = await queryRows(pool, 'SELECT * FROM import_batches ORDER BY uploaded_at DESC');

    res.json({
      totalStudents: formattedStudents.length,
      placementReadyCount: prCount,
      notPlacementReadyCount: nprCount,
      students: formattedStudents,
      importBatches: batches
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/import/batches/:batchId/records', async (req, res) => {
  try {
    const rows = await queryRows(pool,
      `SELECT e.*, s.roll_no, s.full_name
       FROM evaluation_records e
       JOIN students s ON e.student_id = s.student_id
       WHERE e.batch_id = ?`,
      [req.params.batchId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 4. STUDENT 360 PROFILE ENDPOINT (Trainer Drilldown & Student Portal)
// ============================================================================

app.get('/api/students/:studentId/360', async (req, res) => {
  try {
    const studentId = req.params.studentId;
    const studentRows = await queryRows(pool, 'SELECT * FROM students WHERE student_id = ?', [studentId]);
    if (studentRows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const student = {
      ...studentRows[0],
      persona_badges: typeof studentRows[0].persona_badges === 'object'
        ? JSON.stringify(studentRows[0].persona_badges)
        : studentRows[0].persona_badges,
      custom_profile_fields: typeof studentRows[0].custom_profile_fields === 'object'
        ? JSON.stringify(studentRows[0].custom_profile_fields)
        : studentRows[0].custom_profile_fields
    };

    const skillBreakdown = await queryRows(pool,
      `SELECT t.skill_id, t.skill_name, t.domain_category, ROUND(AVG(r.score_percentage), 1) AS avg_pct
       FROM skill_ratings r
       JOIN skill_taxonomy t ON r.skill_id = t.skill_id
       WHERE r.student_id = ?
       GROUP BY t.skill_id, t.skill_name, t.domain_category
       ORDER BY avg_pct DESC`,
      [studentId]
    );

    const domainBreakdown = await queryRows(pool,
      `SELECT t.domain_category, ROUND(AVG(r.score_percentage), 1) AS domain_pct
       FROM skill_ratings r
       JOIN skill_taxonomy t ON r.skill_id = t.skill_id
       WHERE r.student_id = ?
       GROUP BY t.domain_category`,
      [studentId]
    );

    const evalRows = await queryRows(pool,
      `SELECT e.*, b.event_title, b.event_type, b.original_filename
       FROM evaluation_records e
       JOIN import_batches b ON e.batch_id = b.batch_id
       WHERE e.student_id = ?
       ORDER BY e.evaluated_at DESC`,
      [studentId]
    );

    const evaluations = evalRows.map(ev => ({
      ...ev,
      raw_excel_row: typeof ev.raw_excel_row === 'object' ? JSON.stringify(ev.raw_excel_row) : ev.raw_excel_row,
      custom_attributes: typeof ev.custom_attributes === 'object' ? JSON.stringify(ev.custom_attributes) : ev.custom_attributes
    }));

    const strongAreas = [];
    const weakAreas = [];
    for (const sk of skillBreakdown) {
      const pct = Number(sk.avg_pct);
      if (pct >= 75.0) strongAreas.push(`${sk.skill_name} (${pct}%)`);
      else if (pct < 65.0) weakAreas.push(`${sk.skill_name} (${pct}% - Needs practice)`);
    }

    res.json({
      student,
      skillBreakdown,
      domainBreakdown,
      strongAreas,
      weakAreas,
      evaluations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 5. COMPANY ELIGIBILITY & MULTI-SKILL FILTERING (Infosys / Cognizant / Custom)
// ============================================================================

app.get('/api/companies/:roleId/match', async (req, res) => {
  try {
    const roleRows = await queryRows(pool, 'SELECT * FROM company_roles WHERE role_id = ?', [req.params.roleId]);
    if (roleRows.length === 0) {
      return res.status(404).json({ error: 'Company role not found' });
    }

    const roleRow = roleRows[0];
    const minCgpa = Number(roleRow.min_cgpa);
    const weights = parseJsonCol(roleRow.skill_weights, {});
    const cutoffs = parseJsonCol(roleRow.skill_cutoffs, {});

    const allStudents = await queryRows(pool, 'SELECT * FROM students');
    const candidates = [];

    for (const s of allStudents) {
      const skills = await queryRows(pool,
        `SELECT t.skill_name, AVG(r.score_percentage) AS pct
         FROM skill_ratings r
         JOIN skill_taxonomy t ON r.skill_id = t.skill_id
         WHERE r.student_id = ?
         GROUP BY t.skill_name`,
        [s.student_id]
      );

      const studentSkillMap = {};
      for (const sk of skills) {
        studentSkillMap[sk.skill_name] = Number(sk.pct);
      }

      let weightedScore = 0.0;
      let eligible = Number(s.cgpa) >= minCgpa;
      const shortfallNotes = [];

      if (!eligible) {
        shortfallNotes.push(`CGPA: ${s.cgpa} < ${minCgpa}`);
      }

      for (const [skillName, weight] of Object.entries(weights)) {
        const score = studentSkillMap[skillName] || 0.0;
        weightedScore += score * Number(weight);
      }

      for (const [skillName, minCutoff] of Object.entries(cutoffs)) {
        const score = studentSkillMap[skillName] || 0.0;
        if (score < Number(minCutoff)) {
          eligible = false;
          shortfallNotes.push(`${skillName}: ${Math.round(score)}% < ${Math.round(Number(minCutoff))}%`);
        }
      }

      candidates.push({
        ...s,
        skillScores: studentSkillMap,
        matchPercentage: Math.round(weightedScore * 10) / 10,
        eligible,
        shortfallNotes
      });
    }

    candidates.sort((a, b) => b.matchPercentage - a.matchPercentage);

    res.json({
      role: {
        ...roleRow,
        skill_weights: typeof roleRow.skill_weights === 'object' ? JSON.stringify(roleRow.skill_weights) : roleRow.skill_weights,
        skill_cutoffs: typeof roleRow.skill_cutoffs === 'object' ? JSON.stringify(roleRow.skill_cutoffs) : roleRow.skill_cutoffs
      },
      candidates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Node.js Placement Intelligence Backend running on http://localhost:${PORT}`);
});
