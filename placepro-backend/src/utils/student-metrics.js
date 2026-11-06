const PR_THRESHOLDS = {
  minAverage: 68,
  minCgpa: 6.6,
  minComm: 58,
  commSkillCode: "comm",
};

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
  const prStatus =
    average >= PR_THRESHOLDS.minAverage &&
    cgpa >= PR_THRESHOLDS.minCgpa &&
    commScore >= PR_THRESHOLDS.minComm
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
  const ratingsRes = await db.query(
    `SELECT st.skill_id, st.skill_code, st.domain_category,
            ROUND(AVG(sr.score_percentage), 1) AS avg_score
     FROM skill_ratings sr
     JOIN skill_taxonomy st ON st.skill_id = sr.skill_id
     WHERE sr.student_id = $1 AND st.deleted_at IS NULL
     GROUP BY st.skill_id, st.skill_code, st.domain_category`,
    [studentId]
  );

  const scores = {};
  const domainBuckets = {};
  for (const r of ratingsRes.rows) {
    const val = Number(r.avg_score);
    scores[r.skill_code] = val;
    scores[String(r.skill_id)] = val;
    domainBuckets[r.domain_category] = [...(domainBuckets[r.domain_category] || []), val];
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
    batchId: studentRow.academic_batch_id ? String(studentRow.academic_batch_id) : studentRow.batch,
    batch: studentRow.batch,
    section: studentRow.section || "A",
    cgpa: Number(studentRow.cgpa),
    scores,
    domainAverages,
    average: Number(studentRow.average_score),
    prStatus: studentRow.readiness_status,
    trend: trendRes.rows.map((r) => Number(r.overall_score_pct)),
  };
}

module.exports = {
  PR_THRESHOLDS,
  recomputeAndSyncStudentReadiness,
  buildStudentResponseObject,
};
