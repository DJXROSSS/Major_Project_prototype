const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "placepro-dev-secret";

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers?.authorization;
    const bearerToken =
      authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;
    const token = req.cookies?.placepro_session || bearerToken;

    if (!token) {
      return res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Authentication required" },
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.role, u.title, u.status, u.must_change_password, u.auth_version, s.student_id
       FROM users u
       LEFT JOIN students s ON s.user_id = u.user_id OR s.email = u.email
       WHERE u.user_id = $1`,
      [decoded.userId]
    );

    if (!rows.length || rows[0].status !== "active") {
      res.clearCookie("placepro_session");
      return res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Session invalid or user inactive" },
      });
    }

    const user = rows[0];
    if (Number(decoded.authVersion ?? 0) !== Number(user.auth_version)) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in again" } });
    }
    const passwordFlow = (req.method === "GET" && req.path === "/auth/me") ||
      (req.method === "POST" && ["/auth/change-password", "/auth/logout"].includes(req.path));
    if (user.must_change_password && !passwordFlow) {
      return res.status(403).json({ error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Change your temporary password before continuing" } });
    }
    req.user = {
      id: Number(user.user_id),
      name: user.full_name,
      email: user.email,
      role: String(user.role).toLowerCase(),
      title: user.title || user.role,
      mustChangePassword: Boolean(user.must_change_password),
      authVersion: Number(user.auth_version),
      ...(user.student_id ? { studentId: String(user.student_id) } : {}),
    };
    next();
  } catch {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Invalid or expired session" },
    });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Insufficient role permissions" },
      });
    }
    next();
  };
}

async function requireStudentBatchAccess(req, res, next) {
  try {
    if (req.user?.role === "admin") return next();
    if (req.user?.role !== "trainer") return res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient role permissions" } });
    const { rows } = await pool.query(
      `SELECT 1 FROM students s JOIN academic_batches ab
       ON ab.academic_batch_id=s.academic_batch_id OR ab.name=s.batch
       WHERE s.student_id=$1 AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(ab.trainer_ids)='array' THEN ab.trainer_ids ELSE '[]'::jsonb END) trainer_id
         WHERE trainer_id=$2
       ) LIMIT 1`,
      [req.params.studentId, String(req.user.id)],
    );
    if (!rows.length) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" } });
    next();
  } catch (error) { next(error); }
}

module.exports = {
  requireAuth,
  requireRole,
  requireStudentBatchAccess,
};
