require("dotenv/config");
const app = require("./app");
const { startServer } = require("../../shared/start-server");

const port = Number(process.env.DASHBOARD_SERVICE_PORT || 4002);
startServer(app, { name: "Dashboard service", port });
