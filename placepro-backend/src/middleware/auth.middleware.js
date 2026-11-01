"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const JWT_SECRET = process.env.JWT_SECRET || "placepro-dev-secret";
async function requireAuth(req, res, next) {
    try {
        const token = req.cookies?.placepro_session;
        if (!token) {
            return res.status(401).json({
                error: { code: "UNAUTHENTICATED", message: "Authentication required" },
            });
        }
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { rows } = await db_1.pool.query(`SELECT u.user_id, u.full_name, u.email, u.role, u.title, u.status, s.student_id
       FROM users u
       LEFT JOIN students s ON s.user_id = u.user_id
       WHERE u.user_id = $1`, [decoded.userId]);
        if (!rows.length || rows[0].status !== "active") {
            res.clearCookie("placepro_session");
            return res.status(401).json({
                error: { code: "UNAUTHENTICATED", message: "Session invalid or user inactive" },
            });
        }
        const user = rows[0];
        req.user = {
            id: Number(user.user_id),
            name: user.full_name,
            email: user.email,
            role: String(user.role).toLowerCase(),
            title: user.title || user.role,
            ...(user.student_id ? { studentId: String(user.student_id) } : {}),
        };
        next();
    }
    catch {
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
