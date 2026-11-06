require("dotenv/config");
const app = require("./app");
const { startServer } = require("../../shared/start-server");

const port = Number(process.env.ADMIN_SERVICE_PORT || 4006);
startServer(app, { name: "Admin service", port });
