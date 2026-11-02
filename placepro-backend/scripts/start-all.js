const { fork } = require("child_process");
const path = require("path");
const { logger } = require("../src/utils/logger");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env") });

const servers = [
  "src/services/auth/server.js",
  "src/services/dashboard/server.js",
  "src/services/students/server.js",
  "src/services/assessments/server.js",
  "src/services/companies/server.js",
  "src/services/admin/server.js",
  "src/gateway/server.js",
];

const children = servers.map((server) => fork(path.join(root, server), [], { stdio: "inherit", cwd: root }));
let isShuttingDown = false;

function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  children.forEach((child) => {
    if (child.connected && !child.killed) child.kill("SIGTERM");
  });
  setTimeout(() => process.exit(exitCode), 250).unref();
}

children.forEach((child, index) => {
  child.on("error", (error) => {
    logger.error("service.process_start_failed", error, { service: servers[index] });
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!isShuttingDown && code !== 0) {
      logger.error("service.process_exited", undefined, { service: servers[index], exitCode: code });
      shutdown(code || 1);
    }
  });
});

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
