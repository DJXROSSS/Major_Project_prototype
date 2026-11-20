const companySelect = `FROM company_roles c
LEFT JOIN LATERAL (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ab.academic_batch_id::text, 'name', ab.name)
    ORDER BY ab.name, ab.academic_batch_id), '[]'::jsonb) AS eligible_batches
  FROM company_eligible_batches ceb JOIN academic_batches ab ON ab.academic_batch_id = ceb.batch_id
  WHERE ceb.company_id = c.role_id
) batches ON TRUE`;

function companyResponse(c) {
  const batches = c.eligible_batches || [];
  return { id: String(c.role_id), name: c.company_name, role: c.role_title, industry: c.industry,
    minCgpa: Number(c.min_cgpa), criteria: c.criteria_json || [],
    eligibleBatchIds: batches.map(b => b.id), eligibleBatches: batches };
}

function invalid(message) {
  const error = new Error(message); error.statusCode = 400; throw error;
}

async function validateBatchIds(db, ids) {
  if (!Array.isArray(ids) || !ids.length) invalid("Select at least one eligible batch");
  if (ids.some(id => !["string", "number"].includes(typeof id) || !/^[1-9]\d*$/.test(String(id)) || BigInt(id) > 9223372036854775807n)) invalid("Invalid eligible batch ID");
  const unique = [...new Set(ids.map(String))];
  const { rows } = await db.query(`SELECT academic_batch_id FROM academic_batches WHERE academic_batch_id = ANY($1::bigint[]) AND status='active' FOR KEY SHARE`, [unique]);
  if (rows.length !== unique.length) invalid("One or more eligible batches are missing or archived");
  return unique;
}

async function validateCriteria(db, cgpa, criteria) {
  if (typeof cgpa !== "number" || !Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) invalid("Minimum CGPA must be between 0 and 10");
  if (!Array.isArray(criteria)) invalid("Criteria must be an array");
  const keys = new Set();
  const skills = [];
  for (const c of criteria) {
    if (!c || typeof c.skillId !== "string" || !c.skillId || (c.type !== undefined && c.type !== "PROJECT_SCORE")) invalid("Invalid criterion");
    if (typeof c.minCutoff !== "number" || !Number.isFinite(c.minCutoff) || c.minCutoff < 0 || c.minCutoff > 100) invalid("Cutoffs must be between 0 and 100");
    if (typeof c.weightage !== "number" || !Number.isFinite(c.weightage) || c.weightage < 0 || c.weightage > 1) invalid("Weightages must be between 0 and 1");
    if (typeof c.mandatory !== "boolean") invalid("Mandatory must be a boolean");
    const key = c.type === "PROJECT_SCORE" ? "PROJECT_SCORE" : c.skillId;
    if (keys.has(key)) invalid("Duplicate eligibility criteria are not allowed");
    keys.add(key);
    if (key !== "PROJECT_SCORE") skills.push(key);
  }
  if (skills.length) {
    const { rows } = await db.query(`SELECT skill_id::text, skill_code FROM skill_taxonomy
      WHERE deleted_at IS NULL AND parameter_type = 'numeric' AND (skill_id::text = ANY($1::text[]) OR skill_code = ANY($1::text[]))`, [skills]);
    const resolved = skills.map(key => rows.find(r => r.skill_id === key || r.skill_code === key)?.skill_id);
    if (resolved.some(id => !id)) invalid("One or more criteria reference an unavailable numeric skill");
    if (new Set(resolved).size !== resolved.length) invalid("Duplicate eligibility criteria are not allowed");
  }
}

// Filter by database batch IDs before loading scores. Three bulk queries, independent of student count.
async function matchingStudents(db, batchIds) {
  const { rows } = await db.query(`SELECT s.*, u.mobile_number, ab.name AS batch_name FROM students s
    LEFT JOIN users u ON u.user_id=s.user_id
    JOIN academic_batches ab ON ab.academic_batch_id = s.academic_batch_id
    WHERE s.academic_batch_id = ANY($1::bigint[]) ORDER BY s.student_id`, [batchIds]);
  if (!rows.length) return [];
  const ids = rows.map(s => s.student_id);
  const ratings = await db.query(`SELECT sr.student_id, st.skill_id::text, st.skill_code,
    ROUND(AVG(sr.score_percentage), 1) AS score FROM skill_ratings sr
    JOIN skill_taxonomy st ON st.skill_id = sr.skill_id
    WHERE sr.student_id = ANY($1::bigint[]) AND st.deleted_at IS NULL
    GROUP BY sr.student_id, st.skill_id, st.skill_code`, [ids]);
  const projects = await db.query(`SELECT p.student_id, ROUND(AVG(score.final_score), 2) AS project_score,
    COUNT(*)::int AS approved_count,
    ARRAY_AGG(DISTINCT p.repository_url ORDER BY p.repository_url) FILTER (WHERE p.repository_url IS NOT NULL) AS repository_urls
    FROM projects p
    JOIN LATERAL (SELECT final_score FROM project_score_snapshots WHERE project_id=p.project_id AND final_score IS NOT NULL
      ORDER BY computed_at DESC, project_score_snapshot_id DESC LIMIT 1) score ON TRUE
    JOIN LATERAL (SELECT review_status FROM project_reviews WHERE project_id=p.project_id
      ORDER BY created_at DESC, project_review_id DESC LIMIT 1) review ON TRUE
    WHERE p.student_id = ANY($1::bigint[]) AND p.ownership_status='VERIFIED' AND review.review_status='APPROVED'
    GROUP BY p.student_id`, [ids]);
  const scores = new Map();
  for (const r of ratings.rows) {
    const bucket = scores.get(String(r.student_id)) || {};
    bucket[r.skill_id] = bucket[r.skill_code] = Number(r.score);
    scores.set(String(r.student_id), bucket);
  }
  const projectScores = new Map(projects.rows.map(r => [String(r.student_id), r]));
  return rows.map(s => {
    const project = projectScores.get(String(s.student_id));
    return { id: String(s.student_id), name: s.full_name, rollNumber: s.roll_no, email: s.email,
      batchId: String(s.academic_batch_id), batch: s.batch_name, section: s.section ?? "",
      mobileNumber: s.mobile_number ?? s.custom_profile_fields?.mobileNumber ?? s.custom_profile_fields?.mobile_number ?? "",
      cgpa: Number(s.cgpa), scores: scores.get(String(s.student_id)) || {},
      average: Number(s.average_score), prStatus: s.readiness_status, trend: [],
      projectScore: project ? Number(project.project_score) : null, approvedProjectCount: project?.approved_count || 0,
      projectGithubLinks: (project?.repository_urls || []).filter(value => {
        try {
          const url = new URL(value);
          return ['https:', 'http:'].includes(url.protocol) && url.hostname === 'github.com' &&
            !url.username && !url.password && url.pathname.split('/').filter(Boolean).length >= 2;
        } catch { return false; }
      }) };
  });
}

module.exports = { companySelect, companyResponse, validateBatchIds, validateCriteria, matchingStudents };
