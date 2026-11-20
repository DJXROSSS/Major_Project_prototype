const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Router } = require("express");
const { pool, withTransaction } = require("../../../config/db");
const { requireAuth, requireRole } = require("../../../middleware/auth.middleware");
const { getGithubUser, fetchGithubSnapshot, API_VERSION: GITHUB_API_VERSION } = require("../providers/github.provider");
const { ProfileProviderError, requestJson } = require("../providers/profile-provider-error");

const { findStudentId } = require("../../../utils/student-metrics");

const router = Router();
const maxVerificationAttempts = 5;
const challengeLifetimeMinutes = 30;

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function validateUsername(platform, value) {
  if (typeof value !== "string") return null;
  const username = value.trim();
  if (platform === "GITHUB") {
    return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)
      ? username.toLowerCase()
      : null;
  }
  return null;
}

function profileUrl(username) {
  return `https://github.com/${encodeURIComponent(username)}`;
}

function makeChallengeToken() {
  return `placepro-verify-${crypto.randomBytes(16).toString("hex")}`;
}

function challengeInstructions() {
  return "Temporarily set your GitHub profile bio to exactly the verification token, then verify within 30 minutes.";
}

async function createChallenge(client, profileId) {
  const token = makeChallengeToken();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const instructions = challengeInstructions();
  await client.query(
    `UPDATE profile_verification_challenges
     SET status = 'CANCELLED'
     WHERE student_profile_id = $1 AND status = 'PENDING'`,
    [profileId]
  );
  await client.query(
    `INSERT INTO profile_verification_challenges
       (student_profile_id, token_hash, instructions, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'))`,
    [profileId, tokenHash, instructions, challengeLifetimeMinutes]
  );
  return { token, instructions, expiresInMinutes: challengeLifetimeMinutes };
}


function apiErrorStatus(error) {
  return error instanceof ProfileProviderError ? error.statusCode : error.statusCode || 500;
}

function validProfileId(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value)) return false;
  return BigInt(value) <= 9223372036854775807n;
}

function providerFailureSnapshot(error) {
  return {
    code: error.code || "PROFILE_SYNC_FAILED",
    message: error instanceof ProfileProviderError ? error.message : "The profile could not be synchronized",
  };
}

async function writeFailedSnapshot(profileId, failure) {
  await pool.query(
    `INSERT INTO profile_snapshots
       (student_profile_id, fetch_status, error_code, error_message)
     VALUES ($1, 'FAILED', $2, $3)`,
    [profileId, failure.code, failure.message]
  );
  await pool.query(
    `UPDATE student_profiles SET last_fetched_at = NOW(), updated_at = NOW()
     WHERE student_profile_id = $1`,
    [profileId]
  );
}

function getOAuthConfig() {
  const { GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, GITHUB_OAUTH_REDIRECT_URI } = process.env;
  const stateSecret = process.env.PROFILE_OAUTH_STATE_SECRET;
  const encryptionKey = process.env.PROFILE_OAUTH_ENCRYPTION_KEY;
  if (!GITHUB_OAUTH_CLIENT_ID || !GITHUB_OAUTH_CLIENT_SECRET || !GITHUB_OAUTH_REDIRECT_URI ||
      !stateSecret || !encryptionKey) {
    return null;
  }

  const key = Buffer.from(encryptionKey, "base64");
  if (key.length !== 32) {
    throw httpError(500, "PROFILE_OAUTH_CONFIGURATION_ERROR", "OAuth encryption key must be 32 bytes encoded as base64");
  }
  if (stateSecret.length < 32) {
    throw httpError(500, "PROFILE_OAUTH_CONFIGURATION_ERROR", "OAuth state secret must contain at least 32 characters");
  }

  return {
    clientId: GITHUB_OAUTH_CLIENT_ID,
    clientSecret: GITHUB_OAUTH_CLIENT_SECRET,
    redirectUri: GITHUB_OAUTH_REDIRECT_URI,
    stateSecret,
    encryptionKey: key,
    keyVersion: process.env.PROFILE_OAUTH_KEY_VERSION || "v1",
  };
}

