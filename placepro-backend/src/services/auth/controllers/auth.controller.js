"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../../../config/db");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const JWT_SECRET = process.env.JWT_SECRET || "placepro-dev-secret";
router.post("/auth/login", async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const { rows } = await db_1.pool.query(`SELECT u.*, s.student_id
       FROM users u
       LEFT JOIN students s ON s.user_id = u.user_id
       WHERE LOWER(u.email) = LOWER($1)`, [email]);
        if (!rows.length || !(await bcryptjs_1.default.compare(password, rows[0].password_hash))) {
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
        await db_1.pool.query(`UPDATE users SET last_active = NOW() WHERE user_id = $1`, [u.user_id]);
        const token = jsonwebtoken_1.default.sign({ userId: u.user_id }, JWT_SECRET, { expiresIn: "7d" });
        res.cookie("placepro_session", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        await (0, db_1.writeAuditLog)(u.user_id, u.full_name, "Auth", "User signed in", "success");
        return res.json({
            user: {
                id: String(u.user_id),
                name: u.full_name,
                email: u.email,
                role: String(u.role).toLowerCase(),
                title: u.title || u.role,
                ...(u.student_id ? { studentId: String(u.student_id) } : {}),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.get("/auth/me", auth_middleware_1.requireAuth, (req, res) => {
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
router.post("/auth/logout", auth_middleware_1.requireAuth, async (req, res) => {
    await (0, db_1.writeAuditLog)(req.user.id, req.user.name, "Auth", "User signed out", "success");
    res.clearCookie("placepro_session");
    res.status(204).send();
});
exports.default = router;
