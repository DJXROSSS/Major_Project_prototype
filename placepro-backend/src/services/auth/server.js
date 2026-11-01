require("dotenv/config");
const app = require("./app");
const { startServer } = require("../../shared/start-server");

const port = Number(process.env.AUTH_SERVICE_PORT || 4001);
startServer(app, { name: "Auth service", port });
