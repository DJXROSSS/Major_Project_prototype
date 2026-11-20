const { Router } = require("express");
const { pool } = require("../../../config/db");
const { requireAuth, requireRole, requireStudentBatchAccess } = require("../../../middleware/auth.middleware");
const { fetchGithubStatistics } = require("../providers/github-statistics");
const { ProfileProviderError } = require("../providers/profile-provider-error");
const router = Router();
const pending = new Map();
const failures = new Map();

function isLegacyTokenCalendar(cached) {
  return ["GITHUB_TOKEN_MISSING", "GITHUB_TOKEN_SCOPE", "GITHUB_TOKEN_INVALID"].includes(cached?.calendarErrorCode) ||
    /calendar is not configured|needs? a .*github token/i.test(cached?.calendarUnavailable || "");
}

router.get("/students/:studentId/github-statistics", requireAuth, requireRole(["admin", "trainer"]), requireStudentBatchAccess, async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const id = req.params.studentId;
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return res.status(400).json({ error: { code: "INVALID_STUDENT_ID", message: "Invalid student id" } });
    const { rows } = await pool.query(`SELECT s.student_id, p.student_profile_id, p.username, p.verification_status,
        cached.normalized_metrics, cached.fetched_at
      FROM students s
      LEFT JOIN LATERAL (SELECT * FROM student_profiles WHERE student_id = s.student_id AND platform = 'GITHUB'
        ORDER BY (verification_status = 'VERIFIED') DESC, updated_at DESC, student_profile_id DESC LIMIT 1) p ON TRUE
      LEFT JOIN LATERAL (SELECT normalized_metrics, fetched_at FROM profile_snapshots
        WHERE student_profile_id = p.student_profile_id AND normalized_metrics ? 'githubPreview'
        AND lower(normalized_metrics->>'username') = lower(p.username)
        AND fetched_at >= p.updated_at
        ORDER BY fetched_at DESC, snapshot_id DESC LIMIT 1) cached ON TRUE
      WHERE s.student_id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" } });
    const linked = rows[0];
    if (!linked.student_profile_id) return res.json({ profile: null });
    const cached = linked.normalized_metrics?.githubPreview;
    const age = Date.now() - new Date(linked.fetched_at).getTime();
    const ttl = cached?.calendar ? 15 * 60000 : 5 * 60000;
    const legacyTokenCalendar = isLegacyTokenCalendar(cached);
    const wrap = (profile, fetchedAt, stale = false) => ({ profile, fetchedAt, stale, verificationStatus: linked.verification_status });
    if (cached && age < ttl && !legacyTokenCalendar) return res.json(wrap(cached, linked.fetched_at));
    const key = `${linked.student_profile_id}:${linked.username}`;
    const recentFailure = failures.get(key);
    if (recentFailure && recentFailure.until > Date.now()) {
      if (cached) return res.json(wrap(cached, linked.fetched_at, true));
      return res.status(recentFailure.status).json({ error: recentFailure.error });
    }
    if (!pending.has(key)) {
      if (pending.size >= 100) return res.status(503).json({ error: { code: "BUSY", message: "GitHub statistics are busy. Please retry shortly." } });
      const fetchAndSave = async () => {
        const snapshot = await fetchGithubStatistics(linked.username);
        // Do not attach an in-flight result to a profile that has changed or been removed.
        const saved = await pool.query(`INSERT INTO profile_snapshots (student_profile_id, fetch_status, raw_metrics, normalized_metrics, provider_api_version)
          SELECT student_profile_id, $3, $4::jsonb, $5::jsonb, $6 FROM student_profiles
          WHERE student_profile_id = $1 AND username = $2 RETURNING fetched_at`,
          [linked.student_profile_id, linked.username, snapshot.preview.calendar ? "SUCCESS" : "PARTIAL", JSON.stringify(snapshot.raw), JSON.stringify(snapshot.normalized), snapshot.apiVersion]);
        if (!saved.rows.length) throw new ProfileProviderError("The linked profile changed. Please reopen the preview.", { statusCode: 409 });
        return { profile: snapshot.preview, fetchedAt: saved.rows[0].fetched_at };
      };
      pending.set(key, fetchAndSave().finally(() => pending.delete(key)));
    }
    try {
      const result = await pending.get(key);
      failures.delete(key);
      res.json(wrap(result.profile, result.fetchedAt));
    } catch (error) {
      if (!(error instanceof ProfileProviderError)) throw error;
      if (failures.size >= 500) failures.delete(failures.keys().next().value);
      const failure = { code: error.code, message: error.code === "PROFILE_PROVIDER_RATE_LIMITED" ? "GitHub's request limit was reached. Please retry in a few minutes." : error.message };
      failures.set(key, { until: Date.now() + 60000, status: error.statusCode, error: failure });
      if (cached && error.statusCode !== 404 && error.statusCode !== 409) return res.json(wrap(cached, linked.fetched_at, true));
      res.status(error.statusCode).json({ error: failure });
    }
  } catch (error) { next(error); }
});
module.exports = router;
module.exports.isLegacyTokenCalendar = isLegacyTokenCalendar;
