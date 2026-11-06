const { logger } = require("../utils/logger");

function errorHandler(err, req, res, _next) {
  logger.error("request.failed", err, {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: err.statusCode || 500,
  });

  res.status(err.statusCode || 500).json({
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected error occurred",
    },
  });
}

module.exports = { errorHandler };
