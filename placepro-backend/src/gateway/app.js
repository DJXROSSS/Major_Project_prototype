const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { createProxy } = require("./proxy.middleware");
const { errorHandler } = require("../middleware/error.middleware");
const { requestLogger } = require("../middleware/request-logger.middleware");

const app = express();
const serviceUrl = (name, fallbackPort) => process.env[`${name}_SERVICE_URL`] || `http://127.0.0.1:${fallbackPort}`;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(requestLogger("gateway"));

app.get("/api", (_req, res) => res.status(200).json({ message: "Hello, world!" }));

app.use("/api/v1/auth", createProxy(serviceUrl("AUTH", 4001)));
app.use("/api/v1/dashboard", createProxy(serviceUrl("DASHBOARD", 4002)));
app.use(["/api/v1/students", "/api/v1/me"], createProxy(serviceUrl("STUDENTS", 4003)));
app.use(["/api/v1/assessments", "/api/v1/assessment-imports"], createProxy(serviceUrl("ASSESSMENTS", 4004)));
app.use("/api/v1/companies", createProxy(serviceUrl("COMPANIES", 4005)));
app.use(["/api/v1/users", "/api/v1/batches", "/api/v1/skills", "/api/v1/audit-logs", "/api/v1/import-student-reviews"], createProxy(serviceUrl("ADMIN", 4006)));

app.use(errorHandler);

module.exports = app;
