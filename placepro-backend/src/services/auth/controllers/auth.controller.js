const { Router } = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, writeAuditLog } = require("../../../config/db");
const { requireAuth } = require("../../../middleware/auth.middleware");

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "placepro-dev-secret";

router.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query(
      `SELECT u.*, s.student_id
       FROM users u
       LEFT JOIN students s ON s.user_id = u.user_id
       WHERE LOWER(u.email) = LOWER($1)`,
      [email]
    );

    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
      });
    }

    const u = rows[0];
    if (u.status !== "active") {
      return res.status(403).json({
        error: { code: "ACCOUNT_INACTIVE", message: "Account is deactivated" },
      });
    }

    await pool.query(`UPDATE users SET last_active = NOW() WHERE user_id = $1`, [u.user_id]);

    const token = jwt.sign({ userId: u.user_id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("placepro_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await writeAuditLog(u.user_id, u.full_name, "Auth", "User signed in", "success");

    return res.json({
      token,
      user: {
        id: String(u.user_id),
        name: u.full_name,
        email: u.email,
        role: String(u.role).toLowerCase(),
        title: u.title || u.role,
        ...(u.student_id ? { studentId: String(u.student_id) } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: String(req.user.id),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      title: req.user.title,
      ...(req.user.studentId ? { studentId: req.user.studentId } : {}),
    },
  });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  await writeAuditLog(req.user.id, req.user.name, "Auth", "User signed out", "success");
  res.clearCookie("placepro_session");
  res.status(204).send();
});

module.exports = router;
