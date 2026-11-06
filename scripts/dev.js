const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

console.log("\x1b[36m%s\x1b[0m", "=================================================");
console.log("\x1b[36m%s\x1b[0m", "  Starting PlacePro Backend & Frontend Dev Servers");
console.log("\x1b[36m%s\x1b[0m", "  - Gateway & API: http://localhost:5000");
console.log("\x1b[36m%s\x1b[0m", "  - Frontend:      http://localhost:3000");
console.log("\x1b[36m%s\x1b[0m", "=================================================");

const backend = spawn(npmCmd, ["run", "dev"], {
  cwd: path.join(root, "placepro-backend"),
  stdio: "inherit",
  shell: isWin,
});

const frontend = spawn(npmCmd, ["run", "dev"], {
  cwd: path.join(root, "placepro-frontend"),
  stdio: "inherit",
  shell: isWin,
});

let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n\x1b[33m%s\x1b[0m", "Shutting down PlacePro services...");

  if (isWin) {
    if (backend && backend.pid) {
      try { spawn("taskkill", ["/pid", backend.pid.toString(), "/t", "/f"]); } catch (_) {}
    }
    if (frontend && frontend.pid) {
      try { spawn("taskkill", ["/pid", frontend.pid.toString(), "/t", "/f"]); } catch (_) {}
    }
  } else {
    try { backend.kill("SIGTERM"); } catch (_) {}
    try { frontend.kill("SIGTERM"); } catch (_) {}
  }

  setTimeout(() => process.exit(0), 500).unref();
}

backend.on("exit", (code) => {
  if (!isShuttingDown && code !== 0) {
    console.error(`\x1b[31mBackend exited with code ${code}\x1b[0m`);
    shutdown();
  }
});

frontend.on("exit", (code) => {
  if (!isShuttingDown && code !== 0) {
    console.error(`\x1b[31mFrontend exited with code ${code}\x1b[0m`);
    shutdown();
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
