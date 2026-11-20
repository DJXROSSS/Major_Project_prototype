const { Router } = require("express");
const { pool, withTransaction } = require("../../../config/db");
const { requireAuth, requireRole, requireStudentBatchAccess } = require("../../../middleware/auth.middleware");
const { findStudentId, recomputeAndSyncStudentReadiness } = require("../../../utils/student-metrics");
const { fetchGithubRepository } = require("../providers/github.provider");
const { ProfileProviderError } = require("../providers/profile-provider-error");
const {
  PROJECT_FORMULA_VERSION,
  scoreProjectRepository,
  combineProjectScore,
} = require("../project-scoring");

const router = Router();

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function validId(value) {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n;
}

function parseGithubRepositoryUrl(value) {
  if (typeof value !== "string") return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" ||
      url.port || url.username || url.password || url.search || url.hash) {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const owner = parts[0];
  const repository = parts[1].replace(/\.git$/i, "");
  if (!/^[a-zA-Z0-9-]+$/.test(owner) ||
      !/^[a-zA-Z0-9._-]+$/.test(repository)) {
    return null;
  }
  return { owner, repository };
}


async function readProjects(studentId) {
  const { rows } = await pool.query(
    `SELECT p.project_id, p.project_name, p.description, p.repository_url,
            p.live_demo_url, p.is_fork, p.readme_present, p.has_tests,
            p.has_docker, p.has_ci, p.original_repo_owner, p.ownership_status,
            p.last_repository_sync_at, p.created_at, p.updated_at,
            latest.automatic_score, latest.trainer_score, latest.final_score,
            latest.formula_version, latest.automatic_breakdown, latest.computed_at,
            history.score_history,
            review.review_status, review.viva_completed, review.ownership_confirmed
     FROM projects p
     LEFT JOIN LATERAL (
       SELECT automatic_score, trainer_score, final_score, formula_version,
              automatic_breakdown, computed_at
       FROM project_score_snapshots
       WHERE project_id = p.project_id
       ORDER BY computed_at DESC, project_score_snapshot_id DESC
       LIMIT 1
     ) latest ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'automatic', automatic_score,
             'trainer', trainer_score,
             'final', final_score,
             'formulaVersion', formula_version,
             'computedAt', computed_at
           )
           ORDER BY computed_at DESC, project_score_snapshot_id DESC
         ),
         '[]'::JSON
       ) AS score_history
       FROM project_score_snapshots
       WHERE project_id = p.project_id
     ) history ON TRUE
     LEFT JOIN LATERAL (
       SELECT review_status, viva_completed, ownership_confirmed
       FROM project_reviews
       WHERE project_id = p.project_id
       ORDER BY created_at DESC, project_review_id DESC
       LIMIT 1
     ) review ON TRUE
     WHERE p.student_id = $1
     ORDER BY p.created_at DESC, p.project_id DESC`,
    [studentId]
  );
  return rows.map((row) => ({
    id: String(row.project_id),
    name: row.project_name,
    description: row.description,
    repositoryUrl: row.repository_url,
    liveDemoUrl: row.live_demo_url,
    isFork: row.is_fork,
    readmePresent: row.readme_present,
    hasTests: row.has_tests,
    hasDocker: row.has_docker,
    hasCi: row.has_ci,
    originalRepoOwner: row.original_repo_owner,
    ownershipStatus: row.ownership_status,
    lastSyncedAt: row.last_repository_sync_at,
    reviewStatus: row.review_status || "DRAFT",
    vivaCompleted: Boolean(row.viva_completed),
    ownershipConfirmed: Boolean(row.ownership_confirmed),
    score: row.formula_version
      ? {
          automatic: row.automatic_score === null ? null : Number(row.automatic_score),
          trainer: row.trainer_score === null ? null : Number(row.trainer_score),
          final: row.final_score === null ? null : Number(row.final_score),
          formulaVersion: row.formula_version,
          breakdown: row.automatic_breakdown,
          computedAt: row.computed_at,
        }
      : null,
    scoreHistory: row.score_history || [],
  }));
}

router.get("/me/projects", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    const studentId = req.user.studentId || await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    res.json({ items: await readProjects(studentId) });
  } catch (error) {
    next(error);
  }
});