function encryptOAuthToken(token, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

router.get("/me/profiles", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    const studentId = await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    const { rows } = await pool.query(
      `SELECT sp.student_profile_id, sp.platform, sp.username, sp.profile_url,
              sp.verification_method, sp.verification_status, sp.verified_at,
              sp.last_fetched_at, sp.created_at, sp.updated_at,
              latest.snapshot_id, latest.fetch_status, latest.normalized_metrics,
              latest.error_code, latest.error_message, latest.fetched_at
       FROM student_profiles sp
       LEFT JOIN LATERAL (
         SELECT snapshot_id, fetch_status, normalized_metrics, error_code, error_message, fetched_at
         FROM profile_snapshots
         WHERE student_profile_id = sp.student_profile_id
         ORDER BY fetched_at DESC, snapshot_id DESC
         LIMIT 1
       ) latest ON TRUE
       WHERE sp.student_id = $1 AND sp.platform = 'GITHUB'
       ORDER BY sp.created_at DESC`,
      [studentId]
    );
    res.json({
      items: rows.map((row) => ({
        id: String(row.student_profile_id),
        platform: row.platform,
        username: row.username,
        profileUrl: row.profile_url,
        verificationMethod: row.verification_method,
        verificationStatus: row.verification_status,
        verifiedAt: row.verified_at,
        lastFetchedAt: row.last_fetched_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        latestSnapshot: row.snapshot_id
          ? {
              id: String(row.snapshot_id),
              status: row.fetch_status,
              metrics: row.normalized_metrics,
              error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
              fetchedAt: row.fetched_at,
            }
          : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/me/profiles", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    const platform = typeof req.body?.platform === "string" ? req.body.platform.toUpperCase() : "";
    const username = validateUsername(platform, req.body?.username);
    if (platform !== "GITHUB" || !username) {
      return res.status(400).json({
        error: {
          code: "INVALID_PROFILE",
          message: "Provide a valid GitHub username",
        },
      });
    }

    const studentId = await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    const result = await withTransaction(async (client) => {
      const { rows: existing } = await client.query(
        `SELECT student_profile_id, student_id
         FROM student_profiles
         WHERE platform = $1 AND lower(username) = lower($2)
         FOR UPDATE`,
        [platform, username]
      );
      if (existing.length) {
        throw httpError(409, "PROFILE_ALREADY_LINKED", "This provider profile is already linked");
      }

      const { rows } = await client.query(
        `INSERT INTO student_profiles
           (student_id, platform, username, profile_url, verification_method, verification_status)
         VALUES ($1, $2, $3, $4, 'PROFILE_TOKEN', 'PENDING')
         RETURNING student_profile_id`,
        [studentId, platform, username, profileUrl(username)]
      );
      const challenge = await createChallenge(client, rows[0].student_profile_id);
      return { id: String(rows[0].student_profile_id), challenge };
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: { code: "PROFILE_ALREADY_LINKED", message: "This provider profile is already linked" } });
    }
    next(error);
  }
});

router.patch("/me/profiles/:profileId", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    if (!validProfileId(req.params.profileId)) {
      return res.status(400).json({ error: { code: "INVALID_PROFILE_ID", message: "Profile ID must be a positive integer" } });
    }
    const studentId = await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT student_profile_id, platform, verification_method
         FROM student_profiles
         WHERE student_profile_id = $1 AND student_id = $2
         FOR UPDATE`,
        [req.params.profileId, studentId]
      );
      if (!rows.length) throw httpError(404, "NOT_FOUND", "Profile not found");
      const profile = rows[0];
      if (profile.platform !== "GITHUB") {
        throw httpError(410, "PROFILE_PLATFORM_REMOVED", "Only GitHub profiles are supported");
      }
      if (profile.verification_method === "OAUTH") {
        throw httpError(409, "OAUTH_PROFILE_READ_ONLY", "OAuth-linked usernames are managed by GitHub");
      }

      const username = validateUsername(profile.platform, req.body?.username);
      if (!username) throw httpError(400, "INVALID_PROFILE", "Provide a valid username for this platform");
      const { rows: conflictingProfiles } = await client.query(
        `SELECT student_profile_id
         FROM student_profiles
         WHERE platform = $1 AND lower(username) = lower($2)
           AND student_profile_id <> $3
         FOR UPDATE`,
        [profile.platform, username, profile.student_profile_id]
      );
      if (conflictingProfiles.length) {
        throw httpError(409, "PROFILE_ALREADY_LINKED", "This provider profile is already linked");
      }
      await client.query(
        `UPDATE student_profiles
         SET username = $1, profile_url = $2, verification_status = 'PENDING',
             verified_at = NULL, updated_at = NOW()
         WHERE student_profile_id = $3`,
        [username, profileUrl(username), profile.student_profile_id]
      );
      const challenge = await createChallenge(client, profile.student_profile_id);
      return { id: String(profile.student_profile_id), username, challenge };
    });
    res.json(result);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: { code: "PROFILE_ALREADY_LINKED", message: "This provider profile is already linked" } });
    }
    next(error);
  }
});

router.delete("/me/profiles/:profileId", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    if (!validProfileId(req.params.profileId)) {
      return res.status(400).json({ error: { code: "INVALID_PROFILE_ID", message: "Profile ID must be a positive integer" } });
    }
    const studentId = await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM student_profiles
       WHERE student_profile_id = $1 AND student_id = $2`,
      [req.params.profileId, studentId]
    );
    if (!rowCount) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Profile not found" } });
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/me/profiles/:profileId/verify", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    if (!validProfileId(req.params.profileId)) {
      return res.status(400).json({ error: { code: "INVALID_PROFILE_ID", message: "Profile ID must be a positive integer" } });
    }
    const studentId = await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    const { rows: profiles } = await pool.query(
      `SELECT student_profile_id, platform, username
       FROM student_profiles
       WHERE student_profile_id = $1 AND student_id = $2`,
      [req.params.profileId, studentId]
    );
    if (!profiles.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Profile not found" } });
    }
    const profile = profiles[0];
    if (profile.platform !== "GITHUB") {
      return res.status(410).json({ error: { code: "PROFILE_PLATFORM_REMOVED", message: "Only GitHub profiles are supported" } });
    }
    const { rows: challenges } = await pool.query(
      `SELECT challenge_id, token_hash, attempts, expires_at, instructions
       FROM profile_verification_challenges
       WHERE student_profile_id = $1 AND status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT 1`,
      [profile.student_profile_id]
    );
    if (!challenges.length) {
      return res.status(409).json({ error: { code: "NO_PENDING_CHALLENGE", message: "Create or update the profile to get a new verification token" } });
    }
    const challenge = challenges[0];
    if (new Date(challenge.expires_at) <= new Date() || challenge.attempts >= maxVerificationAttempts) {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE profile_verification_challenges SET status = 'EXPIRED'
           WHERE challenge_id = $1 AND status = 'PENDING'`,
          [challenge.challenge_id]
        );
        await client.query(
          `UPDATE student_profiles SET verification_status = 'EXPIRED', updated_at = NOW()
           WHERE student_profile_id = $1 AND verification_status = 'PENDING'`,
          [profile.student_profile_id]
        );
      });
      return res.status(410).json({ error: { code: "CHALLENGE_EXPIRED", message: "The verification token has expired; update the profile to generate another" } });
    }

    let remoteProfile;
    try {
      remoteProfile = await getGithubUser(profile.username);
    } catch (error) {
      if (error instanceof ProfileProviderError) {
        return res.status(apiErrorStatus(error)).json({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }

    const remoteFields = [remoteProfile.bio];
    const challengeHash = Buffer.from(challenge.token_hash, "hex");
    const verified = remoteFields.some((field) => {
      if (typeof field !== "string") return false;
      const remoteHash = crypto.createHash("sha256").update(field.trim()).digest();
      return remoteHash.length === challengeHash.length && crypto.timingSafeEqual(remoteHash, challengeHash);
    });

    const updated = await withTransaction(async (client) => {
      const { rows: locked } = await client.query(
        `SELECT status, token_hash, attempts, expires_at
         FROM profile_verification_challenges
         WHERE challenge_id = $1
         FOR UPDATE`,
        [challenge.challenge_id]
      );
      if (!locked.length || locked[0].status !== "PENDING" || locked[0].token_hash !== challenge.token_hash) {
        throw httpError(409, "CHALLENGE_CHANGED", "The verification challenge is no longer active");
      }
      if (new Date(locked[0].expires_at) <= new Date()) {
        await client.query(
          `UPDATE profile_verification_challenges SET status = 'EXPIRED' WHERE challenge_id = $1`,
          [challenge.challenge_id]
        );
        await client.query(
          `UPDATE student_profiles SET verification_status = 'EXPIRED', updated_at = NOW()
           WHERE student_profile_id = $1 AND verification_status = 'PENDING'`,
          [profile.student_profile_id]
        );
        return { expired: true };
      }
      if (verified) {
        await client.query(
          `UPDATE profile_verification_challenges
           SET status = 'VERIFIED', verified_at = NOW()
           WHERE challenge_id = $1`,
          [challenge.challenge_id]
        );
        await client.query(
          `UPDATE student_profiles
           SET verification_status = 'VERIFIED', verified_at = NOW(), updated_at = NOW()
           WHERE student_profile_id = $1`,
          [profile.student_profile_id]
        );
        return { verified: true };
      }

      const attempts = locked[0].attempts + 1;
      if (attempts >= maxVerificationAttempts) {
        await client.query(
          `UPDATE profile_verification_challenges
           SET attempts = $1, status = 'EXPIRED'
           WHERE challenge_id = $2`,
          [attempts, challenge.challenge_id]
        );
        await client.query(
          `UPDATE student_profiles SET verification_status = 'REJECTED', updated_at = NOW()
           WHERE student_profile_id = $1`,
          [profile.student_profile_id]
        );
      } else {
        await client.query(
          `UPDATE profile_verification_challenges SET attempts = $1 WHERE challenge_id = $2`,
          [attempts, challenge.challenge_id]
        );
      }
      return { verified: false, attemptsRemaining: Math.max(0, maxVerificationAttempts - attempts) };
    });

    if (updated.expired) {
      return res.status(410).json({ error: { code: "CHALLENGE_EXPIRED", message: "The verification token has expired" } });
    }
    if (!updated.verified) {
      return res.status(422).json({
        error: {
          code: "OWNERSHIP_NOT_VERIFIED",
          message: "The verification token was not found in the provider profile",
          attemptsRemaining: updated.attemptsRemaining,
        },
      });
    }
    res.json({ id: String(profile.student_profile_id), verificationStatus: "VERIFIED" });
  } catch (error) {
    next(error);
  }
});

router.post("/me/profiles/:profileId/sync", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    if (!validProfileId(req.params.profileId)) {
      return res.status(400).json({ error: { code: "INVALID_PROFILE_ID", message: "Profile ID must be a positive integer" } });
    }
    const studentId = await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    const { rows } = await pool.query(
      `SELECT student_profile_id, platform, username, verification_status
       FROM student_profiles
       WHERE student_profile_id = $1 AND student_id = $2`,
      [req.params.profileId, studentId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Profile not found" } });
    }
    const profile = rows[0];
    if (profile.platform !== "GITHUB") {
      return res.status(410).json({ error: { code: "PROFILE_PLATFORM_REMOVED", message: "Only GitHub profiles are supported" } });
    }
    if (profile.verification_status !== "VERIFIED") {
      return res.status(409).json({ error: { code: "PROFILE_NOT_VERIFIED", message: "Verify profile ownership before synchronizing" } });
    }

    let snapshot;
    try {
      snapshot = await fetchGithubSnapshot(profile.username);
    } catch (error) {
      const failure = providerFailureSnapshot(error);
      await writeFailedSnapshot(profile.student_profile_id, failure);
      if (error instanceof ProfileProviderError) {
        return res.status(apiErrorStatus(error)).json({ error: failure });
      }
      throw error;
    }

    const result = await withTransaction(async (client) => {
      const { rows: savedSnapshots } = await client.query(
        `INSERT INTO profile_snapshots
           (student_profile_id, fetch_status, raw_metrics, normalized_metrics, provider_api_version)
         VALUES ($1, 'SUCCESS', $2::JSONB, $3::JSONB, $4)
         RETURNING snapshot_id, fetched_at`,
        [
          profile.student_profile_id,
          JSON.stringify(snapshot.raw),
          JSON.stringify(snapshot.normalized),
          snapshot.apiVersion || GITHUB_API_VERSION,
        ]
      );
      const saved = savedSnapshots[0];
      await client.query(
        `UPDATE student_profiles
         SET last_fetched_at = $1, updated_at = NOW()
         WHERE student_profile_id = $2`,
        [saved.fetched_at, profile.student_profile_id]
      );

      return { snapshotId: String(saved.snapshot_id), fetchedAt: saved.fetched_at };
    });
    res.json({
      ...result,
      status: "SUCCESS",
      metrics: snapshot.normalized,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/me/profiles/github/oauth/start", requireAuth, requireRole(["student"]), async (req, res, next) => {
  try {
    const config = getOAuthConfig();
    if (!config) {
      return res.status(503).json({
        error: { code: "OAUTH_NOT_CONFIGURED", message: "GitHub OAuth has not been configured" },
      });
    }
    const studentId = await findStudentId(pool, req.user);
    if (!studentId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student profile not linked" } });
    }
    const state = jwt.sign(
      {
        studentId,
        userId: req.user.id,
        email: req.user.email,
        nonce: crypto.randomBytes(16).toString("hex"),
      },
      config.stateSecret,
      { expiresIn: "10m", audience: "placepro-profile-oauth", issuer: "placepro" }
    );
    const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizationUrl.searchParams.set("scope", "read:user");
    authorizationUrl.searchParams.set("state", state);
    res.json({ authorizationUrl: authorizationUrl.toString() });
  } catch (error) {
    next(error);
  }
});

router.get("/me/profiles/github/oauth/callback", async (req, res, next) => {
  try {
    const config = getOAuthConfig();
    if (!config) {
      return res.status(503).json({
        error: { code: "OAUTH_NOT_CONFIGURED", message: "GitHub OAuth has not been configured" },
      });
    }
    if (typeof req.query.error === "string") {
      return res.status(400).json({ error: { code: "OAUTH_DENIED", message: "GitHub authorization was not approved" } });
    }
    if (typeof req.query.code !== "string" || typeof req.query.state !== "string") {
      return res.status(400).json({ error: { code: "INVALID_OAUTH_CALLBACK", message: "GitHub did not return an authorization code and state" } });
    }

    let state;
    try {
      state = jwt.verify(req.query.state, config.stateSecret, {
        audience: "placepro-profile-oauth",
        issuer: "placepro",
      });
    } catch {
      return res.status(400).json({ error: { code: "INVALID_OAUTH_STATE", message: "The GitHub authorization state is invalid or expired" } });
    }

    let tokenResponse;
    try {
      tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: req.query.code,
          redirect_uri: config.redirectUri,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ProfileProviderError("GitHub OAuth token exchange failed", { code: "OAUTH_TOKEN_EXCHANGE_FAILED" });
    }
    if (!tokenResponse.ok) {
      throw new ProfileProviderError("GitHub OAuth token exchange failed", { code: "OAUTH_TOKEN_EXCHANGE_FAILED" });
    }
    let tokenData;
    try {
      tokenData = await tokenResponse.json();
    } catch {
      throw new ProfileProviderError("GitHub returned an invalid OAuth token response", {
        code: "PROFILE_PROVIDER_BAD_RESPONSE",
      });
    }
    if (typeof tokenData.access_token !== "string" || tokenData.error) {
      throw new ProfileProviderError("GitHub OAuth token exchange failed", { code: "OAUTH_TOKEN_EXCHANGE_FAILED" });
    }
    const remoteProfile = await requestGithubAuthenticatedUser(tokenData.access_token);
    const username = validateUsername("GITHUB", remoteProfile.login);
    if (!username) throw new ProfileProviderError("GitHub returned an invalid username", { code: "PROFILE_PROVIDER_BAD_RESPONSE" });

    const result = await withTransaction(async (client) => {
      const { rows: students } = await client.query(
        `SELECT student_id FROM students
         WHERE student_id = $1
           AND (user_id = $2 OR (user_id IS NULL AND email = $3))`,
        [state.studentId, state.userId, state.email]
      );
      if (!students.length) throw httpError(400, "INVALID_OAUTH_STATE", "The student account linked to this authorization no longer exists");

      const { rows: existing } = await client.query(
        `SELECT student_profile_id, student_id
         FROM student_profiles
         WHERE platform = 'GITHUB' AND lower(username) = lower($1)
         FOR UPDATE`,
        [username]
      );
      if (existing.length && String(existing[0].student_id) !== String(state.studentId)) {
        throw httpError(409, "PROFILE_ALREADY_LINKED", "This GitHub account is already linked to another student");
      }

      let profileId;
      if (existing.length) {
        profileId = existing[0].student_profile_id;
        await client.query(
          `UPDATE student_profiles
           SET username = $1, profile_url = $2, verification_method = 'OAUTH',
               verification_status = 'VERIFIED', verified_at = NOW(), updated_at = NOW()
           WHERE student_profile_id = $3`,
          [username, profileUrl(username), profileId]
        );
        await client.query(
          `UPDATE profile_verification_challenges
           SET status = 'CANCELLED'
           WHERE student_profile_id = $1 AND status = 'PENDING'`,
          [profileId]
        );
      } else {
        const { rows } = await client.query(
          `INSERT INTO student_profiles
             (student_id, platform, username, profile_url, verification_method, verification_status, verified_at)
           VALUES ($1, 'GITHUB', $2, $3, 'OAUTH', 'VERIFIED', NOW())
           RETURNING student_profile_id`,
          [state.studentId, username, profileUrl(username)]
        );
        profileId = rows[0].student_profile_id;
      }

      await client.query(
        `INSERT INTO profile_oauth_credentials
           (student_profile_id, provider, access_token_ciphertext, refresh_token_ciphertext,
            encryption_key_version, scopes, token_expires_at, revoked_at)
         VALUES ($1, 'GITHUB', $2, $3, $4, $5, $6, NULL)
         ON CONFLICT (student_profile_id) DO UPDATE
         SET provider = EXCLUDED.provider,
             access_token_ciphertext = EXCLUDED.access_token_ciphertext,
             refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
             encryption_key_version = EXCLUDED.encryption_key_version,
             scopes = EXCLUDED.scopes,
             token_expires_at = EXCLUDED.token_expires_at,
             revoked_at = NULL,
             updated_at = NOW()`,
        [
          profileId,
          encryptOAuthToken(tokenData.access_token, config.encryptionKey),
          typeof tokenData.refresh_token === "string"
            ? encryptOAuthToken(tokenData.refresh_token, config.encryptionKey)
            : null,
          config.keyVersion,
          typeof tokenData.scope === "string" ? tokenData.scope.split(" ").filter(Boolean) : ["read:user"],
          tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : null,
        ]
      );
      return { id: String(profileId), username };
    });
    res.json({ ...result, platform: "GITHUB", verificationStatus: "VERIFIED" });
  } catch (error) {
    next(error);
  }
});

async function requestGithubAuthenticatedUser(accessToken) {
  try {
    return await requestJson("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    });
  } catch (error) {
    throw new ProfileProviderError("GitHub could not validate the authorized account", {
      code: error.code || "OAUTH_ACCOUNT_LOOKUP_FAILED",
      statusCode: error.statusCode || 502,
    });
  }
}

module.exports = router;
