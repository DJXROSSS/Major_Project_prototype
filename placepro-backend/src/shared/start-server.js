const { logger } = require("../utils/logger");

function startServer(app, { name, port }) {
  process.env.SERVICE_NAME = name;
  const server = app.listen(port, () => {
    logger.info("server.started", { port });
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      logger.error("server.port_in_use", error, { port });
    } else {
      logger.error("server.start_failed", error, { port });
    }
    process.exit(1);
  });

  return server;
}

module.exports = { startServer };