router.post("/me/projects", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    const repository = parseGithubRepositoryUrl(req.body?.repositoryUrl);
    if (!repository) {
      return res.status(400).json({
        error: {
          code: "INVALID_REPOSITORY_URL",
          message: "Provide a public GitHub repository URL in the form https://github.com/owner/repository",
        },
      });
    }
    const studentId = req.user.studentId || await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    const { rows: profiles } = await pool.query(
      `SELECT student_profile_id, username
       FROM student_profiles
       WHERE student_id = $1 AND platform = 'GITHUB' AND verification_status = 'VERIFIED'
       ORDER BY verified_at DESC NULLS LAST, student_profile_id DESC`,
      [studentId]
    );
    if (!profiles.length) {
      return res.status(409).json({
        error: { code: "VERIFIED_GITHUB_REQUIRED", message: "Verify a GitHub profile before submitting projects" },
      });
    }
    let submittedDemoUrl = null;
    if (typeof req.body?.liveDemoUrl === "string" && req.body.liveDemoUrl.trim()) {
      submittedDemoUrl = req.body.liveDemoUrl.trim().slice(0, 2000);
      let demoUrl;
      try {
        demoUrl = new URL(submittedDemoUrl);
      } catch {
        return res.status(400).json({ error: { code: "INVALID_DEMO_URL", message: "Provide a valid live demo URL" } });
      }
      if (!["http:", "https:"].includes(demoUrl.protocol) || demoUrl.username || demoUrl.password) {
        return res.status(400).json({ error: { code: "INVALID_DEMO_URL", message: "Live demo URL must use HTTP or HTTPS and not contain credentials" } });
      }
    }

    let remote;
    try {
      remote = await fetchGithubRepository(repository.owner, repository.repository);
    } catch (error) {
      if (error instanceof ProfileProviderError) {
        return res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
    const remoteOwner = remote.repository.owner?.login;
    if (!remoteOwner || remoteOwner.toLowerCase() !== repository.owner.toLowerCase()) {
      return res.status(422).json({
        error: { code: "REPOSITORY_OWNER_MISMATCH", message: "The repository owner could not be verified" },
      });
    }

    const projectName = typeof req.body?.name === "string" && req.body.name.trim()
      ? req.body.name.trim().slice(0, 200)
      : remote.repository.name;
    const description = typeof req.body?.description === "string"
      ? req.body.description.trim().slice(0, 5000) || null
      : remote.repository.description || null;
    const canonicalUrl = remote.repository.html_url;
    if (typeof canonicalUrl !== "string" || !parseGithubRepositoryUrl(canonicalUrl)) {
      throw httpError(502, "PROFILE_PROVIDER_BAD_RESPONSE", "GitHub returned an invalid repository URL");
    }

    const linkedProfile = profiles.find((item) =>
      item.username.toLowerCase() === remoteOwner.toLowerCase()
    ) || profiles[0];
    const liveDemoUrl = submittedDemoUrl || remote.repository.homepage || null;
    if (liveDemoUrl) {
      let demoUrl;
      try {
        demoUrl = new URL(liveDemoUrl);
      } catch {
        throw httpError(502, "PROFILE_PROVIDER_BAD_RESPONSE", "GitHub returned an invalid project demo URL");
      }
      if (!["http:", "https:"].includes(demoUrl.protocol) || demoUrl.username || demoUrl.password) {
        throw httpError(502, "PROFILE_PROVIDER_BAD_RESPONSE", "GitHub returned an invalid project demo URL");
      }
    }
    const signals = {
      ...remote.signals,
      hasDemo: Boolean(liveDemoUrl),
    };
    const automatic = scoreProjectRepository(signals);
    const isOwnedRepo = remoteOwner.toLowerCase() === linkedProfile.username.toLowerCase() && !signals.isFork;
    const ownershipStatus = isOwnedRepo ? "VERIFIED" : "NEEDS_REVIEW";

    const result = await withTransaction(async (client) => {
      const { rows: inserted } = await client.query(
        `INSERT INTO projects
           (student_id, source_profile_id, project_name, description, repository_url,
            live_demo_url, is_fork, readme_present, has_tests, has_docker, has_ci,
            original_repo_owner, last_repository_sync_at, ownership_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
         RETURNING project_id`,
        [
          studentId,
          linkedProfile.student_profile_id,
          projectName,
          description,
          canonicalUrl,
          liveDemoUrl,
          signals.isFork,
          signals.readmePresent,
          signals.hasTests,
          signals.hasDocker,
          signals.hasCi,
          remoteOwner,
          ownershipStatus,
        ]
      );
      const projectId = inserted[0].project_id;
      const automaticBreakdown = {
        ...automatic.breakdown,
        signals,
        evidence: remote.evidence,
      };
      await client.query(
        `INSERT INTO project_contributions
           (project_id, student_id, platform_username, evidence)
         VALUES ($1, $2, $3, $4::JSONB)`,
        [
          projectId,
          studentId,
          linkedProfile.username,
          JSON.stringify({ repositoryOwner: remoteOwner, repositoryUrl: canonicalUrl }),
        ]
      );
      await client.query(
        `INSERT INTO project_score_snapshots
           (project_id, automatic_score, trainer_score, final_score,
            automatic_breakdown, formula_version)
         VALUES ($1, $2, NULL, NULL, $3::JSONB, $4)`,
        [projectId, automatic.score, JSON.stringify(automaticBreakdown), PROJECT_FORMULA_VERSION]
      );
      await recomputeAndSyncStudentReadiness(client, studentId);
      return { id: String(projectId), ownershipStatus, automaticScore: automatic.score };
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: { code: "PROJECT_ALREADY_SUBMITTED", message: "This repository has already been submitted for this student" },
      });
    }
    next(error);
  }
});

