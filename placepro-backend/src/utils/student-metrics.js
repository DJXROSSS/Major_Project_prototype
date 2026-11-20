async function findStudentId(db, user) {
  const { rows } = await db.query(
    `SELECT student_id
     FROM students
     WHERE user_id = $1 OR (user_id IS NULL AND email = $2)
     ORDER BY (user_id = $1) DESC
     LIMIT 1`,
    [user.id, user.email]
  );
  return rows.length ? String(rows[0].student_id) : null;
}

const PR_THRESHOLDS = {
  minAverage: 68,
  minCgpa: 6.6,
  minComm: 58,
  minProjectScore: 60,
  commSkillCode: "comm",
};

async function getStudentProjectScore(db, studentId) {
  const { rows } = await db.query(
    `SELECT ROUND(AVG(latest.final_score), 2) AS project_score,
            COUNT(*)::int AS approved_project_count
     FROM projects p
     JOIN LATERAL (
       SELECT final_score
       FROM project_score_snapshots
       WHERE project_id = p.project_id AND final_score IS NOT NULL
       ORDER BY computed_at DESC, project_score_snapshot_id DESC
       LIMIT 1
     ) latest ON TRUE
     JOIN LATERAL (
       SELECT review_status
       FROM project_reviews
       WHERE project_id = p.project_id
       ORDER BY created_at DESC, project_review_id DESC
       LIMIT 1
     ) review ON TRUE
     WHERE p.student_id = $1
       AND p.ownership_status = 'VERIFIED'
       AND review.review_status = 'APPROVED'`,
    [studentId]
  );
  return {
    projectScore: rows[0]?.project_score === null || rows[0]?.project_score === undefined
      ? null
      : Number(rows[0].project_score),
    approvedProjectCount: Number(rows[0]?.approved_project_count || 0),
  };
}

async function recomputeAndSyncStudentReadiness(db, studentId) {
  const studentRes = await db.query(
    `SELECT student_id, cgpa FROM students WHERE student_id = $1`,
    [studentId]
  );
  if (studentRes.rowCount === 0) return;

  const cgpa = Number(studentRes.rows[0].cgpa);
  const skillAvgRes = await db.query(
    `SELECT st.skill_code, ROUND(AVG(sr.score_percentage), 1) AS avg_score
     FROM skill_ratings sr
     JOIN skill_taxonomy st ON st.skill_id = sr.skill_id
     WHERE sr.student_id = $1 AND st.deleted_at IS NULL
     GROUP BY st.skill_code`,
    [studentId]
  );

  const scores = {};
  for (const row of skillAvgRes.rows) {
    scores[row.skill_code] = Number(row.avg_score);
  }

  const skillValues = Object.values(scores);
  const average = skillValues.length
    ? Number((skillValues.reduce((a, b) => a + b, 0) / skillValues.length).toFixed(1))
    : 0;
  const commScore = scores[PR_THRESHOLDS.commSkillCode] ?? 0;
  const { projectScore } = await getStudentProjectScore(db, studentId);
  const prStatus =
    average >= PR_THRESHOLDS.minAverage &&
    cgpa >= PR_THRESHOLDS.minCgpa &&
    commScore >= PR_THRESHOLDS.minComm &&
    projectScore !== null &&
    projectScore >= PR_THRESHOLDS.minProjectScore
      ? "PR"
      : "NPR";

  await db.query(
    `UPDATE students
     SET average_score = $1, readiness_status = $2
     WHERE student_id = $3`,
    [average, prStatus, studentId]
  );
}

async function buildStudentResponseObject(db, studentRow) {
  const studentId = studentRow.student_id;
  const projectScoreData = await getStudentProjectScore(db, studentId);
  const ratingsRes = await db.query(
    `SELECT st.skill_id, st.skill_code, d.name AS domain_name,
            ROUND(AVG(sr.score_percentage), 1) AS avg_score
     FROM skill_ratings sr
     JOIN skill_taxonomy st ON st.skill_id = sr.skill_id
     JOIN evaluation_domains d ON d.domain_id = st.domain_id
     WHERE sr.student_id = $1 AND st.deleted_at IS NULL
     GROUP BY st.skill_id, st.skill_code, d.domain_id, d.name`,
    [studentId]
  );

  const scores = {};
  const domainBuckets = {};
  for (const r of ratingsRes.rows) {
    const val = Number(r.avg_score);
    scores[r.skill_code] = val;
    scores[String(r.skill_id)] = val;
    domainBuckets[r.domain_name] = [...(domainBuckets[r.domain_name] || []), val];
  }

  const domainAverages = {};
  for (const [dom, vals] of Object.entries(domainBuckets)) {
    domainAverages[dom] = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
  }

  const trendRes = await db.query(
    `SELECT er.overall_score_pct
     FROM evaluation_records er
     JOIN import_batches ib ON ib.batch_id = er.batch_id
     WHERE er.student_id = $1 AND ib.import_status = 'CONFIRMED'
     ORDER BY ib.event_date ASC, er.evaluated_at ASC`,
    [studentId]
  );

  return {
    id: String(studentRow.student_id),
    rollNumber: studentRow.roll_no,
    name: studentRow.full_name,
    email: studentRow.email,
    mobileNumber: studentRow.mobile_number ?? "",
    batchId: studentRow.academic_batch_id ? String(studentRow.academic_batch_id) : studentRow.batch,
    batch: studentRow.batch,
    section: studentRow.section ?? "",
    cgpa: Number(studentRow.cgpa),
    scores,
    domainAverages,
    average: Number(studentRow.average_score),
    prStatus: studentRow.readiness_status,
    projectScore: projectScoreData.projectScore,
    approvedProjectCount: projectScoreData.approvedProjectCount,
    trend: trendRes.rows.map((r) => Number(r.overall_score_pct)),
  };
}

module.exports = {
  findStudentId,
  PR_THRESHOLDS,
  getStudentProjectScore,
  recomputeAndSyncStudentReadiness,
  buildStudentResponseObject,
};
