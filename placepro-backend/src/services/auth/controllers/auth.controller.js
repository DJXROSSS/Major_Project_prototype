const { Router } = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, withTransaction, writeAuditLog } = require("../../../config/db");
const { requireAuth } = require("../../../middleware/auth.middleware");
const { authRateLimit } = require("../../../middleware/auth-rate-limit");
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "placepro-dev-secret";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 };
function session(res, u) {
  const token = jwt.sign({ userId: u.user_id, authVersion: Number(u.auth_version) }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("placepro_session", token, cookieOptions);
  return { token, user: { id: String(u.user_id), name: u.full_name, email: u.email, role: String(u.role).toLowerCase(),
    title: u.title || u.role, mustChangePassword: Boolean(u.must_change_password), ...(u.student_id ? { studentId: String(u.student_id) } : {}) } };
}
const denied = res => res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
router.post("/auth/login", authRateLimit(), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || password.length > 256) return denied(res);
    const { rows } = await pool.query(`SELECT u.*, s.student_id FROM users u LEFT JOIN students s ON s.user_id=u.user_id WHERE lower(btrim(u.email))=$1`, [email.trim().toLowerCase()]);
    const u = rows[0];
    if (!u || u.status !== "active" || !(await bcrypt.compare(password, u.password_hash))) return denied(res);
    await writeAuditLog(u.user_id, u.full_name, "Auth", "User signed in", "success");
    res.json(session(res, u));
  } catch (error) { next(error); }
});
router.get("/auth/me", requireAuth, (req, res) => {
  const { authVersion, ...user } = req.user;
  res.json({ user: { ...user, id: String(user.id) } });
});
router.post("/auth/change-password", requireAuth, authRateLimit(), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== "string" || typeof newPassword !== "string" ||
        newPassword.length < 12 || Buffer.byteLength(newPassword, "utf8") > 72 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "New password must contain at least 12 characters, letters and numbers, and be at most 72 UTF-8 bytes" } });
    }
    const u = await withTransaction(async client => {
      const { rows } = await client.query(`SELECT * FROM users WHERE user_id=$1 FOR UPDATE`, [req.user.id]);
      const user = rows[0];
      if (!user || user.status !== 'active' || Number(user.auth_version) !== req.user.authVersion || !(await bcrypt.compare(currentPassword, user.password_hash))) {
        const error = new Error("Current password is incorrect or session expired"); error.statusCode = 401; throw error;
      }
      if (newPassword === user.mobile_number || await bcrypt.compare(newPassword, user.password_hash)) {
        const error = new Error("Choose a new password different from your current password and mobile number"); error.statusCode = 400; throw error;
      }
      const hash = await bcrypt.hash(newPassword, 12);
      const updated = await client.query(`UPDATE users SET password_hash=$1, must_change_password=FALSE, auth_version=auth_version+1 WHERE user_id=$2 RETURNING *`, [hash, user.user_id]);
      await client.query(`INSERT INTO audit_logs (actor_id,actor_name,module,action,status) VALUES ($1,$2,'Auth','Password changed','success')`, [user.user_id,user.full_name]);
      const linked = await client.query(`SELECT student_id FROM students WHERE user_id=$1`, [user.user_id]);
      return { ...updated.rows[0], student_id: linked.rows[0]?.student_id };
    });
    res.json(session(res, u));
  } catch (error) { next(error); }
});
router.post("/auth/logout", requireAuth, async (req, res, next) => {
  try {
    await writeAuditLog(req.user.id, req.user.name, "Auth", "User signed out", "success");
    res.clearCookie("placepro_session"); res.status(204).send();
  } catch (error) { next(error); }
});
module.exports = router;