router.get("/students/:studentId/projects", requireAuth, requireRole(["admin", "trainer"]), requireStudentBatchAccess, async (req, res, next) => {
  try {
    if (!validId(req.params.studentId)) {
      return res.status(400).json({ error: { code: "INVALID_STUDENT_ID", message: "Student ID must be a positive integer" } });
    }
    const { rows } = await pool.query(`SELECT 1 FROM students WHERE student_id = $1`, [req.params.studentId]);
    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" } });
    }
    res.json({ items: await readProjects(req.params.studentId) });
  } catch (error) {
    next(error);
  }
});

router.post("/students/:studentId/projects/:projectId/reviews", requireAuth, requireRole(["admin", "trainer"]), requireStudentBatchAccess, async (req, res, next) => {
  try {
    if (!validId(req.params.studentId) || !validId(req.params.projectId)) {
      return res.status(400).json({ error: { code: "INVALID_ID", message: "Student and project IDs must be positive integers" } });
    }
    const trainerScore = Number(req.body?.trainerScore);
    if (!Number.isFinite(trainerScore) || trainerScore < 0 || trainerScore > 100) {
      return res.status(400).json({ error: { code: "INVALID_TRAINER_SCORE", message: "Trainer score must be between 0 and 100" } });
    }
    if (req.body?.ownershipConfirmed !== true) {
      return res.status(400).json({ error: { code: "OWNERSHIP_CONFIRMATION_REQUIRED", message: "Confirm project ownership before approving the review" } });
    }
    if (req.body?.vivaCompleted !== undefined && typeof req.body.vivaCompleted !== "boolean") {
      return res.status(400).json({ error: { code: "INVALID_VIVA_STATUS", message: "Viva status must be a boolean" } });
    }

    const result = await withTransaction(async (client) => {
      const { rows: projects } = await client.query(
        `SELECT project_id, student_id, ownership_status
         FROM projects
         WHERE project_id = $1 AND student_id = $2
         FOR UPDATE`,
        [req.params.projectId, req.params.studentId]
      );
      if (!projects.length) throw httpError(404, "NOT_FOUND", "Project not found for this student");
      const project = projects[0];

      const { rows: snapshots } = await client.query(
        `SELECT automatic_score, automatic_breakdown
         FROM project_score_snapshots
         WHERE project_id = $1
         ORDER BY computed_at DESC, project_score_snapshot_id DESC
         LIMIT 1`,
        [project.project_id]
      );
      if (!snapshots.length || snapshots[0].automatic_score === null) {
        throw httpError(409, "AUTOMATIC_SCORE_MISSING", "Project repository signals must be scored before review");
      }
      const automaticScore = Number(snapshots[0].automatic_score);
      const finalScore = combineProjectScore(automaticScore, trainerScore);
      const rubricScores = req.body?.rubricScores;
      if (rubricScores !== undefined && (!rubricScores || Array.isArray(rubricScores) || typeof rubricScores !== "object")) {
        throw httpError(400, "INVALID_RUBRIC", "Rubric scores must be an object");
      }
      const { rows: reviews } = await client.query(
        `INSERT INTO project_reviews
           (project_id, reviewer_id, rubric_scores, trainer_score, viva_completed,
            ownership_confirmed, review_status, reviewed_at)
         VALUES ($1, $2, $3::JSONB, $4, $5, TRUE, 'APPROVED', NOW())
         RETURNING project_review_id, reviewed_at`,
        [
          project.project_id,
          req.user.id,
          JSON.stringify(rubricScores || {}),
          trainerScore,
          req.body.vivaCompleted === true,
        ]
      );
      await client.query(
        `UPDATE projects
         SET ownership_status = 'VERIFIED', updated_at = NOW()
         WHERE project_id = $1`,
        [project.project_id]
      );
      await client.query(
        `INSERT INTO project_score_snapshots
           (project_id, project_review_id, automatic_score, trainer_score,
            final_score, automatic_breakdown, formula_version)
         VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7)`,
        [
          project.project_id,
          reviews[0].project_review_id,
          automaticScore,
          trainerScore,
          finalScore,
          JSON.stringify(snapshots[0].automatic_breakdown || {}),
          PROJECT_FORMULA_VERSION,
        ]
      );
      await recomputeAndSyncStudentReadiness(client, req.params.studentId);
      return {
        projectId: String(project.project_id),
        reviewId: String(reviews[0].project_review_id),
        automaticScore,
        trainerScore,
        finalScore,
        formulaVersion: PROJECT_FORMULA_VERSION,
        reviewedAt: reviews[0].reviewed_at,
      };
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
