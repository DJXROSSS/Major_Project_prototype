const { randomUUID } = require("crypto");
const { logger } = require("../utils/logger");

function requestLogger(service) {
  return (req, res, next) => {
    const requestId = typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].length <= 100
      ? req.headers["x-request-id"]
      : randomUUID();
    const startedAt = process.hrtime.bigint();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const context = { service, requestId, method: req.method, path: req.originalUrl, statusCode: res.statusCode, durationMs: Math.round(durationMs) };
      if (res.statusCode >= 500) logger.error("request.completed", undefined, context);
      else if (res.statusCode >= 400) logger.warn("request.completed", context);
      else logger.info("request.completed", context);
    });
    next();
  };
}

module.exports = { requestLogger };
